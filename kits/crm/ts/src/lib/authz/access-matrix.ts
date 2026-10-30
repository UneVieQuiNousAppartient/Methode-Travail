// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/authz/access-matrix.ts, commit 508f19a (2026-10-30) + KHI Educ, lib/roles.js (requiredRole, matchedRule, permissionsOf, refus par défaut), commit 1a02685 (2026-10-30) ; généralisé : moteur paramétré par les rôles (createRoles) et les chemins de l'admin (AdminPaths), règles « première qui correspond » à la KHI mais sur chemin normalisé et identifiants UUID à la CSF ; un chemin douteux est refusé à TOUS les rôles (la source laissait tout passer au rôle le plus haut) ; matrice d'exemple [à adapter] ; retirés : pages et routes métier, exceptions Google (lot 3).
//
// Matrice d'accès par rôle — fonctions PURES, sans I/O : importable par le middleware (Edge) comme par les tests.
//
// Principe : refus par défaut.
// - Les règles sont lues dans l'ordre ; la PREMIÈRE dont le chemin ET la méthode correspondent donne le rôle minimal.
// - Aucune règle ne correspond (chemin oublié, méthode non listée — HEAD compris) → le rôle le plus HAUT est exigé.
// - Chemin douteux (`..`, `%`, `//`, `\`, `;`, `?`, `#`, espace, non-ASCII, trop long) ou méthode inconnue → refus
//   pour TOUS les rôles, le plus haut compris.
// - `[id]` dans une règle = un UUID (jamais « n'importe quel segment » : `bulk` ou `export` ne sont pas des identifiants).
//
// Cette matrice est la PREMIÈRE ligne de défense. Le cloisonnement des données (« un employé ne voit que ses
// fiches ») reste vérifié dans chaque route : ne jamais s'appuyer sur la seule matrice pour protéger une donnée.
import type { MfaCode, TeamRole } from '@/lib/auth/types';
import { TEAM_ROLES, type RoleSet } from '@/lib/authz/roles';

export const ALL_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof ALL_METHODS)[number];
/** Lecture : GET et HEAD. HEAD n'est jamais ajouté implicitement : une règle qui ne le liste pas le refuse. */
export const READ: readonly HttpMethod[] = ['GET', 'HEAD'];

/** Chemins de l'admin dont dépendent les verrous de session et la garde anti-boucle. [à adapter] */
export interface AdminPaths {
  /** Accueil du rang le plus bas : destination des redirections ; DOIT lui être accessible (vérifié). */
  home: string;
  /** Page du code de double vérification (et de l'inscription quand elle est obligatoire). */
  mfaPage: string;
  /** Page « Sécurité » du membre (appareils, codes de secours). */
  securityPage: string;
  /** Préfixe des routes de double vérification. */
  mfaApiPrefix: string;
  /** Page et route « choisir son mot de passe ». */
  passwordPage: string;
  passwordApi: string;
  /** Route de déconnexion (POST) et d'identité (GET). */
  logoutApi: string;
  meApi: string;
}

export const DEFAULT_ADMIN_PATHS: AdminPaths = {
  home: '/admin',
  mfaPage: '/admin/verification',
  securityPage: '/admin/securite',
  mfaApiPrefix: '/api/admin/mfa',
  passwordPage: '/admin/mot-de-passe',
  passwordApi: '/api/admin/me/password',
  logoutApi: '/api/admin/logout',
  meApi: '/api/admin/me',
};

export interface AccessRuleInput<R extends string> {
  /**
   * Chemin en minuscules, sans barre finale. `[id]` (ou tout `[nom]`) = un UUID ; `{a|b}` = un segment parmi ces
   * valeurs littérales. Aucun autre caractère spécial : le reste est comparé tel quel.
   */
  path: string;
  methods: readonly HttpMethod[];
  role: R;
  /** Nom affiché par `matchedRule` (défaut : le chemin). */
  name?: string;
}

