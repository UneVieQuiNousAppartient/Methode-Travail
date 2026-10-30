// Kit CRM TS (methode-travail) — origine : kit CRM JS (methode-travail), kits/crm/auth/lib/authServer.js (getAdminFromRequest, deny), commit 545da4e (2026-10-21) + VieSolution-CSF, src/lib/admin/auth.ts (forme TS seulement), commit 508f19a (2026-10-30) ; généralisé : périmètre fermé (session Supabase + liste blanche, ni clé d'API ni mode jeton), refus rendu par valeur (plus de WeakMap), aal et session_id lus seulement après auth.getUser, rôle lu dans la table et vérifié avant la double vérification, codes de secours (hasBackupCodes, recovery).
//
// Point d'entrée de l'équipe : une route de l'admin appelle `getTeamMember(request, { db })`, puis
// `deny(result.refusal)` si le résultat est un refus. Ordre (ne pas le changer) :
//   1. jeton `Authorization: Bearer` absent → 401 ;
//   2. `db.auth.getUser(token)` : jeton refusé (falsifié, expiré) → 401 ; RIEN n'est lu dans le jeton avant ;
//   3. seulement ensuite : `aal` et `session_id` lus dans la charge du jeton (désormais vérifié) ;
//   4. liste blanche : courriel de Supabase Auth en minuscules, comparé à l'identique ; rôle lu dans la table
//      (jamais dans le jeton ni dans la requête) ; absent ou rôle inconnu → 401 ;
//   5. rôle : `minRole` si fourni, sinon la matrice d'accès (méthode + chemin) → 403 { required_role } ;
//   6. double vérification (`mfa.ts`) : non satisfaite hors des chemins permis pendant l'étape du code
//      → 403 { code: mfa_required | mfa_enrollment_required }.
// Le cloisonnement des données reste vérifié dans chaque route.
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { MFA_MESSAGES, mfaState, sessionAal, sessionIdOf, isEnrolled, type AuthFactor } from '@/lib/auth/mfa';
import { isTrustedSession } from '@/lib/auth/mfa-trust';
import type { MfaCode, TeamMember, TeamRole } from '@/lib/auth/types';
import { DEFAULT_ACCESS_MATRIX, type AccessMatrix } from '@/lib/authz/access-matrix';

type Db = Pick<SupabaseClient, 'from' | 'auth'>;

export const DEFAULT_ALLOWLIST_TABLE = 'team_allowlist';

export type TeamRefusal =
  | { status: 401 }
  | { status: 403; requiredRole: TeamRole | null; role: TeamRole }
  | { status: 403; code: MfaCode }
  | { status: 503 };

export type TeamSessionResult = { ok: true; member: TeamMember; accessToken: string } | { ok: false; refusal: TeamRefusal };

export interface TeamSessionOptions {
  /** Client service_role (`getSupabaseAdmin()`) ; null → 503. */
  db: Db | null;
  allowlistTable?: string;
  matrix?: AccessMatrix<TeamRole>;
  /** Rôle minimal exigé par la route ; absent → la matrice décide (méthode + chemin). */
  minRole?: TeamRole;
  /** false : l'état MFA est calculé mais ne bloque pas (routes de la double vérification, `/me`). */
  enforceMfa?: boolean;
  /** ADMIN_MFA_REQUIRED (défaut : environnement). */
  requiredForAll?: boolean;
  alwaysRoles?: readonly string[];
  now?: Date;
}

/** [à adapter] Textes des refus. */
export const TEAM_SESSION_MESSAGES = {
  unauthenticated: 'Non authentifié.',
  forbidden: (required: string | null) => (required ? `Accès réservé au rôle ${required} ou plus.` : 'Accès refusé.'),
  unavailable: 'Administration indisponible : configuration incomplète.',
};

const refuse = (refusal: TeamRefusal): TeamSessionResult => ({ ok: false, refusal });

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Vérifie le jeton auprès de Supabase Auth, PUIS lit `aal` et `session_id`. Seule porte d'entrée vers ces
 * deux valeurs : une charge non vérifiée qui dit « aal2 » n'atteint jamais `mfaState`.
 */
export async function verifyAccessToken(
  db: Pick<SupabaseClient, 'auth'>,
  token: string | null,
): Promise<{ user: { id: string; email: string | null; factors: AuthFactor[] }; aal: ReturnType<typeof sessionAal>; sessionId: string | null } | null> {
  if (!token) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    const user = data?.user;
    if (error || !user?.id) return null;
    return {
      user: { id: user.id, email: typeof user.email === 'string' ? user.email : null, factors: (user.factors ?? []) as AuthFactor[] },
      aal: sessionAal(token),
      sessionId: sessionIdOf(token),
    };
  } catch {
    return null;
  }
}

