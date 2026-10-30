// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa-supabase.ts, commit 508f19a (2026-10-30) ; généralisé : adresse et clé publique lues dans NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (ou passées en option), émetteur MFA_ISSUER puis SITE_NAME, fuseau du nom de facteur en option, messages [à adapter].
//
// SERVEUR SEULEMENT. Appels à Supabase Auth pour la double vérification de l'équipe, faits par le serveur avec
// le jeton de la session du membre (mêmes adresses publiques que le SDK) :
//   POST   /auth/v1/factors                 → inscription (code QR, clé)
//   POST   /auth/v1/factors/{id}/challenge   → défi
//   POST   /auth/v1/factors/{id}/verify      → code juste ⇒ nouvelle session aal2 (jetons renvoyés)
//   DELETE /auth/v1/factors/{id}             → retrait (Supabase exige aal2 pour un facteur vérifié)
//   POST   /auth/v1/logout?scope=local       → fin de la session en cours
// Supabase applique ses propres règles (aal2 exigé pour inscrire un 2e facteur, limite d'essais) en plus des
// nôtres. Jamais de jeton, de clé ni de code dans un journal : seuls le code d'erreur et le statut le sont.
import { mfaIssuer, type AuthFactor } from '@/lib/auth/mfa';

export interface MfaApiError {
  code: string | null;
  status: number;
}

export interface VerifiedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}

type FetchLike = typeof fetch;

export interface MfaAuthConfig {
  url?: string | null;
  anonKey?: string | null;
}

export interface MfaCallOptions {
  fetchImpl?: FetchLike;
  /** Défaut : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY. */
  config?: MfaAuthConfig;
}

function endpoint(path: string, config: MfaAuthConfig | undefined): { url: string; anonKey: string } | null {
  const url = (config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = (config?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !anonKey) return null;
  return { url: `${url.replace(/\/+$/, '')}/auth/v1${path}`, anonKey };
}

async function call<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown> | null,
  { fetchImpl = fetch, config }: MfaCallOptions,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<{ data: T | null; error: MfaApiError | null }> {
  const target = endpoint(path, config);
  if (!target) return { data: null, error: { code: 'missing_config', status: 500 } };
  try {
    const response = await fetchImpl(target.url, {
      method,
      headers: { apikey: target.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
    });
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof json?.error_code === 'string' ? json.error_code : typeof json?.code === 'string' ? json.code : null;
      return { data: null, error: { code, status: response.status } };
    }
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: { code: 'network', status: 0 } };
  }
}

