// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/roles-journal.test.mjs (partie rôles et catalogue du journal), oct. 2026. À adapter : voir BRIQUE.md.
import { register } from "node:module";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
register("./alias-loader.mjs", import.meta.url);
register("./fake-supabase-loader.mjs", import.meta.url);

// Rôles de l'équipe : matrice (lib/roles.js), application par getAdminFromRequest (403 + rôle requis,
// avant toute écriture), droits résumés pour l'écran, clés d'API, journal (lib/audit.js) et son catalogue.
// À ADAPTER avec la matrice du projet : chaque route sensible a sa ligne « rôle X refusé / rôle Y passe ».
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createFakeSupabase, installFakeSupabase } = await import("./fake-supabase.mjs");
const { NextRequest } = await import("next/server.js");
const { ROLES, hasRole, requiredRole, canAccess, permissionsOf } = await import("@/lib/roles");
const { getAdminFromRequest, deny } = await import("@/lib/authServer");
const { generateApiKey, hashApiKey, isApiKey, apiKeyPrefix, API_KEY_PREFIX } = await import("@/lib/apiKeys");
const { audit, AUDIT_ACTIONS, AGENT_HEADER } = await import("@/lib/audit");

let ok = true;
const check = (label, pass, detail) => {
    console.log(`${pass ? "✓" : "✖"} ${label}${!pass && detail !== undefined ? " — " + detail : ""}`);
    ok &&= Boolean(pass);
};

// --- 1. matrice (fonctions pures) ---------------------------------------------------------------
check("ordre des rôles : employe < gestionnaire < admin", ROLES.join() === "employe,gestionnaire,admin" && hasRole("admin", "gestionnaire") && hasRole("gestionnaire", "employe") && !hasRole("employe", "gestionnaire"));
check("rôle inconnu ou absent → traité comme le plus bas, jamais élargi", !hasRole("superadmin", "gestionnaire") && !hasRole(undefined, "gestionnaire") && !canAccess(undefined, "GET", "/v1/admin/team"));
check("route non listée → employe", requiredRole("GET", "/v1/admin/leads") === "employe" && requiredRole("POST", "/v1/admin/leads/abc/notes") === "employe");
check("équipe, clés, webhooks, vie privée → admin", ["/v1/admin/team", "/v1/admin/api-keys", "/v1/admin/webhooks/1", "/v1/admin/privacy"].every((p) => requiredRole("GET", p) === "admin"));
check("réglages : lecture employe, écriture admin", requiredRole("GET", "/v1/admin/settings") === "employe" && requiredRole("PATCH", "/v1/admin/settings") === "admin");
check("suppression définitive d'un lead → admin ; lecture → employe", requiredRole("DELETE", "/v1/admin/leads/abc") === "admin" && requiredRole("GET", "/v1/admin/leads/abc") === "employe");
check("envois et opérations en masse → gestionnaire", ["/v1/admin/leads/import", "/v1/admin/leads/export", "/v1/admin/leads/bulk", "/v1/admin/run-reminders", "/v1/admin/audit"].every((p) => requiredRole("POST", p) === "gestionnaire"));
check("barre oblique finale et méthode en minuscules sans effet", requiredRole("delete", "/v1/admin/leads/abc/") === "admin" && requiredRole("get", "/v1/admin/team/") === "admin");
const perms = { employe: permissionsOf("employe"), gestionnaire: permissionsOf("gestionnaire"), admin: permissionsOf("admin") };
check("droits de l'écran : admin a tout", Object.values(perms.admin).every(Boolean));
check("droits de l'écran : gestionnaire importe, n'efface pas, ne gère pas l'équipe", perms.gestionnaire.leads_import && perms.gestionnaire.audit && !perms.gestionnaire.lead_delete && !perms.gestionnaire.team);
check("droits de l'écran : employe sans opérations en masse", !perms.employe.leads_bulk && !perms.employe.leads_export && !perms.employe.automations_run && !perms.employe.settings);

