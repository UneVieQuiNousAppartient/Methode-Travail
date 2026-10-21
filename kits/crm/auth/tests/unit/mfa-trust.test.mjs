// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/mfa-trust.test.mjs, oct. 2026. À adapter : voir BRIQUE.md.
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
register("./fake-supabase-loader.mjs", import.meta.url);

// Appareils de confiance de la double authentification : « se souvenir de cet appareil 30 jours ».
// Règle pure (lib/mfaTrust.js), décision du serveur (lib/mfa.js, lib/authServer.js) et routes /v1/auth/mfa/*,
// sur une base en mémoire. Cas méchants : témoin d'un autre compte, jeton falsifié, appareil retiré ou échu,
// session de confiance présentée par une autre session, confiance sans facteur inscrit.
// Dépend de la brique « tests » (alias-loader, fake-supabase-loader, fake-supabase).
const { createFakeSupabase, installFakeSupabase } = await import("./fake-supabase.mjs");
const { NextRequest } = await import("next/server.js");
const T = await import("@/lib/mfaTrust");
const { mfaState } = await import("@/lib/mfa");
const { getAdminFromRequest, getUserWithRole } = await import("@/lib/authServer");
const trustRoute = await import("@/app/v1/auth/mfa/trust/route.js");
const sessionRoute = await import("@/app/v1/auth/mfa/trusted-session/route.js");
const devicesRoute = await import("@/app/v1/auth/mfa/devices/route.js");

let ok = true;
const check = (label, pass, detail) => {
    console.log(`${pass ? "✓" : "✖"} ${label}${!pass && detail !== undefined ? " — " + detail : ""}`);
    ok &&= Boolean(pass);
};

const NOW = new Date("2026-10-21T12:00:00Z");
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333"; // session du parent (chaque session Supabase a son identifiant)
const jwt = (aal, sub, sid = S1) => `h.${Buffer.from(JSON.stringify({ sub, aal, session_id: sid })).toString("base64url")}.s`;

// --- 1. règle pure ---------------------------------------------------------------------------
const token = "a".repeat(64);
const device = { id: "d1", user_id: "u1", token_hash: T.hashTrustToken(token), expires_at: "2026-11-20T12:00:00Z", revoked_at: null };
check("échéance : 30 jours après", T.trustExpiry(NOW).toISOString() === "2026-11-20T12:00:00.000Z");
check("appareil valide pour son compte → accepté", T.deviceAccepts(device, { userId: "u1", token, now: NOW }) === true);
check("témoin d'un autre compte → refusé", T.deviceAccepts(device, { userId: "u2", token, now: NOW }) === false);
check("jeton falsifié → refusé", T.deviceAccepts(device, { userId: "u1", token: "b".repeat(64), now: NOW }) === false);
check("appareil retiré → refusé", T.deviceAccepts({ ...device, revoked_at: "2026-10-20T00:00:00Z" }, { userId: "u1", token, now: NOW }) === false);
check("échéance atteinte (borne exacte) → refusé ; une seconde avant → accepté", T.deviceAccepts(device, { userId: "u1", token, now: new Date("2026-11-20T12:00:00Z") }) === false && T.deviceAccepts(device, { userId: "u1", token, now: new Date("2026-11-20T11:59:59Z") }) === true);
check("appareil absent ou compte absent → refusé", T.deviceAccepts(null, { userId: "u1", token, now: NOW }) === false && T.deviceAccepts(device, { userId: null, token, now: NOW }) === false);
const goodCookie = `${"0b3f2a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b"}.${token}`;
check("témoin lu : <uuid>.<64 hex> ; autre forme → null", T.parseTrustCookie(goodCookie)?.token === token && T.parseTrustCookie("x.y") === null && T.parseTrustCookie(`${goodCookie}.extra`) === null && T.parseTrustCookie("") === null && T.parseTrustCookie(undefined) === null);
check("session_id lu dans le jeton ; absent ou invalide → null", T.sessionIdOf(jwt("aal1", "u1")) === S1 && T.sessionIdOf("pas-un-jwt") === null && T.sessionIdOf(`h.${Buffer.from('{"session_id":"x"}').toString("base64url")}.s`) === null);
const sess = { session_id: S1, user_id: "u1", device_id: "d1", expires_at: "2026-11-20T12:00:00Z" };
check("session de confiance valide ; d'un autre compte, appareil retiré ou session échue → non", T.trustedSessionValid(sess, device, { userId: "u1", now: NOW }) && !T.trustedSessionValid(sess, device, { userId: "u2", now: NOW }) && !T.trustedSessionValid(sess, { ...device, revoked_at: "2026-10-21T00:00:00Z" }, { userId: "u1", now: NOW }) && !T.trustedSessionValid({ ...sess, expires_at: "2026-10-21T11:00:00Z" }, device, { userId: "u1", now: NOW }));
const header = T.trustCookieHeader("v", 2592000);
check("témoin : httpOnly, Secure, SameSite=Strict, chemin /v1/auth/mfa, 30 jours ; effacement Max-Age=0", /HttpOnly/.test(header) && /Secure/.test(header) && /SameSite=Strict/.test(header) && /Path=\/v1\/auth\/mfa/.test(header) && /Max-Age=2592000/.test(header) && /Max-Age=0/.test(T.trustCookieHeader("v", 0)) && T.trustCookieHeader("v", 0).startsWith(`${T.TRUST_COOKIE}=;`));
check("nom de l'appareil lisible", T.deviceLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130 Safari/537") === "Chrome · Windows" && T.deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18 Mobile Safari/604") === "Safari · iPhone / iPad" && T.deviceLabel("") === "Navigateur");

