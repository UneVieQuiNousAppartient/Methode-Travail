// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/roles-journal.test.mjs (cas de hasRole et des rangs), commit 1a02685 (2026-10-30) ; généralisé : liste de rôles paramétrable ; cas ajoutés : rôle inconnu sans aucun rang, liste à deux rôles, listes invalides.
import { describe, expect, it } from 'vitest';
import { createRoles, hasRole, isTeamRole, ROLE_LABELS, ROLES, TEAM_ROLES } from './roles';

describe('rôles par défaut : employe < gestionnaire < admin', () => {
  it('l’ordre de la liste est le rang', () => {
    expect(ROLES).toEqual(['employe', 'gestionnaire', 'admin']);
    expect(TEAM_ROLES.lowest).toBe('employe');
    expect(TEAM_ROLES.highest).toBe('admin');
    expect(TEAM_ROLES.rankOf('employe')).toBe(0);
    expect(TEAM_ROLES.rankOf('admin')).toBe(2);
  });

  it('hasRole : un rang couvre les rangs inférieurs, jamais les supérieurs', () => {
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('admin', 'gestionnaire')).toBe(true);
    expect(hasRole('admin', 'employe')).toBe(true);
    expect(hasRole('gestionnaire', 'employe')).toBe(true);
    expect(hasRole('gestionnaire', 'admin')).toBe(false);
    expect(hasRole('employe', 'gestionnaire')).toBe(false);
    expect(hasRole('employe', 'employe')).toBe(true);
  });

  it('rôle inconnu : aucun rang, aucun droit — même pas celui du rang le plus bas', () => {
    for (const value of ['owner', 'Admin', 'ADMIN', '', ' admin', null, undefined, 2, {}]) {
      expect(TEAM_ROLES.rankOf(value)).toBe(-1);
      expect(hasRole(value, 'employe')).toBe(false);
      expect(isTeamRole(value)).toBe(false);
    }
  });

  it('rôle exigé inconnu (valeur forcée à l’exécution) : refus', () => {
    expect(hasRole('admin', 'super' as never)).toBe(false);
  });

  it('chaque rôle a un libellé', () => {
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe('createRoles — liste paramétrable', () => {
  it('un projet à deux rôles fonctionne sans toucher au moteur', () => {
    const two = createRoles(['employe', 'admin'] as const);
    expect(two.lowest).toBe('employe');
    expect(two.highest).toBe('admin');
    expect(two.hasRole('admin', 'employe')).toBe(true);
    expect(two.hasRole('employe', 'admin')).toBe(false);
    expect(two.hasRole('gestionnaire', 'employe')).toBe(false);
  });

  it('un seul rôle : il est à la fois le plus bas et le plus haut', () => {
    const one = createRoles(['proprietaire'] as const);
    expect(one.hasRole('proprietaire', 'proprietaire')).toBe(true);
  });

  it('refuse une liste vide ou avec doublons', () => {
    expect(() => createRoles([])).toThrow();
    expect(() => createRoles(['a', 'b', 'a'])).toThrow();
  });

  it('la liste rendue est figée (aucun rôle ajouté à l’exécution)', () => {
    const set = createRoles(['a', 'b']);
    expect(() => (set.roles as string[]).push('c')).toThrow();
  });
});
