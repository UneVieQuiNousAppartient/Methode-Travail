// Kit CRM (methode-travail) — origine : KHI Educ, app/[lang]/admin/AdminClient.jsx (apiFetch), oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

// Appel des routes /v1/* depuis l'admin (ou un espace client) : jeton Supabase en « Bearer », JSON par défaut, et
// deux refus traités une fois pour toutes ici plutôt que dans chaque écran :
//
//   · 403 { code: "mfa_required" | "mfa_enrollment_required" } (session sans le niveau de double authentification
//     exigé) → onMfaGate(code) : l'écran du code ou de l'inscription prend la place de l'admin. Pas de toast.
//   · tout autre 403 (rôle insuffisant : { detail, required_role }) → UN toast d'erreur, jamais une page blanche.
//     Identifiant du toast = son texte : dix appels refusés au chargement ne font qu'un seul message.
//
// La réponse est TOUJOURS rendue telle quelle (res) : l'appelant teste res.ok / res.status et lit res.json().
// Un appelant qui affiche son propre message d'erreur doit sauter le cas 403, déjà signalé :
//   if (!res.ok && res.status !== 403) toast.error(...)
//
// Les jetons rafraîchis par supabase-js (passage en aal2 après le code, renouvellement horaire) sont relus à
// chaque appel : aucun refreshSession n'est nécessaire ici.

export const MFA_GATE_CODES = ["mfa_required", "mfa_enrollment_required"];

// Fabrique, utilisable hors de React (scripts de test, autre framework).
//   const apiFetch = createApiFetch({ t, onMfaGate: setMfaGate });
//   const res = await apiFetch("/v1/admin/clients");
export const createApiFetch = ({ t = (s) => s, onMfaGate, getSupabase = getSupabaseBrowser, notify = toast } = {}) =>
    async function apiFetch(path, options = {}) {
        const {
            data: { session },
        } = await getSupabase().auth.getSession();
        const res = await fetch(path, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session?.access_token}`,
                ...(options.headers || {}),
            },
        });
        if (res.status === 403) {
            // clone() : l'appelant peut encore lire le corps.
            const data = await res.clone().json().catch(() => ({}));
            if (MFA_GATE_CODES.includes(data.code)) {
                onMfaGate?.(data.code);
            } else {
                const msg = typeof data.detail === "string" && data.detail ? data.detail : t("Accès réservé à un autre rôle.");
                notify.error(msg, { id: msg });
            }
        }
        return res;
    };

// Crochet React : fonction STABLE tant que `t` et `onMfaGate` le sont. Tout effet qui dépend d'apiFetch (chargement
// des données) se relance quand elle change : un `t` recréé à chaque rendu recharge tout l'admin deux fois au
// démarrage (voir PATTERNS.md). onMfaGate : passer directement le setter d'un useState (stable par nature).
export const useApiFetch = ({ t, onMfaGate } = {}) => useMemo(() => createApiFetch({ t, onMfaGate }), [t, onMfaGate]);

// Lit le message d'erreur d'une réponse refusée (detail texte de l'API), sinon le message par défaut.
export const errorDetail = async (res, fallback) => {
    const data = (await res?.json().catch(() => ({}))) || {};
    return typeof data.detail === "string" && data.detail ? data.detail : fallback;
};