// --- 2. décision du serveur (lib/mfa.js) -------------------------------------------------------
const enrolled = { factors: [{ id: "f1", status: "verified" }] };
check("inscrit + aal1 + session de confiance → accepté", mfaState(enrolled, jwt("aal1"), { requiredForAll: false, trusted: true }).satisfied === true);
check("inscrit + aal1 sans confiance → mfa_required", mfaState(enrolled, jwt("aal1"), { requiredForAll: false }).code === "mfa_required");
check("non inscrit + obligatoire + « confiance » → toujours l'inscription (la confiance ne remplace jamais un facteur)", mfaState({ factors: [] }, jwt("aal1"), { requiredForAll: true, trusted: true }).code === "mfa_enrollment_required");
check("confiance absente (0) → code demandé", mfaState(enrolled, jwt("aal1"), { requiredForAll: false, trusted: 0 }).satisfied === false);

// --- 3. serveur et routes, base en mémoire --------------------------------------------------------
const USERS = {
    [jwt("aal1", "u1")]: { id: "u1", email: "admin@exemple.ca", ...enrolled },
    [jwt("aal2", "u1")]: { id: "u1", email: "admin@exemple.ca", ...enrolled },
    [jwt("aal1", "u1", S2)]: { id: "u1", email: "admin@exemple.ca", ...enrolled },
    [jwt("aal1", "p1", S3)]: { id: "p1", email: "parent@exemple.ca", ...enrolled },
    [jwt("aal2", "p1", S3)]: { id: "p1", email: "parent@exemple.ca", ...enrolled },
    [jwt("aal1", "x1", S2)]: { id: "x1", email: "autre@exemple.ca", ...enrolled },
};
const db = createFakeSupabase({
    admin_allowlist: [{ email: "admin@exemple.ca", role: "admin", name: "Admin" }],
    profiles: [{ id: "p1", email: "parent@exemple.ca", role: "parent" }],
    mfa_trusted_devices: [],
    mfa_trusted_sessions: [],
});
db.auth = { getUser: async (t) => (USERS[t] ? { data: { user: USERS[t] }, error: null } : { data: { user: null }, error: { message: "jeton invalide" } }) };
installFakeSupabase(db);
const req = (token, path, { method = "POST", cookie = null } = {}) =>
    new NextRequest(`https://app.exemple.ca${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...(cookie ? { cookie: `${T.TRUST_COOKIE}=${cookie}` } : {}) },
    });
const cookieOf = (res) => new RegExp(`${T.TRUST_COOKIE}=([^;]*)`).exec(res.headers.get("set-cookie") || "")?.[1] ?? null;

const refused = await trustRoute.POST(req(jwt("aal1", "u1"), "/v1/auth/mfa/trust"));
check("se souvenir sans code (aal1) → 403, aucun appareil créé", refused.status === 403 && db.tables.mfa_trusted_devices.length === 0);
const trusted = await trustRoute.POST(req(jwt("aal2", "u1"), "/v1/auth/mfa/trust"));
const cookie = cookieOf(trusted);
const stored = db.tables.mfa_trusted_devices[0];
check("après le code (aal2) → 201, témoin posé, appareil enregistré", trusted.status === 201 && Boolean(cookie) && stored?.user_id === "u1" && stored?.label === "Chrome · Windows");
check("le jeton n'est jamais stocké : seule son empreinte", Boolean(cookie) && !JSON.stringify(stored).includes(cookie.split(".")[1]) && stored.token_hash === T.hashTrustToken(cookie.split(".")[1]));
check("journal : appareil retenu, acteur = identifiant du compte (jamais le courriel : ces routes servent aussi aux clients)", db.tables.admin_audit_log?.some((l) => l.action === "mfa.device_trusted" && l.actor === "u1"));

const before = await getAdminFromRequest(req(jwt("aal1", "u1"), "/v1/admin/leads", { method: "GET" }));
check("nouvelle connexion (aal1), avant le témoin → admin refusé (mfa_required)", before === null);
const redeem = await sessionRoute.POST(req(jwt("aal1", "u1"), "/v1/auth/mfa/trusted-session", { cookie }));
check("témoin présenté → session de confiance", (await redeem.json()).trusted === true && db.tables.mfa_trusted_sessions.some((s) => s.session_id === S1 && s.user_id === "u1"));
const after = await getAdminFromRequest(req(jwt("aal1", "u1"), "/v1/admin/leads", { method: "GET" }));
check("même session ensuite → admin accepté sans code", after?.role === "admin" && after?.mfa?.trusted_device === true);
const otherSession = await getAdminFromRequest(req(jwt("aal1", "u1", S2), "/v1/admin/leads", { method: "GET" }));
check("autre session du même compte, sans témoin → toujours refusée", otherSession === null);

const stolen = await sessionRoute.POST(req(jwt("aal1", "x1", S2), "/v1/auth/mfa/trusted-session", { cookie }));
check("témoin présenté par un autre compte → refusé et effacé", (await stolen.json()).trusted === false && cookieOf(stolen) === "" && !db.tables.mfa_trusted_sessions.some((s) => s.user_id === "x1"));
const forged = await sessionRoute.POST(req(jwt("aal1", "u1", S2), "/v1/auth/mfa/trusted-session", { cookie: `${cookie.split(".")[0]}.${"f".repeat(64)}` }));
check("jeton falsifié (bon identifiant) → refusé", (await forged.json()).trusted === false && !db.tables.mfa_trusted_sessions.some((s) => s.session_id === S2));
const noCookie = await sessionRoute.POST(req(jwt("aal1", "u1", S2), "/v1/auth/mfa/trusted-session"));
check("sans témoin → pas de confiance", (await noCookie.json()).trusted === false);

// Espace client (parent) : même mécanique, via getUserWithRole.
await trustRoute.POST(req(jwt("aal2", "p1", S3), "/v1/auth/mfa/trust"));
const parentCookie = cookieOf(await trustRoute.POST(req(jwt("aal2", "p1", S3), "/v1/auth/mfa/trust")));
const pBefore = await getUserWithRole(req(jwt("aal1", "p1", S3), "/v1/parent/x", { method: "GET" }), "parent");
await sessionRoute.POST(req(jwt("aal1", "p1", S3), "/v1/auth/mfa/trusted-session", { cookie: parentCookie }));
const pAfter = await getUserWithRole(req(jwt("aal1", "p1", S3), "/v1/parent/x", { method: "GET" }), "parent");
check("parent : refusé en aal1, accepté une fois le témoin présenté", pBefore === null && pAfter?.mfa?.satisfied === true);

const list = await devicesRoute.GET(req(jwt("aal1", "u1"), "/v1/auth/mfa/devices", { method: "GET", cookie }));
const listed = (await list.json()).devices || [];
check("liste des appareils : celui-ci marqué « current », jamais l'empreinte", listed.length === 1 && listed[0].current === true && !("token_hash" in listed[0]));
const blocked = await devicesRoute.GET(req(jwt("aal1", "u1", S2), "/v1/auth/mfa/devices", { method: "GET" }));
check("liste refusée sans double authentification (aal1 hors confiance)", blocked.status === 403);
const forget = await devicesRoute.DELETE(req(jwt("aal1", "u1"), `/v1/auth/mfa/devices?id=${listed[0].id}`, { method: "DELETE", cookie }));
check("oublier cet appareil → retiré, témoin effacé, journal", (await forget.json()).revoked === 1 && cookieOf(forget) === "" && db.tables.admin_audit_log.some((l) => l.action === "mfa.device_forgotten"));
const afterForget = await getAdminFromRequest(req(jwt("aal1", "u1"), "/v1/admin/leads", { method: "GET" }));
check("appareil oublié → la session de confiance ne vaut plus (code redemandé)", afterForget === null);
const all = await devicesRoute.DELETE(req(jwt("aal2", "p1", S3), "/v1/auth/mfa/devices", { method: "DELETE" }));
check("oublier tous les appareils (parent) → 2 retirés", (await all.json()).revoked === 2);

// --- 4. base : la politique restrictive accepte la session de confiance, avec facteur vérifié exigé (migration 0004)
const { readFileSync } = await import("node:fs");
const migSql = readFileSync(new URL("../../supabase/migrations/0004_mfa_trusted_devices.sql", import.meta.url), "utf8");
const altered = new Set([...migSql.matchAll(/^alter policy "authenticated requires aal2" on public\.([a-z_]+)\s+using \(\(select public\.mfa_session_ok\(\)\)\) with check \(\(select public\.mfa_session_ok\(\)\)\)/gm)].map((m) => m[1]));
check("0004 : profiles accepte « aal2 OU session de confiance »", altered.has("profiles"), [...altered].join(", "));
check("mfa_session_ok() : session de confiance seulement avec un facteur vérifié", /from auth\.mfa_factors f\s+where f\.user_id = auth\.uid\(\) and f\.status = 'verified'/.test(migSql));
check("tables des appareils fermées au navigateur (revoke all)", /revoke all on public\.mfa_trusted_devices from anon, authenticated;/.test(migSql) && /revoke all on public\.mfa_trusted_sessions from anon, authenticated;/.test(migSql));

process.exit(ok ? 0 : 1);
