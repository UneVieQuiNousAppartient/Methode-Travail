// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa-trust.ts, commit 508f19a (2026-10-30) ; généralisé : nom du témoin lu dans MFA_TRUST_COOKIE (défaut « mfa_device »), chemin du témoin en paramètre (préfixe des routes MFA), SameSite=Strict, colonne `reason` des sessions (« device » seule rend une session de confiance, « backup_code » jamais), clé (user_id, session_id, reason).
//
// Appareils de confiance de la double vérification : « se souvenir de cet appareil pendant 30 jours », pour
// l'équipe. Schéma : supabase/migrations/0105_mfa_trusted_devices.sql.
//
//   1. Code juste (session aal2), case cochée → route « verify » (ou « trust ») : `trustDevice` crée l'appareil
//      (empreinte SHA-256 d'un jeton aléatoire de 32 octets — le jeton n'est jamais stocké) et la route pose le
//      témoin httpOnly = « <id>.<jeton> » pour 30 jours.
//   2. Connexion suivante sur cet appareil (session aal1, facteur inscrit) → route « trusted-session » :
//      `redeemTrustCookie` vérifie le témoin pour CE compte et inscrit la session Supabase en cours (claim
//      `session_id`) dans `mfa_trusted_sessions` avec `reason = 'device'`, jusqu'à l'échéance de l'appareil.
//   3. `team-session.ts` → `isTrustedSession` → `mfaState({ trusted })` accepte « aal2 OU session de confiance ».
// Le témoin seul n'ouvre rien : il faut aussi la session du compte. Hachage par Web Crypto (asynchrone) : le
// module reste utilisable par le middleware (Edge).
//
// Lignes `reason = 'backup_code'` (session de récupération d'une heure, écrites par `mfa-backup-codes.ts`) :
// elles ne rendent JAMAIS une session « de confiance », ni ici ni dans `public.mfa_session_ok()`.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';
import { DEFAULT_ADMIN_PATHS } from '@/lib/authz/access-matrix';

export const TRUST_DAYS = 30;
export const TRUST_MAX_AGE_SECONDS = TRUST_DAYS * 24 * 60 * 60;

/** Nom du témoin : MFA_TRUST_COOKIE, sinon « mfa_device ». */
export function trustCookieName(env: Record<string, string | undefined> = process.env): string {
  const name = env.MFA_TRUST_COOKIE?.trim();
  return name && /^[A-Za-z0-9_-]{1,64}$/.test(name) ? name : 'mfa_device';
}
export const TRUST_COOKIE = trustCookieName();
/** Le témoin ne part qu'avec les routes qui le lisent (aucune page ni autre API ne le transporte). */
export const DEFAULT_TRUST_COOKIE_PATH = DEFAULT_ADMIN_PATHS.mfaApiPrefix;

/** Seule raison qui rend une session « de confiance ». */
export const TRUSTED_SESSION_REASON = 'device';
export type TrustedSessionReason = 'device' | 'backup_code';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function hashTrustToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return toHex(new Uint8Array(digest));
}

export function newTrustToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export const trustExpiry = (now: Date | string | number) => new Date(new Date(now).getTime() + TRUST_MAX_AGE_SECONDS * 1000);

/** « <uuid>.<64 hex> » → { id, token } ; tout autre texte → null. */
export function parseTrustCookie(value: unknown): { id: string; token: string } | null {
  const [id, token, extra] = String(value ?? '').split('.');
  if (extra !== undefined || !UUID_RE.test(id || '') || !TOKEN_RE.test(token || '')) return null;
  return { id: id.toLowerCase(), token };
}

/** Comparaison en temps constant (à longueur égale). */
function sameText(a: unknown, b: unknown): boolean {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < x.length; index += 1) diff |= x.charCodeAt(index) ^ y.charCodeAt(index);
  return diff === 0;
}

