// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa.ts, commit 508f19a (2026-10-30) + KHI Educ, lib/mfa.js (MFA_ALWAYS_ROLES, mfaRequiredForRole), commit 1a02685 (2026-10-30) ; généralisé : émetteur lu dans MFA_ISSUER puis SITE_NAME, rôles toujours soumis en paramètre (vide par défaut), codes de secours (hasBackupCodes, recovery) dans la règle, messages [à adapter] ; retirés : mode jeton (tokenModeMfaState), chemins de pages (→ AdminPaths).
//
// Double vérification (TOTP de Supabase Auth) de l'ÉQUIPE. Module PUR, sans I/O ni `node:` : le middleware
// (Edge) peut l'importer.
//
// Supabase gère le facteur (application d'authentification, code QR) et la vérification du code ; la session
// passe alors du niveau « aal1 » (mot de passe, lien par courriel…) au niveau « aal2 ». Le serveur décide qui
// doit être en aal2 :
//   - un membre qui a un facteur VÉRIFIÉ : toujours (sinon, voler son mot de passe suffirait) ;
//   - un membre qui a des codes de secours (il a donc déjà été inscrit) : toujours — retirer son facteur ne
//     doit jamais faire tomber l'exigence ; sans facteur, il est envoyé vers l'inscription ;
//   - un rôle listé dans `alwaysRoles` (vide par défaut) ;
//   - tous les membres si ADMIN_MFA_REQUIRED=1 (à activer quand toute l'équipe est inscrite).
// Une session de confiance (appareil retenu 30 jours, `mfa-trust.ts`) remplace le code, jamais l'inscription.
// Une session de récupération (code de secours accepté) ne remplace RIEN : elle sert seulement à réinscrire
// un facteur (`recovery` est exposé pour l'écran et la route d'inscription).
//
// IMPORTANT : `sessionAal` et `sessionIdOf` lisent la charge d'un jeton SANS vérifier sa signature. Ne les
// appeler que sur un jeton DÉJÀ accepté par `supabase.auth.getUser(token)` (voir `team-session.ts`) : une
// charge falsifiée peut dire « aal2 ».
import type { MfaCode, MfaState, SessionAal, TeamRole } from '@/lib/auth/types';

export type { MfaCode, MfaState, SessionAal } from '@/lib/auth/types';

/** Facteur tel que Supabase Auth le renvoie avec l'utilisateur (`user.factors`). */
export interface AuthFactor {
  id: string;
  status?: string | null;
  factor_type?: string | null;
  friendly_name?: string | null;
  created_at?: string | null;
}

type EnvLike = Record<string, string | undefined>;

/** [à adapter] Nom affiché dans l'application d'authentification du téléphone : MFA_ISSUER, puis SITE_NAME. */
export function mfaIssuer(env: EnvLike = process.env): string {
  return env.MFA_ISSUER?.trim() || env.SITE_NAME?.trim() || 'Administration';
}
export const MFA_ISSUER = mfaIssuer();

/**
 * Rôles pour qui le facteur ET la session aal2 sont toujours exigés, même sans ADMIN_MFA_REQUIRED.
 * Vide par défaut. Exemple : `['admin']` pour imposer la double vérification à l'administrateur dès le départ.
 */
export const MFA_ALWAYS_ROLES: readonly TeamRole[] = Object.freeze([]);

export const mfaRequiredForRole = (role: unknown, alwaysRoles: readonly string[] = MFA_ALWAYS_ROLES): boolean =>
  typeof role === 'string' && alwaysRoles.includes(role);

/** [à adapter] Messages renvoyés avec les codes `mfa_required` / `mfa_enrollment_required`. */
export const MFA_MESSAGES: Record<MfaCode, string> = {
  mfa_required: 'Double vérification requise : entrez le code affiché par votre application d’authentification.',
  mfa_enrollment_required: 'Double vérification obligatoire : activez-la avant d’accéder à l’administration.',
};

/** ADMIN_MFA_REQUIRED : seule la valeur « 1 » l'active. */
export const mfaRequiredForAll = (env: EnvLike = process.env): boolean => env.ADMIN_MFA_REQUIRED?.trim() === '1';

/** Charge utile d'un JWT, SANS vérifier la signature ; null si illisible. Jeton déjà vérifié seulement. */
export function jwtClaims(token: unknown): Record<string, unknown> | null {
  try {
    const payload = String(token ?? '').split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Niveau de la session d'un jeton DÉJÀ vérifié par `auth.getUser` : "aal1" | "aal2" | null. */
export function sessionAal(token: unknown): SessionAal | null {
  const aal = jwtClaims(token)?.aal;
  return aal === 'aal1' || aal === 'aal2' ? aal : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant de la session Supabase (claim `session_id`) d'un jeton DÉJÀ vérifié, en minuscules, ou null. */
export function sessionIdOf(token: unknown): string | null {
  const sid = jwtClaims(token)?.session_id;
  return typeof sid === 'string' && UUID_RE.test(sid) ? sid.toLowerCase() : null;
}

/** Facteurs vérifiés (tous types : « inscrit » = au moins un facteur vérifié ; `unverified` ne compte pas). */
export function verifiedFactors(user: { factors?: AuthFactor[] | null } | null | undefined): AuthFactor[] {
  return (user?.factors ?? []).filter((factor) => factor?.status === 'verified');
}

export const isEnrolled = (user: { factors?: AuthFactor[] | null } | null | undefined): boolean => verifiedFactors(user).length > 0;

export interface MfaStateOptions {
  /** ADMIN_MFA_REQUIRED=1 (défaut : lu dans l'environnement). */
  requiredForAll?: boolean;
  /** Session de confiance d'un APPAREIL (jamais une ligne « code de secours »). */
  trusted?: boolean;
  /** Rôle du membre, comparé à `alwaysRoles`. */
  role?: TeamRole | string | null;
  alwaysRoles?: readonly string[];
  /** Le membre a au moins une ligne dans `mfa_backup_codes` (il a déjà été inscrit). */
  hasBackupCodes?: boolean;
  /** Session de récupération valide (code de secours accepté) : sert seulement à réinscrire un facteur. */
  recovery?: boolean;
}

/** La règle. `trusted` n'est lu que si le membre est inscrit et sa session hors aal2 ; `recovery` ne satisfait rien. */
export function mfaState(
  user: { factors?: AuthFactor[] | null } | null | undefined,
  token: unknown,
  {
    requiredForAll = mfaRequiredForAll(),
    trusted = false,
    role = null,
    alwaysRoles = MFA_ALWAYS_ROLES,
    hasBackupCodes = false,
    recovery = false,
  }: MfaStateOptions = {},
): MfaState {
  const enrolled = isEnrolled(user);
  const aal = sessionAal(token);
  const required = enrolled || Boolean(requiredForAll) || mfaRequiredForRole(role, alwaysRoles) || Boolean(hasBackupCodes);
  const trustedSession = Boolean(trusted) && enrolled && aal !== 'aal2';
  const satisfied = !required || (enrolled && aal === 'aal2') || trustedSession;
  const code: MfaCode | null = satisfied ? null : enrolled ? 'mfa_required' : 'mfa_enrollment_required';
  return {
    enrolled,
    aal,
    trusted: trustedSession,
    required,
    requiredForAll: Boolean(requiredForAll),
    satisfied,
    code,
    recovery: Boolean(recovery),
    hasBackupCodes: Boolean(hasBackupCodes),
  };
}

/** Code à 6 chiffres exactement (rien d'autre n'atteint Supabase). */
export const isTotpCode = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);
