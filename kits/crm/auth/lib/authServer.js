// Kit CRM (methode-travail) — origine : KHI Educ, lib/authServer.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canAccess, requiredRole } from "@/lib/roles";
import { hashApiKey, isApiKey } from "@/lib/apiKeys";
import { MFA_MESSAGES, MFA_SPACE_MESSAGES, isEnrolled, mfaRequiredForRole, mfaState, sessionAal } from "@/lib/mfa";
import { isTrustedSession, sessionIdOf } from "@/lib/mfaTrust";

// Vérifie le jeton Bearer Supabase et renvoie l'utilisateur (ou null).
export const getUserFromRequest = async (request) => {
    const token = bearerOf(request);
    if (!token || isApiKey(token)) return null;
    const supabase = getSupabaseAdmin();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
};

const safePathname = (url) => {
    try {
        return new URL(url).pathname;
    } catch {
        return "";
    }
};

const bearerOf = (request) => {
    const header = request.headers.get("authorization") || "";
    return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

// Session de confiance (appareil retenu 30 jours, lib/mfaTrust.js) : lue seulement quand elle peut changer la
// décision — facteur inscrit et session encore en aal1 (une requête de plus dans ce cas seulement).
const trustedFor = async (supabase, user, token) =>
    isEnrolled(user) && sessionAal(token) !== "aal2"
        ? isTrustedSession(supabase, { userId: user.id, sessionId: sessionIdOf(token) })
        : false;

// Utilisateur connecté (n'importe quel rôle) et état de sa double authentification, session de confiance
// comprise → { user, token, mfa } ou null. Pour les routes /v1/auth/mfa/* (appareils de confiance).
export const getUserWithMfa = async (request) => {
    const user = await getUserFromRequest(request);
    if (!user) return null;
    const token = bearerOf(request);
    const mfa = mfaState(user, token, { requiredForAll: false, trusted: await trustedFor(getSupabaseAdmin(), user, token) });
    return { user, token, mfa };
};

// Pourquoi une requête admin a été refusée (401 vs 403), par requête.
const denials = new WeakMap();

// Vérifie que l'appelant est un membre de l'équipe (liste blanche ou clé API)
// ET que son rôle suffit pour cette route (lib/roles.js).
// Renvoie { id?, email, role, via: "session" | "api_key", api_key_id? } ou null ;
// en cas de refus, `deny(request)` donne la bonne réponse (401 ou 403).
export const getAdminFromRequest = async (request) => {
    const token = bearerOf(request);
    if (!token) return null;
    const supabase = getSupabaseAdmin();
    let admin = null;

    if (isApiKey(token)) {
        const { data } = await supabase
            .from("api_keys")
            .select("id, name, role, revoked_at, last_used_at")
            .eq("key_hash", hashApiKey(token))
            .maybeSingle();
        if (data && !data.revoked_at) {
            admin = { email: `api:${data.name}`, role: data.role, via: "api_key", api_key_id: data.id };
            // Dernière utilisation : au plus une écriture par minute par clé
            if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
                supabase
                    .from("api_keys")
                    .update({ last_used_at: new Date().toISOString() })
                    .eq("id", data.id)
                    .then(() => {}, () => {});
            }
        }
    } else {
        // Point d'extension : un autre type de jeton (ex. OAuth d'un connecteur MCP qui hérite du rôle
        // d'une clé d'API) se branche ici, AVANT getUserFromRequest, avec son propre préfixe — et
        // getUserFromRequest doit alors le refuser aussi (comme isApiKey ci-dessus). via: "mcp" ou autre :
        // tout ce qui n'est pas "session" échappe à la double authentification, à décider en connaissance.
        const user = await getUserFromRequest(request);
        if (user) {
            // Comparaison exacte : la liste blanche est en minuscules (contrainte de 0001_equipe_acces.sql),
            // comme les adresses de Supabase Auth.
            const { data } = await supabase
                .from("admin_allowlist")
                .select("email, role, name")
                .eq("email", user.email)
                .maybeSingle();
            if (data) admin = { ...user, role: data.role || "admin", name: data.name || null, via: "session" };
        }
    }
    if (!admin) return null;

    const method = request.method;
    const pathname = request.nextUrl?.pathname || safePathname(request.url);
    if (!canAccess(admin.role, method, pathname)) {
        denials.set(request, { status: 403, required: requiredRole(method, pathname), role: admin.role });
        return null;
    }
    // Double authentification (lib/mfa.js) : sessions de l'équipe seulement (clés d'API non
    // concernées). /v1/admin/me répond toujours, avec l'état, pour que l'écran demande le
    // code ou propose l'inscription.
    if (admin.via === "session") {
        admin.mfa = mfaState(admin, token, { trusted: await trustedFor(supabase, admin, token) });
        if (!admin.mfa.satisfied && pathname !== "/v1/admin/me") {
            denials.set(request, { status: 403, code: admin.mfa.code });
            return null;
        }
    }
    return admin;
};

// Réponse à renvoyer quand getAdminFromRequest ou getUserWithRole a rendu null.
export const deny = (request) => {
    const d = request ? denials.get(request) : null;
    if (d?.code) {
        return NextResponse.json({ detail: d.detail || MFA_MESSAGES[d.code] || "Double authentification requise.", code: d.code }, { status: 403 });
    }
    if (d?.status === 403) {
        return NextResponse.json(
            { detail: `Accès réservé au rôle ${d.required} (vous : ${d.role})`, required_role: d.required },
            { status: 403 },
        );
    }
    return NextResponse.json({ detail: "Non authentifié" }, { status: 401 });
};

// Vérifie le rôle exact via la table profiles, puis la double authentification (lib/mfa.js).
// Renvoie { user, profile, mfa } ou null ; en cas de refus, `deny(request)` donne la réponse.
// Rôles de MFA_ALWAYS_ROLES (espaces clients) : facteur vérifié ET session aal2 toujours exigés → sinon
// 403 { detail, code: "mfa_required" | "mfa_enrollment_required" }, comme pour l'équipe. Ces routes
// lisent avec service_role : sans ce contrôle, les politiques aal2 de la base seraient contournées.
// Rôle vérifié d'abord : un compte d'un autre rôle reçoit 401, jamais une invitation à inscrire un
// facteur. GET /v1/auth/role n'utilise pas cette fonction (routage après connexion, en aal1).
export const getUserWithRole = async (request, role) => {
    const user = await getUserFromRequest(request);
    if (!user) return null;
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
    if (!profile || profile.role !== role) return null;
    const token = bearerOf(request);
    const mfa = mfaState(user, token, { requiredForAll: mfaRequiredForRole(role), trusted: await trustedFor(supabase, user, token) });
    if (!mfa.satisfied) {
        denials.set(request, { status: 403, code: mfa.code, detail: MFA_SPACE_MESSAGES[mfa.code] });
        return null;
    }
    return { user, profile, mfa };
};
