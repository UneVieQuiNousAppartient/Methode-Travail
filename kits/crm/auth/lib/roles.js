// Kit CRM (methode-travail) — origine : KHI Educ, lib/roles.js, oct. 2026. À adapter : voir BRIQUE.md.
// Rôles de l'équipe et droits par route.
//
//   admin        : tout — réglages, équipe, clés API, webhooks, vie privée,
//                  suppressions définitives
//   gestionnaire : le CRM au complet — import/export, actions groupées,
//                  automatisations (exécuter), journal
//   employe      : le quotidien — leads (lire, noter, changer le statut),
//                  tâches, courriels unitaires, statistiques
//
// Exemple de décision métier à reproduire : tout ce qui envoie des courriels
// en masse (relances, actions groupées) exige au moins « gestionnaire ».
//
// Une route non listée ci-dessous est ouverte à tout membre de l'équipe.
// La règle s'applique dans getAdminFromRequest (lib/authServer.js) : rôle
// insuffisant → 403 (deny(request)). La MATRICE CI-DESSOUS EST UN EXEMPLE :
// la réécrire pour les routes du projet (BRIQUE.md, « Étapes d'adaptation »).

export const ROLES = ["employe", "gestionnaire", "admin"];

export const ROLE_LABELS = {
    admin: "Administrateur",
    gestionnaire: "Gestionnaire",
    employe: "Employé",
};

// Rôle inconnu → rang 0 (le plus bas), jamais une erreur ni un accès élargi.
const rank = (role) => Math.max(0, ROLES.indexOf(role));

// `role` ≥ `required` ?
export const hasRole = (role, required) => rank(role) >= rank(required);

// Première règle qui correspond → rôle minimal ; sinon "employe". Les règles les plus
// strictes d'abord : une route qui correspond à « admin » ne doit pas tomber plus bas.
const RULES = [
    {
        role: "admin",
        test: (m, p) =>
            p.startsWith("/v1/admin/team") ||
            p.startsWith("/v1/admin/api-keys") ||
            p.startsWith("/v1/admin/webhooks") ||
            p.startsWith("/v1/admin/privacy") ||
            (p === "/v1/admin/settings" && m !== "GET") ||
            // Suppression définitive d'un lead : administrateur seulement.
            (/^\/v1\/admin\/leads\/[^/]+$/.test(p) && m === "DELETE"),
    },
    {
        role: "gestionnaire",
        test: (m, p) =>
            /^\/v1\/admin\/leads\/(import|export|bulk)$/.test(p) ||
            p === "/v1/admin/run-reminders" ||
            p === "/v1/admin/audit",
    },
];

// Rôle minimal pour (méthode, chemin). Barre oblique finale ignorée (/x/ = /x).
export const requiredRole = (method, pathname) => {
    const m = String(method || "GET").toUpperCase();
    const p = String(pathname || "").replace(/\/+$/, "");
    for (const r of RULES) if (r.test(m, p)) return r.role;
    return "employe";
};

export const canAccess = (role, method, pathname) => hasRole(role, requiredRole(method, pathname));

// Résumé des droits pour l'interface (GET /v1/admin/me) : cacher ce qui est interdit.
// Chaque clé = un bouton ou un onglet de l'écran ; calculée avec la même règle que le serveur.
export const permissionsOf = (role) => ({
    settings: canAccess(role, "PATCH", "/v1/admin/settings"),
    leads_import: canAccess(role, "POST", "/v1/admin/leads/import"),
    leads_export: canAccess(role, "GET", "/v1/admin/leads/export"),
    leads_bulk: canAccess(role, "POST", "/v1/admin/leads/bulk"),
    lead_delete: canAccess(role, "DELETE", "/v1/admin/leads/x"),
    automations_run: canAccess(role, "POST", "/v1/admin/run-reminders"),
    privacy: canAccess(role, "GET", "/v1/admin/privacy"),
    audit: canAccess(role, "GET", "/v1/admin/audit"),
    team: canAccess(role, "GET", "/v1/admin/team"),
    api_keys: canAccess(role, "GET", "/v1/admin/api-keys"),
    webhooks: canAccess(role, "GET", "/v1/admin/webhooks"),
});