/** Ligne de la liste blanche pour ce courriel (déjà en minuscules) ; erreur ou absence → null (refus). */
async function readAllowlist(db: Db, table: string, email: string): Promise<{ email?: unknown; role?: unknown } | null> {
  try {
    const { data, error } = await db.from(table).select('email, role').eq('email', email).maybeSingle();
    return error ? null : ((data ?? null) as { email?: unknown; role?: unknown } | null);
  } catch {
    return null;
  }
}

/** Le membre a-t-il au moins une ligne de codes de secours ? Erreur de lecture → true (échec fermé). */
async function hasBackupCodesOf(db: Db, userId: string): Promise<boolean> {
  try {
    const { count, error } = await db.from('mfa_backup_codes').select('user_id', { count: 'exact', head: true }).eq('user_id', userId);
    return error ? true : (count ?? 0) > 0;
  } catch {
    return true;
  }
}

/** Session de récupération (code de secours) valide pour CETTE session ? Erreur → false (elle n'ouvre rien). */
async function isRecoverySession(db: Db, userId: string, sessionId: string | null, now: Date): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const { data, error } = await db
      .from('mfa_trusted_sessions')
      .select('session_id, expires_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('reason', 'backup_code')
      .gt('expires_at', now.toISOString())
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export async function getTeamMember(request: Request, options: TeamSessionOptions): Promise<TeamSessionResult> {
  const { db, allowlistTable = DEFAULT_ALLOWLIST_TABLE, matrix = DEFAULT_ACCESS_MATRIX, minRole, enforceMfa = true, now = new Date() } = options;
  if (!db) return refuse({ status: 503 });

  // 1-3. Jeton, vérification par Supabase Auth, puis seulement la lecture des claims.
  const token = bearerToken(request);
  const verified = await verifyAccessToken(db, token);
  if (!token || !verified) return refuse({ status: 401 });
  const { user, aal, sessionId } = verified;

  // 4. Liste blanche : comparaison exacte en minuscules (la contrainte SQL garde la table en minuscules).
  const email = user.email?.trim().toLowerCase();
  if (!email) return refuse({ status: 401 });
  const row = await readAllowlist(db, allowlistTable, email);
  if (!row || row.email !== email || !matrix.roles.isRole(row.role)) return refuse({ status: 401 });
  const role = row.role;

  // 5. Rôle AVANT la double vérification : un rôle insuffisant n'est jamais invité à saisir un code.
  const url = new URL(request.url);
  const requiredRole = minRole ?? matrix.requiredRole(request.method, url.pathname);
  if (requiredRole === null || !matrix.roles.hasRole(role, requiredRole)) {
    return refuse({ status: 403, requiredRole, role });
  }

  // 6. Double vérification. La confiance d'un appareil n'est lue que si elle peut changer la décision.
  const enrolled = isEnrolled(user);
  const trusted = enrolled && aal !== 'aal2' ? await isTrustedSession(db, { userId: user.id, sessionId, now }) : false;
  // Inscrit : l'exigence tient déjà ; sinon, des codes de secours prouvent une inscription passée.
  const hasBackupCodes = !enrolled && (await hasBackupCodesOf(db, user.id));
  const recovery = aal !== 'aal2' ? await isRecoverySession(db, user.id, sessionId, now) : false;
  const mfa = mfaState(user, token, {
    requiredForAll: options.requiredForAll,
    trusted,
    role,
    alwaysRoles: options.alwaysRoles,
    hasBackupCodes,
    recovery,
  });
  if (enforceMfa && !mfa.satisfied && !matrix.allowedWhileMfaPending(request.method, url.pathname)) {
    return refuse({ status: 403, code: mfa.code ?? 'mfa_required' });
  }
  return { ok: true, member: { userId: user.id, email, role, sessionId, mfa }, accessToken: token };
}

/** Réponse d'un refus : 401 { detail } ; 403 { detail, required_role } ; 403 { detail, code } ; 503 { detail }. */
export function deny(refusal: TeamRefusal): NextResponse {
  const headers = { 'Cache-Control': 'no-store' };
  if (refusal.status === 503) return NextResponse.json({ detail: TEAM_SESSION_MESSAGES.unavailable }, { status: 503, headers });
  if (refusal.status === 401) return NextResponse.json({ detail: TEAM_SESSION_MESSAGES.unauthenticated }, { status: 401, headers });
  if ('code' in refusal) return NextResponse.json({ detail: MFA_MESSAGES[refusal.code], code: refusal.code }, { status: 403, headers });
  return NextResponse.json(
    { detail: TEAM_SESSION_MESSAGES.forbidden(refusal.requiredRole), required_role: refusal.requiredRole },
    { status: 403, headers },
  );
}