export interface TrustedDeviceRow {
  id: string;
  user_id: string;
  token_hash?: string;
  label?: string | null;
  created_at?: string;
  expires_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface TrustedSessionRow {
  session_id: string;
  user_id: string;
  device_id: string | null;
  reason: TrustedSessionReason | string;
  expires_at: string;
}

/** La règle : l'appareil appartient à ce compte, n'est ni retiré ni échu, et le jeton présenté est le sien. */
export async function deviceAccepts(
  device: TrustedDeviceRow | null | undefined,
  { userId, token, now }: { userId: string | null | undefined; token: string; now: Date | string | number },
): Promise<boolean> {
  if (!device || !userId || device.user_id !== userId || device.revoked_at) return false;
  if (new Date(device.expires_at).getTime() <= new Date(now).getTime()) return false;
  return sameText(device.token_hash, await hashTrustToken(token));
}

/** Une session de confiance vaut tant que sa ligne (`reason = 'device'`) et son appareil sont valides pour ce compte. */
export function trustedSessionValid(
  session: TrustedSessionRow | null | undefined,
  device: TrustedDeviceRow | null | undefined,
  { userId, now }: { userId: string | null | undefined; now: Date | string | number },
): boolean {
  const t = new Date(now).getTime();
  return Boolean(
    session &&
      device &&
      userId &&
      session.reason === TRUSTED_SESSION_REASON &&
      session.user_id === userId &&
      device.user_id === userId &&
      session.device_id === device.id &&
      new Date(session.expires_at).getTime() > t &&
      !device.revoked_at &&
      new Date(device.expires_at).getTime() > t,
  );
}

/** Attributs du témoin (maxAge en secondes ; 0 = effacer). Chemin = préfixe des routes MFA. */
export function trustCookieOptions(maxAge: number, path: string = DEFAULT_TRUST_COOKIE_PATH) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path,
    maxAge: Math.max(0, Math.floor(maxAge)),
  };
}

export function setTrustCookie(response: NextResponse, value: string, { path = DEFAULT_TRUST_COOKIE_PATH, name = TRUST_COOKIE } = {}): void {
  response.cookies.set(name, value, trustCookieOptions(TRUST_MAX_AGE_SECONDS, path));
}

export function clearTrustCookie(response: NextResponse, { path = DEFAULT_TRUST_COOKIE_PATH, name = TRUST_COOKIE } = {}): void {
  response.cookies.set(name, '', trustCookieOptions(0, path));
}

