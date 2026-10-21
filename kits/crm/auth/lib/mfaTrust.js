// Kit CRM (methode-travail) — origine : KHI Educ, lib/mfaTrust.js, oct. 2026. À adapter : voir BRIQUE.md.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Appareils de confiance de la double authentification : « Se souvenir de cet appareil pendant 30 jours »,
// pour l'équipe et les espaces clients. Schéma et politiques : supabase/migrations/0004_mfa_trusted_devices.sql.
//
//   1. Code juste (session aal2), case cochée → POST /v1/auth/mfa/trust : trustDevice crée l'appareil
//      (empreinte SHA-256 d'un jeton aléatoire de 32 octets — le jeton lui-même n'est jamais stocké) et la
//      route pose le témoin httpOnly TRUST_COOKIE = « <id>.<jeton> » pour 30 jours.
//   2. Connexion suivante sur cet appareil (session aal1, facteur inscrit) → POST /v1/auth/mfa/trusted-session :
//      redeemTrustCookie vérifie le témoin pour CE compte et inscrit la session Supabase en cours (claim
//      session_id du jeton) dans mfa_trusted_sessions, jusqu'à l'échéance de l'appareil.
//   3. lib/authServer.js (isTrustedSession → mfaState({ trusted })) et la base (public.mfa_session_ok())
//      acceptent « aal2 OU session de confiance ».
// Le témoin seul n'ouvre rien : il faut aussi la session du compte (mot de passe ou Google) ; la confiance ne
// vaut que pour la session ouverte sur l'appareil qui l'a présenté. Les fonctions pures prennent la date en
// paramètre (tests : tests/unit/mfa-trust.test.mjs).

export const TRUST_DAYS = 30;
// Nom du témoin : à préfixer par le projet (deux applications sur le même domaine ne doivent pas le partager).
export const TRUST_COOKIE = "crm_mfa_device";
// Le témoin ne part qu'avec les routes qui le lisent (aucune autre requête ne le transporte).
export const TRUST_COOKIE_PATH = "/v1/auth/mfa";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export const hashTrustToken = (token) => createHash("sha256").update(String(token)).digest("hex");

export const trustExpiry = (now) => new Date(new Date(now).getTime() + TRUST_DAYS * 24 * 60 * 60 * 1000);

// « <uuid>.<64 hex> » → { id, token } ; tout autre texte → null.
export const parseTrustCookie = (value) => {
    const [id, token, extra] = String(value || "").split(".");
    if (extra !== undefined || !UUID_RE.test(id || "") || !TOKEN_RE.test(token || "")) return null;
    return { id: id.toLowerCase(), token };
};

// Identifiant de la session Supabase (claim session_id du jeton, déjà validé par auth.getUser) ou null.
export const sessionIdOf = (jwt) => {
    try {
        const payload = String(jwt || "").split(".")[1];
        if (!payload) return null;
        const sid = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.session_id;
        return typeof sid === "string" && UUID_RE.test(sid) ? sid.toLowerCase() : null;
    } catch {
        return null;
    }
};