// --- 2. clés d'API --------------------------------------------------------------------------------
const k = generateApiKey();
check("clé : préfixe + 40 caractères alphanumériques, tirages distincts", new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{40}$`).test(k) && generateApiKey() !== k && isApiKey(k) && !isApiKey("eyJ.jwt.x") && !isApiKey(null));
check("clé : haché SHA-256 (64 hex), partie affichable courte", /^[0-9a-f]{64}$/.test(hashApiKey(k)) && apiKeyPrefix(k).length === 12 && k.startsWith(apiKeyPrefix(k)));

// --- 3. application par getAdminFromRequest --------------------------------------------------------
const keys = Object.fromEntries(ROLES.map((r) => [r, generateApiKey()]));
const db = createFakeSupabase({
    api_keys: ROLES.map((r) => ({ id: `k-${r}`, name: `Clé ${r}`, role: r, key_hash: hashApiKey(keys[r]), revoked_at: null, last_used_at: null })),
    admin_allowlist: [{ email: "admin@exemple.ca", role: "admin", name: "Admin" }],
});
db.auth = { getUser: async () => ({ data: { user: null }, error: { message: "jeton invalide" } }) };
installFakeSupabase(db);
const req = (role, method, p, headers = {}) => new NextRequest(`https://app.exemple.ca${p}`, { method, headers: { authorization: `Bearer ${keys[role]}`, ...headers } });

const r1 = req("employe", "POST", "/v1/admin/leads/bulk");
const a1 = await getAdminFromRequest(r1);
const d1 = deny(r1);
const b1 = await d1.json();
check("employé sur une action groupée → 403, rôle requis gestionnaire", a1 === null && d1.status === 403 && b1.required_role === "gestionnaire", JSON.stringify(b1));
check("gestionnaire sur une action groupée → accès (via api_key)", (await getAdminFromRequest(req("gestionnaire", "POST", "/v1/admin/leads/bulk")))?.via === "api_key");
const r2 = req("gestionnaire", "DELETE", "/v1/admin/leads/abc");
check("gestionnaire : suppression définitive → 403 admin", (await getAdminFromRequest(r2)) === null && (await deny(r2).json()).required_role === "admin");
check("admin : suppression définitive → accès", (await getAdminFromRequest(req("admin", "DELETE", "/v1/admin/leads/abc")))?.role === "admin");
check("dernière utilisation de la clé notée (au plus une fois par minute)", db.writesTo("api_keys").some((w) => w.op === "update" && w.patch.last_used_at));
check("refus avant toute écriture hors api_keys (aucun journal)", !db.writes.some((w) => w.table !== "api_keys"));

// --- 4. journal ----------------------------------------------------------------------------------
await audit({ actor: "admin@exemple.ca", action: "team.add", target_type: "member", target_id: "x", meta: { role: "employe" } }, new NextRequest("https://app.exemple.ca/v1/admin/team", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", [AGENT_HEADER]: "1" } }));
const line = db.tables.admin_audit_log?.[0];
check("audit : ligne écrite avec IP (premier x-forwarded-for) et marque via_agent", line?.action === "team.add" && line.ip === "203.0.113.7" && line.meta.via_agent === true && line.meta.role === "employe", JSON.stringify(line));
check("audit : sans acteur ou sans action → rien d'écrit", (await audit({ action: "team.add" })) === null && (await audit({ actor: "x" })) === null && db.tables.admin_audit_log.length === 1);
installFakeSupabase(createFakeSupabase({}, { fail: () => "panne simulée" }));
const err = console.error;
console.error = () => {};
let threw = false;
try {
    await audit({ actor: "x", action: "team.add" });
} catch {
    threw = true;
}
console.error = err;
check("audit : base en panne → ne lève jamais", !threw);

// Toute action journalisée figure dans le catalogue (filtres du journal) : lib/ et app/v1/ du projet.
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(f) ? [p] : [];
}) : []);
const used = new Set();
for (const f of [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app", "v1"))]) {
    for (const m of readFileSync(f, "utf8").matchAll(/\baudit\(\s*\{[^{}]*?\baction:\s*"([a-z_.]+)"/g)) used.add(m[1]);
}
const missing = [...used].filter((a) => !AUDIT_ACTIONS.includes(a));
check(`catalogue du journal : toutes les actions utilisées (${used.size}) sont listées${missing.length ? ` — manquantes : ${missing.join(", ")}` : ""}`, used.size >= 1 && !missing.length);

process.exit(ok ? 0 : 1);
