// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa-route.ts, commit 508f19a (2026-10-30) ; généralisé : garde bâtie sur getTeamMember (session Supabase + liste blanche + matrice), message « mode jeton » importé de token-mode.ts, messages [à adapter] ; retirés : témoins de session propres à la source, exception du rôle le plus haut (la matrice décide pour tous).
//
// Garde commune des routes de la double vérification (préfixe `AdminPaths.mfaApiPrefix`). Ces routes agissent
// TOUJOURS sur le compte de la session, jamais sur un identifiant reçu. La double vérification n'y bloque pas
// (`enforceMfa: false` : c'est là qu'on la satisfait) ; chaque route ajoute sa propre exigence (code donné,
// aal2…) et la matrice d'accès est revérifiée (défense en profondeur).
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { TOKEN_MODE_REFUSED_MESSAGE } from '@/lib/admin/token-mode';
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
