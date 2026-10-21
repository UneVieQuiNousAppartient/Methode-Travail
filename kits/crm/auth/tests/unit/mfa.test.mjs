// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/mfa.test.mjs, oct. 2026. À adapter : voir BRIQUE.md.
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
register("./fake-supabase-loader.mjs", import.meta.url);

// Double authentification : niveau de session lu dans le jeton, membre inscrit → aal2 obligatoire,
// ADMIN_MFA_REQUIRED=1 → tous, /v1/admin/me répond toujours avec l'état, refus 403 avec un code que
// l'écran reconnaît ; clés d'API non concernées. Espaces clients (MFA_ALWAYS_ROLES) : facteur ET aal2
// toujours exigés (getUserWithRole), sans variable ; GET /v1/auth/role répond en aal1. Base en mémoire.
// Dépend de la brique « tests » (alias-loader, fake-supabase-loader, fake-supabase).
const { createFakeSupabase, installFakeSupabase } = await import("./fake-supabase.mjs");
const { NextRequest } = await import("next/server.js");
const { sessionAal, mfaState, mfaRequiredForRole } = await import("@/lib/mfa");
const { getAdminFromRequest, getUserWithRole, deny } = await import("@/lib/authServer");
const { hashApiKey, API_KEY_PREFIX } = await import("@/lib/apiKeys");
const meRoute = await import("@/app/v1/admin/me/route.js");
const roleRoute = await import("@/app/v1/auth/role/route.js");

let ok = true;
const check = (label, pass, detail) => {
    console.log(`${pass ? "✓" : "✖"} ${label}${!pass && detail !== undefined ? " — " + detail : ""}`);
    ok &&= Boolean(pass);
};

// Jeton de forme JWT (la signature est vérifiée par Supabase, simulé ici par auth.getUser).
const jwt = (aal, sub) => `h.${Buffer.from(JSON.stringify({ sub, aal })).toString("base64url")}.s`;

// --- 1. lecture du niveau et décision -----------------------------------------------------
check("aal lu dans le jeton (aal1, aal2), jeton illisible → null", sessionAal(jwt("aal1")) === "aal1" && sessionAal(jwt("aal2")) === "aal2" && sessionAal("pas-un-jwt") === null && sessionAal(`h.${Buffer.from('{"aal":"aal9"}').toString("base64url")}.s`) === null);
const enrolled = { factors: [{ id: "f1", factor_type: "totp", status: "verified" }] };
const pending = { factors: [{ id: "f2", factor_type: "totp", status: "unverified" }] };
check("non inscrit, politique par défaut → aucun code demandé", mfaState({}, jwt("aal1"), { requiredForAll: false }).satisfied === true);
check("inscrit + session aal1 → mfa_required", mfaState(enrolled, jwt("aal1"), { requiredForAll: false }).code === "mfa_required");
check("inscrit + session aal2 → accepté", mfaState(enrolled, jwt("aal2"), { requiredForAll: false }).satisfied === true);
check("facteur non vérifié ≠ inscrit", mfaState(pending, jwt("aal1"), { requiredForAll: false }).enrolled === false);
check("obligatoire pour tous + non inscrit → mfa_enrollment_required", mfaState({}, jwt("aal1"), { requiredForAll: true }).code === "mfa_enrollment_required");
check("required_for_all reflète ADMIN_MFA_REQUIRED, même pour un inscrit (écran « Sécurité du compte »)", mfaState(enrolled, jwt("aal2"), { requiredForAll: true }).required_for_all === true && mfaState(enrolled, jwt("aal2"), { requiredForAll: false }).required_for_all === false);