/** Nom lisible de l'appareil (navigateur et système, sans version). */
export function deviceLabel(userAgent: unknown): string {
  const ua = String(userAgent ?? '');
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navigateur';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone / iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

// --- accès à la base (service_role) ----------------------------------------------------------

type Db = Pick<SupabaseClient, 'from'>;

/** Nouvel appareil de confiance → { device, cookieValue } (cookieValue à poser dans le témoin). */
export async function trustDevice(
  supabase: Db,
  { userId, userAgent, now = new Date() }: { userId: string; userAgent: string | null; now?: Date },
): Promise<{ device: { id: string; label: string | null; created_at: string; expires_at: string }; cookieValue: string }> {
  const token = newTrustToken();
  const { data, error } = await supabase
    .from('mfa_trusted_devices')
    .insert({
      user_id: userId,
      token_hash: await hashTrustToken(token),
      label: deviceLabel(userAgent),
      expires_at: trustExpiry(now).toISOString(),
      last_used_at: new Date(now).toISOString(),
    })
    .select('id, label, created_at, expires_at')
    .single();
  if (error || !data) throw new Error(`mfa_trusted_devices : ${error?.code ?? 'insertion impossible'}`);
  const device = data as { id: string; label: string | null; created_at: string; expires_at: string };
  return { device, cookieValue: `${device.id}.${token}` };
}

/** Témoin présenté à la connexion → l'appareil (session en cours inscrite comme session de confiance) ou null. */
export async function redeemTrustCookie(
  supabase: Db,
  { cookieValue, userId, sessionId, now = new Date() }: { cookieValue: unknown; userId: string | null; sessionId: string | null; now?: Date },
): Promise<TrustedDeviceRow | null> {
  const parsed = parseTrustCookie(cookieValue);
  if (!parsed || !userId || !sessionId) return null;
  const { data: device } = await supabase
    .from('mfa_trusted_devices')
    .select('id, user_id, token_hash, expires_at, revoked_at')
    .eq('id', parsed.id)
    .maybeSingle();
  const row = (device ?? null) as TrustedDeviceRow | null;
  if (!row || !(await deviceAccepts(row, { userId, token: parsed.token, now }))) return null;
  const { error } = await supabase
    .from('mfa_trusted_sessions')
    .upsert(
      { session_id: sessionId, user_id: userId, device_id: row.id, reason: TRUSTED_SESSION_REASON, expires_at: row.expires_at },
      { onConflict: 'user_id,session_id,reason' },
    );
  if (error) {
    console.error('[mfa-trust] session de confiance :', error.code ?? 'erreur');
    return null;
  }
  await supabase.from('mfa_trusted_devices').update({ last_used_at: new Date(now).toISOString() }).eq('id', row.id);
  return row;
}

/**
 * La session en cours (claim session_id) est-elle une session de confiance d'un APPAREIL de ce compte ?
 * Les lignes « backup_code » sont exclues par la requête ET par la règle. Ne lève jamais (erreur → false).
 */
export async function isTrustedSession(
  supabase: Db | null,
  { userId, sessionId, now = new Date() }: { userId: string | null; sessionId: string | null; now?: Date },
): Promise<boolean> {
  if (!supabase || !userId || !sessionId) return false;
  try {
    const { data: session, error } = await supabase
      .from('mfa_trusted_sessions')
      .select('session_id, user_id, device_id, reason, expires_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('reason', TRUSTED_SESSION_REASON)
      .maybeSingle();
    if (error || !session) return false;
    const row = session as TrustedSessionRow;
    if (!row.device_id) return false;
    const { data: device } = await supabase
      .from('mfa_trusted_devices')
      .select('id, user_id, expires_at, revoked_at')
      .eq('id', row.device_id)
      .maybeSingle();
    return trustedSessionValid(row, (device ?? null) as TrustedDeviceRow | null, { userId, now });
  } catch (error) {
    console.error('[mfa-trust] lecture de la session de confiance :', error instanceof Error ? error.name : 'inconnu');
    return false;
  }
}

export interface TrustedDeviceView {
  id: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
}

/** Appareils encore valides du compte (les plus récents d'abord). Jamais l'empreinte. */
export async function listTrustedDevices(supabase: Db, { userId, now = new Date() }: { userId: string; now?: Date }): Promise<TrustedDeviceView[]> {
  const { data, error } = await supabase
    .from('mfa_trusted_devices')
    .select('id, user_id, label, created_at, expires_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`mfa_trusted_devices : ${error.code ?? 'erreur'}`);
  const t = new Date(now).getTime();
  return ((data ?? []) as TrustedDeviceRow[])
    .filter((d) => d.user_id === userId && !d.revoked_at && new Date(d.expires_at).getTime() > t)
    .map(({ id, label, created_at, expires_at, last_used_at }) => ({
      id,
      label: label ?? null,
      created_at: created_at ?? '',
      expires_at,
      last_used_at: last_used_at ?? null,
    }));
}

/** Oublier un appareil (id) ou tous (id absent) → nombre d'appareils retirés. Toujours limité au compte. */
export async function revokeTrustedDevices(
  supabase: Db,
  { userId, id = null, now = new Date() }: { userId: string; id?: string | null; now?: Date },
): Promise<number> {
  let query = supabase
    .from('mfa_trusted_devices')
    .update({ revoked_at: new Date(now).toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (id) query = query.eq('id', id);
  const { data, error } = await query.select('id');
  if (error) throw new Error(`mfa_trusted_devices : ${error.code ?? 'erreur'}`);
  return (data ?? []).length;
}

/**
 * Déconnexion : la session Supabase qui se termine n'est plus « de confiance » ni « de récupération » (toutes
 * ses lignes disparaissent). Ne lève jamais (la déconnexion ne doit pas échouer pour ça).
 */
export async function forgetTrustedSession(supabase: Db | null, sessionId: string | null): Promise<void> {
  if (!supabase || !sessionId) return;
  try {
    const { error } = await supabase.from('mfa_trusted_sessions').delete().eq('session_id', sessionId);
    if (error) console.warn('[mfa-trust] oubli de la session de confiance :', error.code ?? 'erreur');
  } catch (error) {
    console.warn('[mfa-trust] oubli de la session de confiance :', error instanceof Error ? error.name : 'inconnu');
  }
}

/**
 * Tâche planifiée : supprime les sessions échues (appareil ou récupération) et les appareils échus ou oubliés
 * depuis plus de 30 jours (gardés un temps pour l'écran « Appareils de confiance »). Ne touche à rien de valide.
 * Ne lève jamais ; `null` si Supabase répond par une erreur ou si la base manque (jamais un faux 0).
 */
export async function purgeTrustedDevices(
  supabase: Db | null,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ sessions: number; devices: number } | null> {
  if (!supabase) return null;
  try {
    const nowIso = new Date(now).toISOString();
    const cutoff = new Date(new Date(now).getTime() - TRUST_MAX_AGE_SECONDS * 1000).toISOString();
    const sessions = await supabase.from('mfa_trusted_sessions').delete().lte('expires_at', nowIso).select('session_id');
    const expired = await supabase.from('mfa_trusted_devices').delete().lte('expires_at', nowIso).select('id');
    const revoked = await supabase.from('mfa_trusted_devices').delete().lt('revoked_at', cutoff).select('id');
    if (sessions.error || expired.error || revoked.error) {
      console.warn('[mfa-trust] purge :', sessions.error?.code ?? expired.error?.code ?? revoked.error?.code ?? 'erreur');
      return null;
    }
    return { sessions: (sessions.data ?? []).length, devices: (expired.data ?? []).length + (revoked.data ?? []).length };
  } catch (error) {
    console.warn('[mfa-trust] purge :', error instanceof Error ? error.name : 'inconnu');
    return null;
  }
}
