// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa-route.ts, commit 508f19a (2026-10-30) ; généralisé : garde bâtie sur getTeamMember (session Supabase + liste blanche + matrice), message « mode jeton » importé de token-mode.ts, messages [à adapter] ; retirés : témoins de session propres à la source, exception du rôle le plus haut (la matrice décide pour tous) ; ajouté : verrou de compte des codes (account-lock.ts, codes de secours compris).
//
// Garde commune des routes de la double vérification (préfixe `AdminPaths.mfaApiPrefix`). Ces routes agissent
// TOUJOURS sur le compte de la session, jamais sur un identifiant reçu. La double vérification n'y bloque pas
// (`enforceMfa: false` : c'est là qu'on la satisfait) ; chaque route ajoute sa propre exigence (code donné,
// aal2…) et la matrice d'accès est revérifiée (défense en profondeur).
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { TOKEN_MODE_REFUSED_MESSAGE } from '@/lib/admin/token-mode';
import {
  type AccountLockOptions,
  accountLockedFor,
  accountLockedResponse,
  accountLockKey,
  MFA_LOCK_SCOPE,
  recordBackupCodeResult,
  recordFailedMfaCode,
} from '@/lib/api/account-lock';
import type { RedeemResult } from '@/lib/auth/mfa-backup-codes';
import { MFA_MESSAGES } from '@/lib/auth/mfa';
import { deny, getTeamMember, type TeamSessionOptions } from '@/lib/auth/team-session';
import type { MfaCode, TeamMember } from '@/lib/auth/types';

/** Message d'un projet qui a hérité d'un mode jeton : sans compte nominatif, pas de double vérification. */
export const TOKEN_MODE_MESSAGE = TOKEN_MODE_REFUSED_MESSAGE;

export interface MfaSession {
  member: TeamMember;
  /** Jeton de la session (vérifié), pour les appels à Supabase Auth (`mfa-supabase.ts`). */
  accessToken: string;
}

export async function getMfaSession(
  request: Request,
  options: Omit<TeamSessionOptions, 'enforceMfa' | 'db'> & { db: Pick<SupabaseClient, 'from' | 'auth'> | null },
): Promise<{ session: MfaSession; finalize: (response: NextResponse) => NextResponse } | { error: NextResponse }> {
  const result = await getTeamMember(request, { ...options, enforceMfa: false });
  if (!result.ok) return { error: deny(result.refusal) };
  const finalize = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  return { session: { member: result.member, accessToken: result.accessToken }, finalize };
}

/** [à adapter] Messages des blocages anti-abus des routes du code. */
export const MFA_ACCOUNT_LOCKED_MESSAGE = 'Trop de codes incorrects. Pour votre sécurité, attendez 15 minutes avant de réessayer.';
export const MFA_THROTTLED_MESSAGE = 'Trop d’essais. Patientez un moment, puis réessayez.';

/** Réponse 429 d'un compteur anti-abus, réécrite en français (même statut, même Retry-After). */
export function mfaThrottled(response: NextResponse): NextResponse {
  const retryAfter = response.headers.get('Retry-After');
  return NextResponse.json(
    { ok: false, error: MFA_THROTTLED_MESSAGE },
    { status: response.status, headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) } },
  );
}

/** 403 « entrez d'abord le code » (ou « activez-la ») avec le code que l'écran reconnaît. */
export function mfaRefusal(code: MfaCode, message: string = MFA_MESSAGES[code]): NextResponse {
  return NextResponse.json({ ok: false, error: message, code }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

// Verrou de compte des routes du code (`account-lock.ts`, ACCOUNT_MFA_RULE : 4 échecs tolérés en 15 min, le 5e
// bloque le compte 15 min, quel que soit l'appareil). Codes à 6 chiffres et codes de secours partagent le compteur.
// Clé = empreinte du courriel de la SESSION (jamais d'un courriel reçu dans la requête).

/** Empreinte du compteur des codes du membre. */
export const mfaLockKey = (member: Pick<TeamMember, 'email'>): string => accountLockKey(MFA_LOCK_SCOPE, member.email);

/** À appeler AVANT de vérifier un code : 429 (sans indice) si le compte est verrouillé, sinon null. */
export async function mfaAccountLock(member: Pick<TeamMember, 'email'>, options: AccountLockOptions = {}): Promise<NextResponse | null> {
  const lockedFor = await accountLockedFor(mfaLockKey(member), options);
  return lockedFor > 0 ? noStore(accountLockedResponse(lockedFor, MFA_ACCOUNT_LOCKED_MESSAGE)) : null;
}

/** Code à 6 chiffres faux : un échec compté ; 429 s'il vient de bloquer le compte, sinon null. */
export async function recordMfaCodeFailure(member: Pick<TeamMember, 'email'>, options: AccountLockOptions = {}): Promise<NextResponse | null> {
  const blockedFor = await recordFailedMfaCode(mfaLockKey(member), options);
  return blockedFor > 0 ? noStore(accountLockedResponse(blockedFor, MFA_ACCOUNT_LOCKED_MESSAGE)) : null;
}

/** Résultat de `redeemBackupCode` : chaque `invalid` compte comme un code faux ; 429 s'il vient de bloquer, sinon null. */
export async function recordBackupCodeAttempt(
  member: Pick<TeamMember, 'email'>,
  result: RedeemResult,
  options: AccountLockOptions = {},
): Promise<NextResponse | null> {
  const blockedFor = await recordBackupCodeResult(mfaLockKey(member), result, options);
  return blockedFor > 0 ? noStore(accountLockedResponse(blockedFor, MFA_ACCOUNT_LOCKED_MESSAGE)) : null;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
