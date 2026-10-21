// Kit CRM (methode-travail) — origine : KHI Educ, harnais de simulation de l'admin (bloc-notes de session, sim/harness.mjs), oct. 2026. À adapter : voir BRIQUE.md.
// Simulation de l'admin RÉEL (build de production local) dans Chromium : la connexion Supabase Auth et
// l'API /v1/** sont interceptées dans le navigateur et servies par un faux serveur À ÉTAT (store). On voit
// ce que l'utilisateur voit, sans base ni réseau : appels faits, messages affichés, erreurs de page.
//
// Mode d'emploi (BRIQUE.md pour le détail) :
//   NEXT_PUBLIC_SUPABASE_URL=https://fakeproj.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=fake npm run build
//   npx next start -p 3100 &
//   CHROMIUM_PATH=/chemin/vers/chromium node simulation/s0-demarrage.mjs
// Le build doit pointer vers SIM_SUPABASE_URL : le client navigateur de Supabase y lit sa session (témoin
// sb-<projet>-auth-token) et y appelle /auth/v1/user ; une autre URL = aucune interception.
import { chromium } from "playwright-core";

export const BASE = process.env.SIM_BASE_URL || "http://localhost:3100";
export const SUPABASE_URL = process.env.SIM_SUPABASE_URL || "https://fakeproj.supabase.co";
// Référence du projet = premier segment de l'hôte (fakeproj.supabase.co → fakeproj) : nom du témoin de session.
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
// Sélecteurs de l'écran : à adapter au projet (data-testid posés par le frontend).
export const SELECTORS = {
    ready: process.env.SIM_READY_SELECTOR || '[data-testid="admin-dashboard"], [data-testid="mfa-challenge"]',
    toast: "[data-sonner-toast]", // messages éphémères (sonner) ; autre bibliothèque → changer ici
    confirm: '[data-testid="confirm-dialog"]',
    confirmInput: '[data-testid="confirm-dialog-input"]',
    confirmButton: '[data-testid="confirm-dialog-confirm"]',
};

const D = 864e5;
export const iso = (d) => new Date(Date.now() + d * D).toISOString();
export const STATUSES = ["Nouveau", "Contacté", "À relancer", "Consultation planifiée", "Qualifié", "Client"];

// Magasin de données d'exemple, neutre et fictif. Drapeaux de comportement (à poser par le scénario) :
//   failWrites   → toute écriture (≠ GET) répond 500 : l'écran doit le dire ;
//   forbidWrites → toute écriture répond 403 : idem ;
//   mfaNeed      → le compte a un facteur vérifié et /v1/admin/me répond code « mfa_required » ;
//   hasDevice    → le navigateur présente un témoin d'appareil de confiance valide.
// store.calls reçoit chaque appel /v1 ({ method, path, body }) : c'est ce que le scénario vérifie.
export function makeStore() {
    return {
        user: { id: "u1", email: "admin@exemple.ca", name: "Admin Test" },
        leads: Array.from({ length: 12 }, (_, i) => ({
            id: `lead-${i}`,
            parent_name: `Parent ${i}`,
            email: `p${i}@exemple.ca`,
            phone: "555-555-0100",
            status: STATUSES[i % STATUSES.length],
            created_at: iso(-i),
            status_changed_at: iso(-i),
            source: "formulaire",
            score: 50 + i,
            tags: [],
        })),
        tasks: { "lead-0": [{ id: "task-1", title: "Rappeler", due_at: iso(1), done: false, lead_id: "lead-0" }] },
        calls: [],
        failWrites: false,
        forbidWrites: false,
        mfaNeed: false,
        hasDevice: false,
    };
}

// Droits renvoyés par /v1/admin/me (miroir de permissionsOf de la brique auth) : tout ouvert par défaut.
export const ALL_PERMISSIONS = Object.fromEntries(
    "settings leads_import leads_export leads_bulk lead_delete automations_run privacy audit team api_keys webhooks".split(" ").map((k) => [k, true]),
);

const ok = (data, extra = {}) => ({ status: 200, body: data, ...extra });

