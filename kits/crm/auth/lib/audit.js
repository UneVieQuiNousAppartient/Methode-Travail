// Kit CRM (methode-travail) — origine : KHI Educ, lib/audit.js, oct. 2026. À adapter : voir BRIQUE.md.
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Journal d'activité global de l'équipe : qui a fait quoi, sur quoi. Distinct de l'historique d'une
// fiche (ex. activités d'un lead) : ici, les actions d'administration — réglages, équipe, clés,
// webhooks, import/export, actions groupées, vie privée, appareils de confiance. Ne lève jamais :
// un journal en panne ne doit pas faire échouer l'action journalisée.
//
// Toute action passée à audit() doit figurer ici : c'est la liste des filtres du journal
// (GET /v1/admin/audit → actions). Un test peut le garantir en cherchant `audit({ … action: "…" })`
// dans lib/ et app/v1/ (tests/unit/roles.test.mjs). Liste d'exemple : à compléter par projet.

export const AUDIT_ACTIONS = [
    "settings.update",
    "team.add",
    "team.update",
    "team.remove",
    "api_key.create",
    "api_key.revoke",
    "mfa.device_trusted",
    "mfa.device_forgotten",
    "mfa.devices_forgotten",
    "lead.delete",
    "leads.bulk",
    "leads.import",
    "leads.export",
    "privacy.export",
    "privacy.erase",
];

const ipOf = (request) => {
    if (!request?.headers) return null;
    const fwd = request.headers.get("x-forwarded-for");
    return (fwd ? fwd.split(",")[0] : request.headers.get("x-real-ip") || "").trim() || null;
};

// En-tête posé par les outils d'agents (assistant intégré, connecteur MCP) : l'action est marquée
// via_agent, pour retrouver ce qu'un assistant a fait. À renommer par projet.
export const AGENT_HEADER = "x-crm-agent";

// audit({ actor, action, target_type?, target_id?, meta? }, request?)
// Ne jamais mettre dans meta une donnée personnelle qui doit pouvoir être effacée (le journal survit
// à l'effacement d'une fiche) : identifiants et états, pas de noms ni de courriels de clients.
export const audit = async ({ actor, action, target_type = null, target_id = null, meta = {} }, request = null) => {
    if (!actor || !action) return null;
    try {
        const { error } = await getSupabaseAdmin().from("admin_audit_log").insert({
            actor: String(actor).slice(0, 200),
            action: String(action).slice(0, 60),
            target_type: target_type ? String(target_type).slice(0, 40) : null,
            target_id: target_id ? String(target_id).slice(0, 100) : null,
            meta: { ...(meta && typeof meta === "object" ? meta : {}), ...(request?.headers?.get?.(AGENT_HEADER) ? { via_agent: true } : {}) },
            ip: ipOf(request),
        });
        if (error) console.error("[audit]", error.message);
    } catch (e) {
        console.error("[audit]", e.message);
    }
    return null;
};

// Lecture paginée avec filtres (route /v1/admin/audit). action "lead." = préfixe.
export const listAudit = async ({ actor, action, target_type, target_id, since, until, limit = 100, offset = 0 }) => {
    let q = getSupabaseAdmin()
        .from("admin_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    if (actor) q = q.eq("actor", actor);
    if (action) q = q.like("action", action.endsWith(".") ? `${action}%` : action);
    if (target_type) q = q.eq("target_type", target_type);
    if (target_id) q = q.eq("target_id", target_id);
    if (since) q = q.gte("created_at", since);
    if (until) q = q.lte("created_at", until);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { items: data || [], total: count ?? 0 };
};
