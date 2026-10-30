// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/authz/access-matrix.test.ts et src/lib/authz/mfa-lock.test.ts (normalisation, méthodes, UUID, verrous de session, garde anti-boucle), commit 508f19a (2026-10-30) + KHI Educ, tests/unit/roles-droits.test.mjs (refus par défaut, matchedRule), commit 1a02685 (2026-10-30) ; généralisé : cas portés sur la matrice d'exemple du kit (routes métier de la source non reprises) ; cas ajoutés : chemin inconnu → rang le plus haut, HEAD seulement si listé, chemins douteux refusés au rang le plus haut aussi, matrice à deux rôles, permissionsOf = canAccessPath, rôle inconnu, règles invalides.
import { describe, expect, it } from 'vitest';
import { createRoles, TEAM_ROLES } from './roles';
import {
  ALL_METHODS,
  DEFAULT_ACCESS_MATRIX as M,
  DEFAULT_ADMIN_PATHS as P,
  defineAccessMatrix,
  EXAMPLE_PERMISSION_CHECKS,
  exampleRules,
  normalizePath,
  READ,
} from './access-matrix';

const LEAD = '0b6f6c1e-3d1c-4b8a-9f2e-6a7d8c9e0f12';
const employe = (method: string, path: string) => M.canAccessPath('employe', method, path);
const gestionnaire = (method: string, path: string) => M.canAccessPath('gestionnaire', method, path);
const admin = (method: string, path: string) => M.canAccessPath('admin', method, path);

describe('refus par défaut', () => {
  it('un chemin qui ne correspond à aucune règle exige le rang le plus haut', () => {
    for (const path of ['/admin/reglages', '/api/admin/nouvelle-route', '/api/admin/leads/import', '/admin/fiches/abc']) {
      expect(M.requiredRole('GET', path)).toBe('admin');
      expect(M.matchedRule('GET', path)).toBeNull();
      expect(employe('GET', path)).toBe(false);
      expect(gestionnaire('GET', path)).toBe(false);
      expect(admin('GET', path)).toBe(true);
    }
  });

  it('une méthode non listée pour une règle retombe sur le défaut (rang le plus haut)', () => {
    expect(M.requiredRole('DELETE', '/api/admin/leads')).toBe('admin');
    expect(employe('PUT', `/api/admin/leads/${LEAD}`)).toBe(false);
    expect(employe('POST', '/admin/fiches')).toBe(false);
    expect(gestionnaire('GET', '/api/admin/leads/bulk')).toBe(false);
    expect(admin('GET', '/api/admin/leads/bulk')).toBe(true);
  });

  it('HEAD n’est permis que s’il est listé (jamais déduit de GET)', () => {
    expect(employe('HEAD', '/admin/fiches')).toBe(true); // listé (READ)
    expect(M.requiredRole('HEAD', '/api/admin/leads/export')).toBe('admin'); // GET seul listé
    expect(gestionnaire('GET', '/api/admin/leads/export')).toBe(true);
    expect(gestionnaire('HEAD', '/api/admin/leads/export')).toBe(false);
  });

  it('la première règle qui correspond l’emporte : DELETE d’une fiche reste à l’administrateur', () => {
    expect(M.requiredRole('DELETE', `/api/admin/leads/${LEAD}`)).toBe('admin');
    expect(M.requiredRole('PATCH', `/api/admin/leads/${LEAD}`)).toBe('employe');
    expect(M.matchedRule('PATCH', `/api/admin/leads/${LEAD}`)).toBe('/api/admin/leads/[id]');
  });
});