/** Code QR en adresse `data:` affichable dans une balise <img> (aucune dépendance : Supabase fournit le SVG). */
export function qrDataUrl(qr: unknown): string {
  const value = String(qr ?? '');
  if (!value) return '';
  return value.startsWith('data:') ? value : `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
}

/** [à adapter] Nom du facteur dans la liste de Supabase (unicité exigée par Supabase → date et heure). */
export function factorName(now: Date, withSeconds = false, timeZone = 'America/Toronto'): string {
  const stamp = now.toLocaleString('fr-CA', { timeZone, dateStyle: 'medium', timeStyle: withSeconds ? 'medium' : 'short' });
  return `Téléphone ajouté le ${stamp}`;
}

/** Nouveau facteur TOTP (non vérifié) → { id, qr, secret }. */
export async function enrollTotp(
  accessToken: string,
  { now = new Date(), timeZone, issuer = mfaIssuer(), ...options }: MfaCallOptions & { now?: Date; timeZone?: string; issuer?: string } = {},
): Promise<{ data: { id: string; qr: string; secret: string } | null; error: MfaApiError | null }> {
  type Enrolled = { id?: string; totp?: { qr_code?: string; secret?: string } };
  const body = (withSeconds: boolean) => ({ factor_type: 'totp', friendly_name: factorName(now, withSeconds, timeZone), issuer });
  let result = await call<Enrolled>('/factors', accessToken, body(false), options);
  // Deux inscriptions dans la même minute (deux onglets) : on ajoute les secondes.
  if (result.error?.code === 'mfa_factor_name_conflict') result = await call<Enrolled>('/factors', accessToken, body(true), options);
  if (result.error || !result.data?.id) return { data: null, error: result.error ?? { code: null, status: 500 } };
  return {
    data: { id: result.data.id, qr: qrDataUrl(result.data.totp?.qr_code), secret: String(result.data.totp?.secret ?? '') },
    error: null,
  };
}

/** Défi puis vérification d'un facteur → nouvelle session (aal2) ou erreur. */
export async function challengeAndVerify(
  accessToken: string,
  factorId: string,
  code: string,
  options: MfaCallOptions = {},
): Promise<{ session: VerifiedSession | null; error: MfaApiError | null }> {
  const id = encodeURIComponent(factorId);
  const challenge = await call<{ id?: string }>(`/factors/${id}/challenge`, accessToken, {}, options);
  if (challenge.error || !challenge.data?.id) return { session: null, error: challenge.error ?? { code: null, status: 500 } };
  type Verified = { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string } };
  const verified = await call<Verified>(`/factors/${id}/verify`, accessToken, { challenge_id: challenge.data.id, code }, options);
  const data = verified.data;
  if (verified.error || !data?.access_token || !data.refresh_token || !data.user?.email) {
    return { session: null, error: verified.error ?? { code: null, status: 500 } };
  }
  return {
    session: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 3600, email: data.user.email },
    error: null,
  };
}

/** Retrait d'un facteur par le membre lui-même (jeton de SA session). */
export async function unenrollFactor(accessToken: string, factorId: string, options: MfaCallOptions = {}): Promise<{ error: MfaApiError | null }> {
  const result = await call<unknown>(`/factors/${encodeURIComponent(factorId)}`, accessToken, null, options, 'DELETE');
  return { error: result.error };
}

/** Déconnexion : révoque la session en cours chez Supabase (`scope=local`). Ne lève jamais. */
export async function signOutSession(accessToken: string, { fetchImpl = fetch, config }: MfaCallOptions = {}): Promise<{ error: MfaApiError | null }> {
  const target = endpoint('/logout?scope=local', config);
  if (!target) return { error: { code: 'missing_config', status: 500 } };
  try {
    const response = await fetchImpl(target.url, {
      method: 'POST',
      headers: { apikey: target.anonKey, Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    return response.ok ? { error: null } : { error: { code: null, status: response.status } };
  } catch {
    return { error: { code: 'network', status: 0 } };
  }
}

// Codes d'erreur de Supabase Auth pour un code faux ou périmé.
const WRONG_CODE_ERRORS = new Set(['mfa_verification_failed', 'mfa_challenge_expired', 'mfa_verification_rejected']);
export const isWrongCodeError = (error: MfaApiError | null): boolean =>
  error !== null && (WRONG_CODE_ERRORS.has(error.code ?? '') || (!error.code && error.status === 422));
export const isFactorGoneError = (error: MfaApiError | null): boolean =>
  error !== null && (error.code === 'mfa_factor_not_found' || (!error.code && error.status === 404));
const ADMIN_ERRORS = new Set(['mfa_totp_enroll_not_enabled', 'mfa_totp_verify_not_enabled', 'too_many_enrolled_mfa_factors']);

/** [à adapter] Messages affichés (le message brut de Supabase, anglais et technique, n'est jamais montré). */
export const MFA_ERROR_MESSAGES = {
  wrongCode: 'Code incorrect ou expiré. Réessayez avec le code affiché maintenant.',
  rateLimited: 'Trop de tentatives. Patientez un moment, puis réessayez.',
  unavailable: 'La double vérification n’est pas disponible pour ce compte : prévenez l’administrateur.',
  generic: 'La vérification n’a pas abouti. Vérifiez votre connexion, puis réessayez.',
} as const;

export function mfaErrorMessage(error: MfaApiError | null): string {
  if (isWrongCodeError(error)) return MFA_ERROR_MESSAGES.wrongCode;
  if (error?.code === 'over_request_rate_limit' || error?.status === 429) return MFA_ERROR_MESSAGES.rateLimited;
  if (ADMIN_ERRORS.has(error?.code ?? '')) return MFA_ERROR_MESSAGES.unavailable;
  return MFA_ERROR_MESSAGES.generic;
}

/** Facteurs TOTP non vérifiés (essais abandonnés), à retirer avant une nouvelle inscription. */
export const unverifiedTotp = (factors: AuthFactor[] | null | undefined): AuthFactor[] =>
  (factors ?? []).filter((factor) => factor.factor_type === 'totp' && factor.status !== 'verified');