interface CompiledRule<R extends string> {
  name: string;
  pattern: RegExp;
  methods: ReadonlySet<string>;
  role: R;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MAX_PATH_LENGTH = 512;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilePath(path: string): RegExp {
  let source = '';
  for (const token of path.split(/(\[[a-z_]+\]|\{[a-z0-9_.|-]+\})/)) {
    if (/^\[[a-z_]+\]$/.test(token)) source += UUID;
    else if (/^\{[a-z0-9_.|-]+\}$/.test(token)) source += `(?:${token.slice(1, -1).split('|').map(escapeRegExp).join('|')})`;
    else source += escapeRegExp(token);
  }
  return new RegExp(`^${source}$`);
}

/**
 * Normalise un chemin pour la décision d'accès ; `null` = chemin douteux, l'appelant REFUSE.
 * - minuscules (la liste est en minuscules ; jamais plus permissif) ;
 * - une seule barre finale tolérée, retirée ;
 * - refus : `..` / `.`, segment vide (`//`, `//` final), `%` (`%2e%2e`, `%2f`…), `\`, `;`, `?`, `#`, espaces, contrôles, non-ASCII, > 512.
 */
export function normalizePath(pathname: unknown): string | null {
  if (typeof pathname !== 'string' || pathname.length === 0 || pathname.length > MAX_PATH_LENGTH) return null;
  if (pathname[0] !== '/') return null;
  if (/[^\x21-\x7e]/.test(pathname) || /[%\\;?#]/.test(pathname)) return null;
  let normalized = pathname.toLowerCase();
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  // Segment vide (`//`, ou `//` final réduit à `/`) ou fait de points (`.`, `..`) : refus.
  if (normalized !== '/' && normalized.split('/').slice(1).some((segment) => segment === '' || /^\.+$/.test(segment))) return null;
  return normalized;
}

/** Méthode en majuscules si elle est connue, sinon `null` (refus). */
export function normalizeMethod(method: unknown): HttpMethod | null {
  if (typeof method !== 'string') return null;
  const upper = method.trim().toUpperCase();
  return (ALL_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : null;
}

export type SessionLock =
  | { lock: 'mfa'; code: MfaCode; page: string }
  | { lock: 'password'; code: 'password_change_required'; page: string };

export interface SessionLockInput {
  mfa?: { satisfied: boolean; code: MfaCode | null } | null;
  mustChangePassword?: boolean | null;
}

export interface AccessMatrix<R extends string> {
  readonly roles: RoleSet<R>;
  readonly paths: AdminPaths;
  /** Rôle minimal pour (méthode, chemin) ; `null` = chemin ou méthode douteux, refusé à tous. */
  requiredRole(method: unknown, pathname: unknown): R | null;
  /** Nom de la règle qui range (méthode, chemin), ou `null` (→ rôle le plus haut, ou refus si douteux). */
  matchedRule(method: unknown, pathname: unknown): string | null;
  canAccessPath(role: unknown, method: unknown, pathname: unknown): boolean;
  /** Résumé des droits pour l'interface (cacher ce qui est interdit), calculé par `canAccessPath`. */
  permissionsOf<K extends string>(role: unknown, checks: Record<K, readonly [HttpMethod, string]>): Record<K, boolean>;
  allowedWhileMfaPending(method: unknown, pathname: unknown): boolean;
  allowedWhilePasswordChangeRequired(method: unknown, pathname: unknown): boolean;
  /** Verrous de session dans l'ordre : double vérification d'abord, puis mot de passe à choisir. */
  sessionLockFor(session: SessionLockInput, method: unknown, pathname: unknown): SessionLock | null;
  /** Page du verrou, avec `next` (chemin interne seulement) pour revenir après le code. */
  lockRedirectPath(lock: SessionLock, nextPath: string): string;
}

export interface DefineAccessMatrixOptions<R extends string> {
  roles: RoleSet<R>;
  rules: readonly AccessRuleInput<R>[];
  paths?: AdminPaths;
}

export function defineAccessMatrix<R extends string>({
  roles,
  rules,
  paths = DEFAULT_ADMIN_PATHS,
}: DefineAccessMatrixOptions<R>): AccessMatrix<R> {
  const compiled: CompiledRule<R>[] = rules.map((input) => {
    const where = `règle « ${input.name ?? input.path} »`;
    if (normalizePath(input.path) !== input.path) throw new Error(`defineAccessMatrix : ${where} — chemin non normalisé (minuscules, sans barre finale).`);
    if (!roles.isRole(input.role)) throw new Error(`defineAccessMatrix : ${where} — rôle inconnu.`);
    if (input.methods.length === 0 || input.methods.some((method) => normalizeMethod(method) !== method)) {
      throw new Error(`defineAccessMatrix : ${where} — méthodes vides ou inconnues.`);
    }
    return { name: input.name ?? input.path, pattern: compilePath(input.path), methods: new Set(input.methods), role: input.role };
  });

  const find = (method: unknown, pathname: unknown): { rule: CompiledRule<R> | null; ok: boolean } => {
    const m = normalizeMethod(method);
    const p = normalizePath(pathname);
    if (m === null || p === null) return { rule: null, ok: false };
    return { rule: compiled.find((entry) => entry.methods.has(m) && entry.pattern.test(p)) ?? null, ok: true };
  };

  const requiredRole = (method: unknown, pathname: unknown): R | null => {
    const { rule, ok } = find(method, pathname);
    if (!ok) return null;
    return rule ? rule.role : roles.highest;
  };

  const canAccessPath = (role: unknown, method: unknown, pathname: unknown): boolean => {
    const required = requiredRole(method, pathname);
    return required !== null && roles.hasRole(role, required);
  };

  const onlyFor = (method: unknown, pathname: unknown, allowed: Record<string, readonly HttpMethod[]>): boolean => {
    const m = normalizeMethod(method);
    const p = normalizePath(pathname);
    if (m === null || p === null) return false;
    return Object.prototype.hasOwnProperty.call(allowed, p) && allowed[p].includes(m);
  };

  const mfaPending: Record<string, readonly HttpMethod[]> = {
    [paths.mfaPage]: READ,
    [paths.meApi]: READ,
    [`${paths.mfaApiPrefix}/enroll`]: ['POST'],
    [`${paths.mfaApiPrefix}/verify`]: ['POST'],
    [`${paths.mfaApiPrefix}/trusted-session`]: ['POST'],
    [`${paths.mfaApiPrefix}/backup-code`]: ['POST'],
    [paths.logoutApi]: ['POST'],
  };
  const passwordPending: Record<string, readonly HttpMethod[]> = {
    [paths.passwordPage]: READ,
    [paths.passwordApi]: ['POST'],
    [paths.logoutApi]: ['POST'],
  };

  const allowedWhileMfaPending = (method: unknown, pathname: unknown) => onlyFor(method, pathname, mfaPending);
  const allowedWhilePasswordChangeRequired = (method: unknown, pathname: unknown) => onlyFor(method, pathname, passwordPending);

  const matrix: AccessMatrix<R> = {
    roles,
    paths,
    requiredRole,
    matchedRule: (method, pathname) => find(method, pathname).rule?.name ?? null,
    canAccessPath,
    permissionsOf: (role, checks) => {
      const result = {} as Record<keyof typeof checks, boolean>;
      for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
        const [method, path] = checks[key];
        result[key] = canAccessPath(role, method, path);
      }
      return result;
    },
    allowedWhileMfaPending,
    allowedWhilePasswordChangeRequired,
    sessionLockFor: (session, method, pathname) => {
      const mfa = session.mfa;
      // Le code d'abord : changer son mot de passe n'est permis qu'une fois l'identité prouvée.
      if (mfa && !mfa.satisfied) {
        if (allowedWhileMfaPending(method, pathname)) return null;
        return { lock: 'mfa', code: mfa.code ?? 'mfa_required', page: paths.mfaPage };
      }
      if (session.mustChangePassword === true && !allowedWhilePasswordChangeRequired(method, pathname)) {
        return { lock: 'password', code: 'password_change_required', page: paths.passwordPage };
      }
      return null;
    },
    lockRedirectPath: (lock, nextPath) => {
      if (lock.lock !== 'mfa') return lock.page;
      const next =
        typeof nextPath === 'string' && normalizePath(nextPath) !== null && nextPath !== paths.mfaPage ? nextPath : paths.home;
      return `${lock.page}?${new URLSearchParams({ next }).toString()}`;
    },
  };

  // Garde anti-boucle : le rang le plus bas est redirigé vers l'accueil ; s'il ne l'atteint pas, la redirection boucle.
  if (!canAccessPath(roles.lowest, 'GET', paths.home)) {
    throw new Error(`defineAccessMatrix : l'accueil « ${paths.home} » doit être accessible au rôle « ${roles.lowest} » (GET).`);
  }
  return matrix;
}

/**
 * [à adapter] Matrice d'EXEMPLE pour les rôles par défaut. Remplacer les routes par celles du projet, une par une ;
 * toute route absente exige « admin ». Les règles plus restrictives (méthodes réservées) viennent AVANT les règles
 * générales du même chemin, puisque la première qui correspond l'emporte.
 */
export function exampleRules(paths: AdminPaths = DEFAULT_ADMIN_PATHS): AccessRuleInput<TeamRole>[] {
  const mfa = paths.mfaApiPrefix;
  return [
    // --- Réservé à l'administrateur (déjà le défaut ; écrit pour que la lecture soit explicite) ---
    { path: '/api/admin/team', methods: [...READ, 'POST'], role: 'admin' },
    { path: '/api/admin/team/[id]', methods: ['PATCH', 'DELETE'], role: 'admin' },
    { path: '/api/admin/privacy', methods: [...READ, 'POST'], role: 'admin' },
    { path: '/api/admin/leads/[id]', methods: ['DELETE'], role: 'admin' },

    // --- Gestionnaire et plus : tout ce qui envoie en masse ou sort des données en bloc ---
    { path: '/api/admin/leads/bulk', methods: ['POST'], role: 'gestionnaire' },
    { path: '/api/admin/leads/export', methods: ['GET'], role: 'gestionnaire' },
    { path: '/api/admin/audit', methods: READ, role: 'gestionnaire' },
    { path: '/admin/journal', methods: READ, role: 'gestionnaire' },

    // --- Toute l'équipe ---
    { path: paths.home, methods: READ, role: 'employe' },
    { path: '/admin/fiches', methods: READ, role: 'employe' },
    { path: '/admin/fiches/[id]', methods: READ, role: 'employe' },
    { path: '/api/admin/leads', methods: [...READ, 'POST'], role: 'employe' },
    { path: '/api/admin/leads/[id]', methods: [...READ, 'PATCH'], role: 'employe' },
    { path: paths.meApi, methods: READ, role: 'employe' },
    { path: paths.logoutApi, methods: ['POST'], role: 'employe' },
    { path: paths.passwordPage, methods: READ, role: 'employe' },
    { path: paths.passwordApi, methods: ['POST'], role: 'employe' },
    // Double vérification : chaque membre gère SON compte (les routes n'agissent que sur l'acteur).
    { path: paths.mfaPage, methods: READ, role: 'employe' },
    { path: paths.securityPage, methods: READ, role: 'employe' },
    { path: `${mfa}/{enroll|verify|trusted-session|trust|backup-code|backup-codes}`, methods: ['POST'], role: 'employe' },
    { path: `${mfa}/devices`, methods: [...READ, 'DELETE'], role: 'employe' },
    { path: `${mfa}/factors`, methods: ['DELETE'], role: 'employe' },
  ];
}

/** Matrice d'exemple montée sur les rôles par défaut. [à adapter] */
export const DEFAULT_ACCESS_MATRIX = defineAccessMatrix<TeamRole>({ roles: TEAM_ROLES, rules: exampleRules() });

/** [à adapter] Droits résumés pour l'écran (`GET /api/admin/me`), avec la matrice d'exemple. */
export const EXAMPLE_PERMISSION_CHECKS = {
  leads_delete: ['DELETE', '/api/admin/leads/00000000-0000-4000-8000-000000000000'],
  leads_bulk: ['POST', '/api/admin/leads/bulk'],
  leads_export: ['GET', '/api/admin/leads/export'],
  audit: ['GET', '/api/admin/audit'],
  team: ['GET', '/api/admin/team'],
  privacy: ['GET', '/api/admin/privacy'],
} as const satisfies Record<string, readonly [HttpMethod, string]>;