describe('matrice d’exemple : rangs', () => {
  it('toute l’équipe : accueil, fiches, son compte, sa double vérification', () => {
    expect(employe('GET', P.home)).toBe(true);
    expect(employe('GET', '/admin/fiches')).toBe(true);
    expect(employe('GET', `/admin/fiches/${LEAD}`)).toBe(true);
    expect(employe('POST', '/api/admin/leads')).toBe(true);
    expect(employe('GET', `/api/admin/leads/${LEAD}`)).toBe(true);
    expect(employe('GET', P.meApi)).toBe(true);
    expect(employe('POST', P.logoutApi)).toBe(true);
    for (const action of ['enroll', 'verify', 'trusted-session', 'trust', 'backup-code', 'backup-codes']) {
      expect(employe('POST', `${P.mfaApiPrefix}/${action}`)).toBe(true);
      expect(employe('GET', `${P.mfaApiPrefix}/${action}`)).toBe(false);
    }
    expect(employe('DELETE', `${P.mfaApiPrefix}/devices`)).toBe(true);
    expect(employe('DELETE', `${P.mfaApiPrefix}/factors`)).toBe(true);
    expect(employe('POST', `${P.mfaApiPrefix}/autre`)).toBe(false);
  });

  it('envois groupés, export et journal : gestionnaire et plus', () => {
    expect(employe('POST', '/api/admin/leads/bulk')).toBe(false);
    expect(gestionnaire('POST', '/api/admin/leads/bulk')).toBe(true);
    expect(admin('POST', '/api/admin/leads/bulk')).toBe(true);
    expect(employe('GET', '/api/admin/audit')).toBe(false);
    expect(gestionnaire('GET', '/api/admin/audit')).toBe(true);
  });

  it('équipe, Loi 25, suppression d’une fiche : administrateur seulement', () => {
    for (const [method, path] of [
      ['GET', '/api/admin/team'],
      ['PATCH', `/api/admin/team/${LEAD}`],
      ['POST', '/api/admin/privacy'],
      ['DELETE', `/api/admin/leads/${LEAD}`],
    ] as const) {
      expect(gestionnaire(method, path)).toBe(false);
      expect(admin(method, path)).toBe(true);
    }
  });

  it('`[id]` = UUID seulement : un segment statique n’est jamais pris pour un identifiant', () => {
    expect(employe('GET', '/api/admin/leads/export')).toBe(false);
    expect(employe('PATCH', '/api/admin/leads/bulk')).toBe(false);
    expect(employe('GET', '/api/admin/leads/123')).toBe(false);
    expect(employe('GET', `/api/admin/leads/${LEAD}x`)).toBe(false);
    expect(employe('GET', `/api/admin/leads/${LEAD.toUpperCase()}`)).toBe(true); // casse normalisée
  });

  it('pas de profondeur libre : un sous-chemin d’une route permise exige le rang le plus haut', () => {
    expect(M.requiredRole('GET', `/api/admin/leads/${LEAD}/notes`)).toBe('admin');
    expect(M.requiredRole('GET', `/admin/fiches/${LEAD}/modifier`)).toBe('admin');
  });
});

describe('chemins douteux : refusés à TOUS les rôles, le plus haut compris', () => {
  const suspicious = [
    '/api/admin/leads/%2e%2e/team',
    '/admin%2ffiches',
    '/admin/fiches/..',
    '/admin/fiches/../journal',
    '/admin/./fiches',
    '//admin/fiches',
    '/admin//fiches',
    '/admin/fiches//',
    '/admin\\fiches',
    '/admin/fiches;x=1',
    '/admin/fiches?x=1',
    '/admin/fiches#x',
    '/admin/fiches ',
    '/admin/fiches\n',
    '/admin/fichés',
    '',
    'admin/fiches',
    'https://exemple.test/admin',
    `/admin/fiches/${'a'.repeat(600)}`,
  ];

  it.each(suspicious)('refus : %j', (path) => {
    expect(M.requiredRole('GET', path)).toBeNull();
    for (const role of TEAM_ROLES.roles) expect(M.canAccessPath(role, 'GET', path)).toBe(false);
  });

  it('valeurs non textuelles : refus', () => {
    expect(M.canAccessPath('admin', 'GET', undefined)).toBe(false);
    expect(M.canAccessPath('admin', 'GET', 42)).toBe(false);
    expect(normalizePath(null)).toBeNull();
  });

  it('majuscules = minuscules (jamais plus permissif) ; une barre finale tolérée', () => {
    expect(employe('GET', '/Admin/Fiches')).toBe(true);
    expect(employe('GET', '/ADMIN/JOURNAL')).toBe(false);
    expect(employe('GET', '/admin/fiches/')).toBe(true);
    expect(gestionnaire('GET', '/api/admin/team/')).toBe(false);
  });

  it('méthode inconnue ou mal formée : refus à tous ; casse de la méthode normalisée', () => {
    for (const method of ['TRACE', 'OPTIONS', 'CONNECT', '', 'GE T']) {
      expect(M.requiredRole(method, '/admin/fiches')).toBeNull();
      expect(admin(method, '/admin/fiches')).toBe(false);
    }
    expect(employe('get', '/admin/fiches')).toBe(true);
    expect(M.canAccessPath('employe', undefined, '/admin/fiches')).toBe(false);
  });

  it('rôle inattendu à l’exécution : refus, même sur une route du rang le plus bas', () => {
    for (const role of ['owner', 'Admin', '', null, undefined]) {
      expect(M.canAccessPath(role, 'GET', P.home)).toBe(false);
    }
  });
});