// --- 2. API admin ---------------------------------------------------------------------------
const USERS = {
    [jwt("aal1", "u1")]: { id: "u1", email: "admin@exemple.ca", ...enrolled },
    [jwt("aal2", "u1")]: { id: "u1", email: "admin@exemple.ca", ...enrolled },
    [jwt("aal1", "u2")]: { id: "u2", email: "employe@exemple.ca", factors: [] },
    // Tuteur inscrit (t1), tuteur au facteur non vérifié (t2), parent inscrit (p1), parent sans facteur (p2).
    [jwt("aal1", "t1")]: { id: "t1", email: "tuteur@exemple.ca", ...enrolled },
    [jwt("aal2", "t1")]: { id: "t1", email: "tuteur@exemple.ca", ...enrolled },
    [jwt("aal1", "t2")]: { id: "t2", email: "tuteur2@exemple.ca", ...pending },
    [jwt("aal1", "p1")]: { id: "p1", email: "parent@exemple.ca", ...enrolled },
    [jwt("aal2", "p1")]: { id: "p1", email: "parent@exemple.ca", ...enrolled },
    [jwt("aal1", "p2")]: { id: "p2", email: "parent2@exemple.ca", factors: [] },
};
const KEY = API_KEY_PREFIX + "M".repeat(40);
const db = createFakeSupabase({
    admin_allowlist: [
        { email: "admin@exemple.ca", role: "admin", name: "Admin" },
        { email: "employe@exemple.ca", role: "employe", name: "Employé" },
    ],
    api_keys: [{ id: "k1", name: "agent", role: "gestionnaire", key_hash: hashApiKey(KEY), revoked_at: null }],
    profiles: [
        { id: "t1", email: "tuteur@exemple.ca", full_name: "Tuteur Un", role: "tutor" },
        { id: "t2", email: "tuteur2@exemple.ca", full_name: "Tuteur Deux", role: "tutor" },
        { id: "p1", email: "parent@exemple.ca", full_name: "Parent Un", role: "parent" },
        { id: "p2", email: "parent2@exemple.ca", full_name: "Parent Deux", role: "parent" },
    ],
});
db.auth = { getUser: async (t) => (USERS[t] ? { data: { user: USERS[t] }, error: null } : { data: { user: null }, error: { message: "jeton invalide" } }) };
installFakeSupabase(db);
const req = (token, path = "/v1/admin/leads") => new NextRequest(`https://app.exemple.ca${path}`, { headers: { authorization: `Bearer ${token}` } });

const r1 = req(jwt("aal1", "u1"));
const a1 = await getAdminFromRequest(r1);
const d1 = deny(r1);
const b1 = await d1.json();
check("inscrite en aal1 sur une route admin → refus 403 code mfa_required", a1 === null && d1.status === 403 && b1.code === "mfa_required" && /code/.test(b1.detail), JSON.stringify(b1));
check("inscrite en aal2 → accès", (await getAdminFromRequest(req(jwt("aal2", "u1"))))?.role === "admin");
check("non inscrit, politique par défaut → accès (déploiement sans casse)", (await getAdminFromRequest(req(jwt("aal1", "u2"))))?.role === "employe");
check("jeton inconnu → 401 Non authentifié", (await getAdminFromRequest(req("inconnu"))) === null && deny(req("inconnu")).status === 401);
const me1 = await meRoute.GET(req(jwt("aal1", "u1"), "/v1/admin/me"));
const meBody = await me1.json();
check("/v1/admin/me répond en aal1 avec l'état MFA (pour l'écran du code)", me1.status === 200 && meBody.mfa?.code === "mfa_required" && meBody.mfa?.enrolled === true && meBody.mfa?.aal === "aal1", JSON.stringify(meBody.mfa));
check("clé d'API : pas de MFA (via api_key, mfa null)", (await getAdminFromRequest(req(KEY)))?.via === "api_key");
db.tables.api_keys[0].revoked_at = "2026-01-01T00:00:00Z";
check("clé d'API révoquée → refusée", (await getAdminFromRequest(req(KEY))) === null);
db.tables.api_keys[0].revoked_at = null;

process.env.ADMIN_MFA_REQUIRED = "1";
const r2 = req(jwt("aal1", "u2"));
const a2 = await getAdminFromRequest(r2);
check("ADMIN_MFA_REQUIRED=1 + non inscrit → 403 mfa_enrollment_required", a2 === null && (await deny(r2).json()).code === "mfa_enrollment_required");
const me2 = await (await meRoute.GET(req(jwt("aal1", "u2"), "/v1/admin/me"))).json();
check("… mais /v1/admin/me répond (pour proposer l'inscription)", me2.mfa?.code === "mfa_enrollment_required" && me2.role === "employe");
check("clé d'API toujours acceptée avec ADMIN_MFA_REQUIRED=1", (await getAdminFromRequest(req(KEY)))?.role === "gestionnaire");
delete process.env.ADMIN_MFA_REQUIRED;

// --- 3. Espaces clients : toujours facteur + aal2, sans variable ------------------------------
check("rôles clients : double authentification toujours exigée (sans ADMIN_MFA_REQUIRED)", mfaRequiredForRole("tutor") && mfaRequiredForRole("parent") && !mfaRequiredForRole("admin") && !mfaRequiredForRole(undefined));