const sameHash = (a, b) => {
    const x = Buffer.from(String(a || ""), "utf8");
    const y = Buffer.from(String(b || ""), "utf8");
    return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

// La règle : l'appareil appartient à ce compte, n'est ni retiré ni échu, et le jeton présenté est le sien.
export const deviceAccepts = (device, { userId, token, now }) =>
    Boolean(
        device &&
            userId &&
            device.user_id === userId &&
            !device.revoked_at &&
            new Date(device.expires_at).getTime() > new Date(now).getTime() &&
            sameHash(device.token_hash, hashTrustToken(token)),
    );

// Une session de confiance vaut tant que sa ligne et son appareil sont valides pour ce compte.
export const trustedSessionValid = (session, device, { userId, now }) => {
    const t = new Date(now).getTime();
    return Boolean(
        session &&
            device &&
            userId &&
            session.user_id === userId &&
            device.user_id === userId &&
            session.device_id === device.id &&
            new Date(session.expires_at).getTime() > t &&
            !device.revoked_at &&
            new Date(device.expires_at).getTime() > t,
    );
};

// En-tête Set-Cookie du témoin (maxAge en secondes ; 0 = effacer).
export const trustCookieHeader = (value, maxAge) =>
    [
        `${TRUST_COOKIE}=${maxAge > 0 ? value : ""}`,
        `Path=${TRUST_COOKIE_PATH}`,
        `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
    ].join("; ");

// Nom lisible de l'appareil, pour la liste « Appareils de confiance » (navigateur et système, sans version).
export const deviceLabel = (userAgent) => {
    const ua = String(userAgent || "");
    const browser = /Edg\//.test(ua)
        ? "Edge"
        : /OPR\/|Opera/.test(ua)
          ? "Opera"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "Navigateur";
    const os = /iPhone|iPad|iPod/.test(ua)
        ? "iPhone / iPad"
        : /Android/.test(ua)
          ? "Android"
          : /Windows/.test(ua)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(ua)
              ? "Mac"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
    return os ? `${browser} · ${os}` : browser;
};

// --- accès à la base (service_role) ----------------------------------------------------------

// Nouvel appareil de confiance → { device, cookieValue } (cookieValue à poser dans le témoin).
export const trustDevice = async (supabase, { userId, userAgent, now = new Date() }) => {
    const token = randomBytes(32).toString("hex");
    const { data, error } = await supabase
        .from("mfa_trusted_devices")
        .insert({
            user_id: userId,
            token_hash: hashTrustToken(token),
            label: deviceLabel(userAgent),
            expires_at: trustExpiry(now).toISOString(),
            last_used_at: new Date(now).toISOString(),
        })
        .select("id, label, created_at, expires_at")
        .single();
    if (error || !data) throw new Error(`mfa_trusted_devices : ${error?.message || "insertion impossible"}`);
    return { device: data, cookieValue: `${data.id}.${token}` };
};

// Témoin présenté à la connexion → l'appareil (session en cours inscrite comme session de confiance) ou null.
export const redeemTrustCookie = async (supabase, { cookieValue, userId, sessionId, now = new Date() }) => {
    const parsed = parseTrustCookie(cookieValue);
    if (!parsed || !userId || !sessionId) return null;
    const { data: device } = await supabase
        .from("mfa_trusted_devices")
        .select("id, user_id, token_hash, expires_at, revoked_at")
        .eq("id", parsed.id)
        .maybeSingle();
    if (!deviceAccepts(device, { userId, token: parsed.token, now })) return null;
    const { error } = await supabase
        .from("mfa_trusted_sessions")
        .upsert({ session_id: sessionId, user_id: userId, device_id: device.id, expires_at: device.expires_at }, { onConflict: "session_id" });
    if (error) {
        console.error("[mfaTrust] session de confiance :", error.message);
        return null;
    }
    await supabase.from("mfa_trusted_devices").update({ last_used_at: new Date(now).toISOString() }).eq("id", device.id);
    return device;
};

// La session en cours (claim session_id) est-elle une session de confiance de ce compte ?
export const isTrustedSession = async (supabase, { userId, sessionId, now = new Date() }) => {
    if (!userId || !sessionId) return false;
    try {
        const { data: session } = await supabase
            .from("mfa_trusted_sessions")
            .select("session_id, user_id, device_id, expires_at")
            .eq("session_id", sessionId)
            .maybeSingle();
        if (!session) return false;
        const { data: device } = await supabase
            .from("mfa_trusted_devices")
            .select("id, user_id, expires_at, revoked_at")
            .eq("id", session.device_id)
            .maybeSingle();
        return trustedSessionValid(session, device, { userId, now });
    } catch (e) {
        console.error("[mfaTrust] lecture de la session de confiance :", e.message);
        return false;
    }
};

// Appareils encore valides du compte (les plus récents d'abord).
export const listTrustedDevices = async (supabase, { userId, now = new Date() }) => {
    const { data, error } = await supabase
        .from("mfa_trusted_devices")
        .select("id, user_id, label, created_at, expires_at, last_used_at, revoked_at")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
    if (error) throw new Error(`mfa_trusted_devices : ${error.message}`);
    const t = new Date(now).getTime();
    return (data || [])
        .filter((d) => d.user_id === userId && !d.revoked_at && new Date(d.expires_at).getTime() > t)
        .map(({ id, label, created_at, expires_at, last_used_at }) => ({ id, label, created_at, expires_at, last_used_at }));
};

// Oublier un appareil (id) ou tous (id absent) → nombre d'appareils retirés.
export const revokeTrustedDevices = async (supabase, { userId, id = null, now = new Date() }) => {
    let q = supabase.from("mfa_trusted_devices").update({ revoked_at: new Date(now).toISOString() }).eq("user_id", userId).is("revoked_at", null);
    if (id) q = q.eq("id", id);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`mfa_trusted_devices : ${error.message}`);
    return (data || []).length;
};
