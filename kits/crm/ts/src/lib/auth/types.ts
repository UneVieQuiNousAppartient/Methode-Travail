// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/types.ts et src/lib/team/mfa.ts (types MfaCode, SessionAal, MfaState), commit 508f19a (2026-10-30) ; généralisé : rôles du kit (admin > gestionnaire > employe) au lieu des deux rôles d'origine, membre réduit à l'identité vérifiée de la session, sans mode jeton.
//
// Types partagés par le point d'entrée de l'équipe, la double vérification, les journaux et la Loi 25.
// Figés en P0 : les briques d'accès et de journal en dépendent. Aucun code ici.

/** Rôles par défaut du kit, du plus bas au plus haut (l'ordre EST le rang). Voir `src/lib/authz/roles.ts`. */
export type TeamRole = 'employe' | 'gestionnaire' | 'admin';

export type MfaCode = 'mfa_required' | 'mfa_enrollment_required';
export type SessionAal = 'aal1' | 'aal2';

/** État de la double vérification d'une session (calculé côté serveur, jamais lu dans un jeton non vérifié). */
export interface MfaState {
  /** Au moins un facteur vérifié. */
  enrolled: boolean;
  /** Niveau de la session lu dans le jeton VÉRIFIÉ par `auth.getUser` ; null si illisible. */
  aal: SessionAal | null;
  /** Session de confiance d'un APPAREIL retenu (jamais un code de secours) — ne compte que si `enrolled` et hors aal2. */
  trusted: boolean;
  /** Code exigé pour cette session (rôle concerné, ou ADMIN_MFA_REQUIRED=1, ou facteur inscrit). */
  required: boolean;
  /** ADMIN_MFA_REQUIRED=1. */
  requiredForAll: boolean;
  satisfied: boolean;
  code: MfaCode | null;
  /**
   * Session de récupération : un code de secours a été accepté pour CETTE session (ligne `reason = 'backup_code'`
   * de `mfa_trusted_sessions`, 1 heure). Elle ne satisfait JAMAIS la double vérification ; elle sert seulement à
   * réinscrire un facteur (l'écran et la route d'inscription la lisent). Absent = false.
   */
  recovery?: boolean;
  /**
   * Le membre a des codes de secours en base (utilisés ou non) : il a déjà été inscrit. Lu par le point d'entrée
   * quand le membre n'a plus de facteur vérifié (false sinon). La route d'inscription le passe à
   * `enrollmentAllowedFor` : sans lui, le mot de passe seul remplacerait le facteur. Absent = false.
   */
  hasBackupCodes?: boolean;
}

/**
 * Membre de l'équipe authentifié pour CETTE requête : identité vérifiée par Supabase Auth, adresse présente
 * dans la liste blanche, rôle lu dans la liste blanche (jamais dans le jeton ni dans la requête).
 */
export interface TeamMember {
  /** `auth.users.id` (UUID). */
  userId: string;
  /** Courriel en minuscules, tel qu'il figure dans la liste blanche. */
  email: string;
  role: TeamRole;
  /** Identifiant de la session Supabase (claim `session_id` du jeton vérifié) ; null si absent. */
  sessionId: string | null;
  mfa: MfaState;
}

/** Acteur d'une entrée de journal : un membre, ou une tâche planifiée (aucun courriel ni secret ici). */
export type AuditActor =
  | { kind: 'member'; userId: string; role: TeamRole }
  | { kind: 'system'; name: string };