const denied = async (r, role) => {
    const ctx = await getUserWithRole(r, role);
    const res = deny(r);
    return { ctx, status: res.status, body: await res.json() };
};
const t1 = await denied(req(jwt("aal1", "t1"), "/v1/tutor/x"), "tutor");
check("tuteur inscrit en aal1 → 403 mfa_required", t1.ctx === null && t1.status === 403 && t1.body.code === "mfa_required" && /code/.test(t1.body.detail), JSON.stringify(t1.body));
const t2 = await denied(req(jwt("aal1", "t2"), "/v1/tutor/x"), "tutor");
check("tuteur sans facteur vérifié → 403 mfa_enrollment_required (« votre espace », pas « administration »)", t2.ctx === null && t2.status === 403 && t2.body.code === "mfa_enrollment_required" && /votre espace/.test(t2.body.detail) && !/administration/.test(t2.body.detail), JSON.stringify(t2.body));
const t3 = await getUserWithRole(req(jwt("aal2", "t1"), "/v1/tutor/x"), "tutor");
check("tuteur inscrit en aal2 → accès (profil + état mfa)", t3?.profile?.role === "tutor" && t3.mfa?.satisfied === true && t3.mfa?.aal === "aal2", JSON.stringify(t3?.mfa));
const p1 = await denied(req(jwt("aal1", "p1"), "/v1/parent"), "parent");
const p2 = await denied(req(jwt("aal1", "p2"), "/v1/parent"), "parent");
check("parent : inscrit en aal1 → mfa_required ; sans facteur → mfa_enrollment_required", p1.status === 403 && p1.body.code === "mfa_required" && p2.status === 403 && p2.body.code === "mfa_enrollment_required");
check("parent inscrit en aal2 → accès", (await getUserWithRole(req(jwt("aal2", "p1"), "/v1/parent"), "parent"))?.profile?.role === "parent");
const wrong = await denied(req(jwt("aal2", "p1"), "/v1/tutor/x"), "tutor");
const wrong2 = await denied(req(jwt("aal1", "t2"), "/v1/parent"), "parent");
check("autre rôle → 401 sans code MFA (rôle vérifié avant la double authentification)", wrong.ctx === null && wrong.status === 401 && !wrong.body.code && wrong2.status === 401 && !wrong2.body.code, JSON.stringify([wrong.body, wrong2.body]));
check("équipe inchangée sans ADMIN_MFA_REQUIRED : inscrite en aal2 → accès, non inscrit en aal1 → accès", (await getAdminFromRequest(req(jwt("aal2", "u1"))))?.role === "admin" && (await getAdminFromRequest(req(jwt("aal1", "u2"))))?.role === "employe");

const role1 = await roleRoute.GET(req(jwt("aal1", "t2"), "/v1/auth/role"));
const role1Body = await role1.json();
check("GET /v1/auth/role répond en aal1, même sans facteur (routage après connexion)", role1.status === 200 && role1Body.role === "tutor", JSON.stringify(role1Body));
const role2 = await (await roleRoute.GET(req(jwt("aal1", "u2"), "/v1/auth/role"))).json();
check("GET /v1/auth/role : membre de l'équipe → role admin + team_role", role2.role === "admin" && role2.team_role === "employe", JSON.stringify(role2));

// --- 4. Garde : la migration pose la politique restrictive aal2 (au moins sur profiles) ----------------
// Dans un projet, élargir : toute table lue par le navigateur (supabase.from("…") hors app/v1) doit
// figurer ici, sinon une nouvelle lecture contournerait la double authentification.
const { readFileSync } = await import("node:fs");
const aal2Tables = (sql) => new Set([...sql.matchAll(/create policy "authenticated requires aal2" on public\.([a-z_]+)\s+as restrictive\s+for all\s+to authenticated\s+using \(\(select auth\.jwt\(\) ->> 'aal'\) = 'aal2'\)/g)].map((m) => m[1]));
const migrationAal2 = aal2Tables(readFileSync(new URL("../../supabase/migrations/0003_mfa_aal2_restrictive.sql", import.meta.url), "utf8"));
check("0003 : politique restrictive aal2 sur profiles", migrationAal2.has("profiles"), [...migrationAal2].join(", "));

process.exit(ok ? 0 : 1);