// POINT D'EXTENSION : faux serveur /v1. (store, method, path, search: URLSearchParams, body) →
// { status, body, headers? }. Compléter avec les routes du projet (ou passer `respond` à openAdmin et
// déléguer à defaultRespond pour le reste). Règles : rester À ÉTAT (une écriture modifie store, la
// lecture suivante la voit — c'est ce qui révèle les écrans qui ne se rafraîchissent pas) ; réponse
// par défaut neutre ([] en GET, { ok: true } sinon) pour qu'une route oubliée ne casse pas le scénario,
// mais la regarder dans store.calls.
export function defaultRespond(store, method, path, search, body) {
    const seg = path.split("/").filter(Boolean); // ["v1", "admin", "leads", id, …]
    // Double authentification (brique auth) : témoin « 30 jours » présenté à la connexion.
    if (path === "/v1/auth/mfa/trusted-session") {
        if (store.hasDevice) store.mfaTrusted = true;
        return ok({ trusted: Boolean(store.hasDevice) });
    }
    if (method !== "GET" && store.forbidWrites) return { status: 403, body: { detail: "Accès refusé (simulation)." } };
    if (method !== "GET" && store.failWrites) return { status: 500, body: { detail: "Erreur simulée du serveur." } };
    if (path === "/v1/auth/role") return ok({ role: "admin", team_role: "admin", email: store.user.email });
    if (path === "/v1/admin/me") {
        return ok({
            name: store.user.name,
            email: store.user.email,
            role: "admin",
            role_label: "Administrateur",
            via: "session",
            permissions: ALL_PERMISSIONS,
            mfa: { enrolled: Boolean(store.mfaNeed), aal: store.mfaNeed && !store.mfaTrusted ? "aal1" : "aal2", code: store.mfaNeed && !store.mfaTrusted ? "mfa_required" : null, trusted_device: Boolean(store.mfaTrusted) },
        });
    }
    if (path === "/v1/admin/leads/bulk") {
        for (const id of body?.ids || []) {
            const l = store.leads.find((x) => x.id === id);
            if (l && body.status) l.status = body.status;
            if (l && "archived" in (body || {})) l.archived_at = body.archived ? iso(0) : null;
        }
        return ok({ updated: (body?.ids || []).length });
    }
    if (seg[1] === "admin" && seg[2] === "leads") {
        if (seg.length === 3) {
            if (method === "GET") {
                const arch = search.get("archived") === "only";
                const list = store.leads.filter((l) => (arch ? l.archived_at : !l.archived_at));
                return ok(list, { headers: { "x-total-count": String(list.length) } });
            }
            const lead = { id: `lead-${Date.now()}`, created_at: iso(0), status: STATUSES[0], ...body };
            store.leads.push(lead);
            return ok(lead);
        }
        const lead = store.leads.find((l) => l.id === seg[3]);
        if (seg.length === 4) {
            if (method === "GET") return lead ? ok({ lead, activities: [], tasks: store.tasks[lead.id] || [] }) : { status: 404, body: { detail: "Introuvable" } };
            if (method === "PATCH" && lead) {
                Object.assign(lead, body, body?.archived !== undefined ? { archived_at: body.archived ? iso(0) : null } : {});
                return ok({ lead });
            }
            if (method === "DELETE") {
                store.leads = store.leads.filter((l) => l.id !== seg[3]);
                return ok({ deleted: true });
            }
        }
        if (seg[4] === "tasks" && method === "POST") {
            const tk = { id: `task-${Date.now()}`, ...body, done: false };
            (store.tasks[seg[3]] ||= []).push(tk);
            return ok(tk);
        }
        return ok(method === "GET" ? [] : {});
    }
    if (path.startsWith("/v1/admin/notifications")) return ok({ items: [], unread: 0 });
    return ok(method === "GET" ? [] : { ok: true });
}

// Ouvre l'admin connecté (session factice), interceptions posées. Options :
//   store, respond (défaut defaultRespond), path, width/height, initScript (ex. consentement aux témoins
//   déjà donné : () => localStorage.setItem("<clé>", "…")), factors (facteurs MFA renvoyés par /auth/v1/user).
export async function openAdmin({ width = 1440, height = 900, store = makeStore(), respond = defaultRespond, path = "/admin", initScript = null } = {}) {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const ctx = await browser.newContext({ viewport: { width, height } });
    const authUser = { id: store.user.id, email: store.user.email, aud: "authenticated", role: "authenticated" };
    const session = { access_token: "fake-token", refresh_token: "fake-refresh", token_type: "bearer", expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, user: authUser };
    // Session lue par @supabase/ssr dans le témoin sb-<projet>-auth-token (format « base64-<json> »).
    await ctx.addCookies([{ name: `sb-${PROJECT_REF}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
    if (initScript) await ctx.addInitScript(initScript);
    await ctx.route(`${SUPABASE_URL}/**`, (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === "/auth/v1/user") {
            return route.fulfill({ json: { ...authUser, factors: store.mfaNeed ? [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "Téléphone" }] : [] } });
        }
        return route.fulfill({ json: {} });
    });
    await ctx.route(`${BASE}/v1/**`, async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        let body = null;
        try {
            body = req.postDataJSON();
        } catch {}
        store.calls.push({ method: req.method(), path: u.pathname + u.search, body });
        const r = respond(store, req.method(), u.pathname, u.searchParams, body);
        return route.fulfill({ status: r.status, json: r.body, headers: { "content-type": "application/json", ...(r.headers || {}) } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForSelector(SELECTORS.ready, { timeout: 20000 });
    await page.waitForTimeout(800);
    return { browser, page, store, errors };
}

// Messages éphémères visibles à l'écran.
export const toasts = (page) => page.$$eval(SELECTORS.toast, (els) => els.map((e) => e.textContent.trim()));
export const confirmCard = (page) => page.locator(SELECTORS.confirm);

// Appels GET faits plusieurs fois (même chemin) : double chargement au démarrage, boucle d'effet React…
export const duplicateGets = (store) => {
    const n = new Map();
    for (const c of store.calls) if (c.method === "GET") n.set(c.path, (n.get(c.path) || 0) + 1);
    return [...n].filter(([, k]) => k > 1).map(([p, k]) => `${p} ×${k}`);
};