describe('permissionsOf : calculé par canAccessPath (aucune seconde vérité)', () => {
  it('table : chaque droit résumé = canAccessPath sur la même méthode et le même chemin', () => {
    for (const role of [...TEAM_ROLES.roles, 'inconnu']) {
      const perms = M.permissionsOf(role, EXAMPLE_PERMISSION_CHECKS);
      for (const [key, [method, path]] of Object.entries(EXAMPLE_PERMISSION_CHECKS)) {
        expect(perms[key as keyof typeof perms]).toBe(M.canAccessPath(role, method, path));
      }
    }
  });

  it('employé : aucun pouvoir réservé ; gestionnaire : envois et journal ; admin : tout', () => {
    expect(Object.values(M.permissionsOf('employe', EXAMPLE_PERMISSION_CHECKS)).every((value) => !value)).toBe(true);
    expect(M.permissionsOf('gestionnaire', EXAMPLE_PERMISSION_CHECKS)).toMatchObject({ leads_bulk: true, audit: true, team: false, privacy: false });
    expect(Object.values(M.permissionsOf('admin', EXAMPLE_PERMISSION_CHECKS)).every(Boolean)).toBe(true);
  });
});

describe('defineAccessMatrix : paramétrable et gardé', () => {
  it('matrice à deux rôles : employe et admin, sans toucher au moteur', () => {
    const roles = createRoles(['employe', 'admin'] as const);
    const two = defineAccessMatrix({
      roles,
      rules: [
        { path: P.home, methods: READ, role: 'employe' },
        { path: '/api/admin/leads', methods: ['GET'], role: 'employe' },
      ],
    });
    expect(two.canAccessPath('employe', 'GET', '/api/admin/leads')).toBe(true);
    expect(two.canAccessPath('employe', 'POST', '/api/admin/leads')).toBe(false);
    expect(two.requiredRole('GET', '/api/admin/team')).toBe('admin');
    expect(two.canAccessPath('gestionnaire', 'GET', P.home)).toBe(false); // rôle hors de cette liste
  });

  it('garde anti-boucle : l’accueil doit être accessible au rang le plus bas', () => {
    expect(() => defineAccessMatrix({ roles: TEAM_ROLES, rules: [] })).toThrow(/accueil/);
    expect(() =>
      defineAccessMatrix({ roles: TEAM_ROLES, rules: [{ path: P.home, methods: READ, role: 'gestionnaire' }] }),
    ).toThrow(/accueil/);
    expect(M.canAccessPath(TEAM_ROLES.lowest, 'GET', P.home)).toBe(true);
  });

  it('chemins de l’admin paramétrables (AdminPaths)', () => {
    const paths = { ...P, home: '/tableau', mfaPage: '/tableau/code', mfaApiPrefix: '/api/equipe/mfa' };
    const custom = defineAccessMatrix({ roles: TEAM_ROLES, rules: exampleRules(paths), paths });
    expect(custom.canAccessPath('employe', 'GET', '/tableau')).toBe(true);
    expect(custom.canAccessPath('employe', 'POST', '/api/equipe/mfa/verify')).toBe(true);
    expect(custom.allowedWhileMfaPending('GET', '/tableau/code')).toBe(true);
  });

  it('refuse une règle mal écrite (majuscules, barre finale, chemin douteux, rôle ou méthode inconnus)', () => {
    const base = { path: P.home, methods: READ, role: 'employe' as const };
    for (const bad of [
      { ...base, path: '/Admin' },
      { ...base, path: '/admin/' },
      { ...base, path: '/admin/../x' },
      { ...base, role: 'owner' as never },
      { ...base, methods: [] },
      { ...base, methods: ['TRACE' as never] },
      { ...base, methods: ['get' as never] },
    ]) {
      expect(() => defineAccessMatrix({ roles: TEAM_ROLES, rules: [base, bad] })).toThrow();
    }
  });

  it('`{a|b}` = valeurs littérales seulement (pas d’expression régulière glissée)', () => {
    const matrix = defineAccessMatrix({
      roles: TEAM_ROLES,
      rules: [
        { path: P.home, methods: READ, role: 'employe' },
        { path: '/api/admin/x/{a.b|c}', methods: ['GET'], role: 'employe' },
      ],
    });
    expect(matrix.canAccessPath('employe', 'GET', '/api/admin/x/a.b')).toBe(true);
    expect(matrix.canAccessPath('employe', 'GET', '/api/admin/x/c')).toBe(true);
    expect(matrix.canAccessPath('employe', 'GET', '/api/admin/x/axb')).toBe(false);
  });

  it('les méthodes connues sont exactement celles d’une API REST', () => {
    expect(ALL_METHODS).toEqual(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
  });
});

describe('verrous de session (double vérification, puis mot de passe)', () => {
  const pendingMfa = { mfa: { satisfied: false, code: 'mfa_required' as const } };

  it('code attendu : seules la page du code, l’identité, la déconnexion et les routes du code passent', () => {
    expect(M.sessionLockFor(pendingMfa, 'GET', P.mfaPage)).toBeNull();
    expect(M.sessionLockFor(pendingMfa, 'GET', P.meApi)).toBeNull();
    expect(M.sessionLockFor(pendingMfa, 'POST', P.logoutApi)).toBeNull();
    for (const action of ['enroll', 'verify', 'trusted-session', 'backup-code']) {
      expect(M.sessionLockFor(pendingMfa, 'POST', `${P.mfaApiPrefix}/${action}`)).toBeNull();
    }
    expect(M.sessionLockFor(pendingMfa, 'GET', '/admin/fiches')).toEqual({ lock: 'mfa', code: 'mfa_required', page: P.mfaPage });
  });

  it('code attendu : gérer ses appareils, retirer un facteur ou régénérer ses codes exige une session satisfaite', () => {
    expect(M.sessionLockFor(pendingMfa, 'POST', `${P.mfaApiPrefix}/trust`)?.lock).toBe('mfa');
    expect(M.sessionLockFor(pendingMfa, 'DELETE', `${P.mfaApiPrefix}/devices`)?.lock).toBe('mfa');
    expect(M.sessionLockFor(pendingMfa, 'DELETE', `${P.mfaApiPrefix}/factors`)?.lock).toBe('mfa');
    expect(M.sessionLockFor(pendingMfa, 'POST', `${P.mfaApiPrefix}/backup-codes`)?.lock).toBe('mfa');
    expect(M.sessionLockFor(pendingMfa, 'GET', `${P.mfaApiPrefix}/verify`)?.lock).toBe('mfa');
  });

  it('chemin douteux vers une route permise pendant le code : verrouillé', () => {
    expect(M.sessionLockFor(pendingMfa, 'POST', `${P.mfaApiPrefix}/verify/../../team`)?.lock).toBe('mfa');
    expect(M.sessionLockFor(pendingMfa, 'POST', `${P.mfaApiPrefix}%2fverify`)?.lock).toBe('mfa');
  });

  it('inscription obligatoire : le code transmis est gardé', () => {
    const lock = M.sessionLockFor({ mfa: { satisfied: false, code: 'mfa_enrollment_required' } }, 'GET', P.home);
    expect(lock).toEqual({ lock: 'mfa', code: 'mfa_enrollment_required', page: P.mfaPage });
    expect(M.sessionLockFor({ mfa: { satisfied: false, code: null } }, 'GET', P.home)?.code).toBe('mfa_required');
  });

  it('le code passe AVANT le mot de passe à choisir', () => {
    const both = { ...pendingMfa, mustChangePassword: true };
    expect(M.sessionLockFor(both, 'GET', P.passwordPage)?.lock).toBe('mfa');
    expect(M.sessionLockFor(both, 'POST', `${P.mfaApiPrefix}/verify`)).toBeNull();
  });

  it('mot de passe à choisir : sa page, sa route et la déconnexion seulement', () => {
    const session = { mfa: { satisfied: true, code: null }, mustChangePassword: true };
    expect(M.sessionLockFor(session, 'GET', P.passwordPage)).toBeNull();
    expect(M.sessionLockFor(session, 'POST', P.passwordApi)).toBeNull();
    expect(M.sessionLockFor(session, 'POST', P.logoutApi)).toBeNull();
    expect(M.sessionLockFor(session, 'GET', P.passwordApi)?.lock).toBe('password');
    expect(M.sessionLockFor(session, 'GET', P.home)).toEqual({ lock: 'password', code: 'password_change_required', page: P.passwordPage });
  });

  it('rien à exiger : aucun verrou', () => {
    expect(M.sessionLockFor({}, 'GET', '/admin/fiches')).toBeNull();
    expect(M.sessionLockFor({ mfa: { satisfied: true, code: null }, mustChangePassword: false }, 'GET', '/x')).toBeNull();
  });

  it('lockRedirectPath : `next` interne seulement, jamais la page du code elle-même', () => {
    const lock = { lock: 'mfa' as const, code: 'mfa_required' as const, page: P.mfaPage };
    expect(M.lockRedirectPath(lock, '/admin/fiches')).toBe(`${P.mfaPage}?next=%2Fadmin%2Ffiches`);
    for (const next of ['//exemple.test', 'https://exemple.test', '/admin/../x', P.mfaPage, '']) {
      expect(M.lockRedirectPath(lock, next)).toBe(`${P.mfaPage}?next=${encodeURIComponent(P.home)}`);
    }
    expect(M.lockRedirectPath({ lock: 'password', code: 'password_change_required', page: P.passwordPage }, '/x')).toBe(P.passwordPage);
  });
});
