// Kit CRM TS (methode-travail) — origine : KHI Educ, lib/roles.js (ROLES, ROLE_LABELS, rank, hasRole), commit 1a02685 (2026-10-30) ; généralisé : liste de rôles paramétrable (createRoles), rôle inconnu = aucun rang (KHI : rang 0), libellés [à adapter].
//
// Rangs de l'équipe : l'ordre de la liste EST le rang (du plus bas au plus haut). Un projet à deux rôles
// passe `createRoles(['employe', 'admin'])` (ou ses propres noms) sans toucher au moteur de la matrice.
// Module pur : aucun import d'exécution, utilisable dans le middleware (Edge).
import type { TeamRole } from '@/lib/auth/types';

/** Rôles par défaut du kit, du plus bas au plus haut. */
export const ROLES = ['employe', 'gestionnaire', 'admin'] as const satisfies readonly TeamRole[];

/** [à adapter] Libellés affichés à l'équipe. */
export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  employe: 'Employé',
};

export interface RoleSet<R extends string> {
  readonly roles: readonly R[];
  /** Rôle du rang le plus bas. */
  readonly lowest: R;
  /** Rôle du rang le plus haut : exigé par défaut pour tout chemin non listé. */
  readonly highest: R;
  /** `true` si la valeur (venue de la base, d'un formulaire…) est un rôle de la liste. */
  isRole(value: unknown): value is R;
  /** Rang (0 = le plus bas) ; -1 pour une valeur inconnue — jamais un rang « par défaut ». */
  rankOf(role: unknown): number;
  /** `role` ≥ `required` ? Toujours faux si l'un des deux est inconnu. */
  hasRole(role: unknown, required: R): boolean;
}

export function createRoles<R extends string>(roles: readonly R[]): RoleSet<R> {
  if (roles.length === 0) throw new Error('createRoles : au moins un rôle.');
  if (new Set(roles).size !== roles.length) throw new Error('createRoles : rôles en double.');
  const list = Object.freeze([...roles]) as readonly R[];
  const isRole = (value: unknown): value is R => typeof value === 'string' && (list as readonly string[]).includes(value);
  const rankOf = (role: unknown): number => (isRole(role) ? list.indexOf(role) : -1);
  return {
    roles: list,
    lowest: list[0],
    highest: list[list.length - 1],
    isRole,
    rankOf,
    hasRole: (role, required) => {
      const have = rankOf(role);
      const need = rankOf(required);
      return have >= 0 && need >= 0 && have >= need;
    },
  };
}

/** Rôles par défaut, prêts à l'emploi. */
export const TEAM_ROLES = createRoles<TeamRole>(ROLES);
export const isTeamRole = TEAM_ROLES.isRole;
export const hasRole = TEAM_ROLES.hasRole;
