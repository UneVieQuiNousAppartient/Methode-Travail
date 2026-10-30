// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/features/tasks/lib/fake-supabase.ts et src/lib/team/mfa-test-db.ts, commit 508f19a (2026-10-30) ; généralisé : exemples métier retirés, upsert/single/insert-select de mfa-test-db fusionnés, ILIKE avec échappement \% \_ et `_`, valeurs par défaut par table en option, faux Supabase Auth (getUser par jeton, admin.mfa) à la manière du faux du kit JS.
//
// Faux client Supabase EN MÉMOIRE pour Vitest. Support de test : aucun import de vitest, JAMAIS importé par
// `src/lib/**` hors des fichiers `*.test.ts`.
//
// Il applique réellement les filtres (c'est ce qui prouve qu'un filtre est posé sur chaque requête) et reproduit
// la sémantique PostgREST qui compte :
// - `table!inner(...)` + `.eq('table.col', x)` EXCLUT les lignes parentes dont la ligne liée ne correspond pas ;
//   sans `!inner`, le même filtre vide seulement l'objet joint ;
// - seules les colonnes listées dans `select(...)` sont renvoyées (une colonne non demandée est `undefined`) ;
// - `head: true` ne renvoie aucune ligne, seulement `count` ;
// - doublon sur une clé unique déclarée → erreur 23505 ;
// - `rpc(nom)` d'une fonction non déclarée → erreur (jamais un faux succès silencieux).
// Chaque requête est journalisée (`queries`, `writes`, `rpcCalls`, `ilikes`) pour vérifier ce qui a été demandé.
import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;

export interface FakeRelation {
  /** Table jointe. */
  table: string;
  /** Colonne de la table courante qui pointe vers `table.id`. */
  foreignKey: string;
}

export interface FakeRpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface FakeAuthFactor {
  id: string;
  status: 'verified' | 'unverified';
  factor_type?: string;
  friendly_name?: string | null;
  created_at?: string;
}

export interface FakeAuthUser {
  id: string;
  email: string;
  factors?: FakeAuthFactor[];
}

export interface FakeAuthSession {
  /** Jeton d'accès accepté par `auth.getUser(token)`. */
  token: string;
  userId: string;
}

export interface FakeOptions {
  /** `relations[table][nomJointure]`. */
  relations?: Record<string, Record<string, FakeRelation>>;
  /** Colonnes formant une clé unique par table : un doublon à l'insertion → erreur 23505. */
  unique?: Record<string, string[]>;
  /** Tables dont toute requête échoue (test de dégradation). */
  failTables?: string[];
  /** Colonnes ajoutées à chaque ligne insérée si elles manquent (ex. `id`, `created_at`). */
  defaults?: Record<string, (row: Row) => Row>;
  /** Fonctions SQL appelées par `rpc(nom, args)`. Une fonction absente → erreur. */
  rpc?: Record<string, (args: Record<string, unknown>, fake: FakeSupabase) => Promise<FakeRpcResult> | FakeRpcResult>;
  /** Faux Supabase Auth : comptes et jetons valides. Un jeton absent de la liste → erreur, comme un jeton falsifié. */
  auth?: { users?: FakeAuthUser[]; sessions?: FakeAuthSession[] };
}

export interface Filter {
  op: string;
  column: string;
  value: unknown;
}

export interface LoggedQuery {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns: string;
  head: boolean;
  /** `count: 'exact'` demandé. */
  count: boolean;
  filters: Filter[];
  limit: number | null;
  values?: unknown;
}

export interface FakeSupabase {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  queries: LoggedQuery[];
  writes: LoggedQuery[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** Motifs ILIKE reçus, tels quels (pour vérifier l'échappement fait par le code testé). */
  ilikes: string[];
  /** Appels faits au faux Auth (`getUser`, `admin.mfa.deleteFactor`…), sans les jetons. */
  authCalls: Array<{ method: string; userId?: string; factorId?: string }>;
}

interface OrderBy {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

interface Embed {
  name: string;
  inner: boolean;
  columns: string[];
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    if (TIMESTAMP.test(a) && TIMESTAMP.test(b)) return Date.parse(a) - Date.parse(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return Number(a) - Number(b);
}

/** Motif LIKE de Postgres → expression : `%` = suite quelconque, `_` = un caractère, `\x` = x littéral. */
export function likeToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\' && index + 1 < pattern.length) {
      index += 1;
      source += pattern[index].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    } else if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'is');
}

function test(actual: unknown, op: string, expected: unknown): boolean {
  const value = actual === undefined ? null : actual;
  switch (op) {
    case 'eq':
      return value !== null && value === expected;
    case 'neq':
      return value !== null && value !== expected;
    case 'is':
      return value === expected;
    case 'in':
      return (expected as unknown[]).includes(value);
    case 'lt':
      return value !== null && compare(value, expected) < 0;
    case 'lte':
      return value !== null && compare(value, expected) <= 0;
    case 'gt':
      return value !== null && compare(value, expected) > 0;
    case 'gte':
      return value !== null && compare(value, expected) >= 0;
    case 'ilike':
      return typeof value === 'string' && likeToRegExp(String(expected)).test(value);
    case 'not': {
      const negated = expected as { operator: string; value: unknown };
      return !test(actual, negated.operator, negated.value);
    }
    default:
      throw new Error(`Faux client : opérateur « ${op} » non géré.`);
  }
}

/**
 * Découpe une expression `.or()` en conditions, en respectant les valeurs entre guillemets doubles de PostgREST
 * (`email.eq."a,b"`) : une virgule ou une parenthèse entre guillemets ne sépare rien.
 */
export function splitOrExpression(expression: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (quoted && char === '\\' && index + 1 < expression.length) {
      current += char + expression[index + 1];
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (quoted) throw new Error('Faux client : guillemet non fermé dans .or().');
  parts.push(current);
  return parts;
}

function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1).replace(/\\(.)/g, '$1');
  return raw;
}

/** `a.is.null,b.eq."x,y"` → vrai si une condition passe ; la valeur brute est typée d'après la colonne. */
function testOr(row: Row, expression: string): boolean {
  return splitOrExpression(expression).some((part) => {
    const first = part.indexOf('.');
    const second = part.indexOf('.', first + 1);
    if (first < 0 || second < 0) throw new Error(`Faux client : condition .or() illisible « ${part} ».`);
    const column = part.slice(0, first);
    const op = part.slice(first + 1, second);
    const raw = unquote(part.slice(second + 1));
    const actual = row[column];
    if (op === 'is') return test(actual, 'is', raw === 'null' ? null : raw === 'true');
    let expected: unknown = raw;
    if (typeof actual === 'number') expected = Number(raw);
    if (typeof actual === 'boolean') expected = raw === 'true';
    return test(actual, op, expected);
  });
}

function parseEmbeds(columns: string): Embed[] {
  const embeds: Embed[] = [];
  for (const match of columns.matchAll(/(\w+)(!inner)?\(([^()]*)\)/g)) {
    embeds.push({
      name: match[1],
      inner: Boolean(match[2]),
      columns: match[3].split(',').map((column) => column.trim()).filter(Boolean),
    });
  }
  return embeds;
}

function topLevelColumns(columns: string): string[] {
  return columns
    .replace(/(\w+)(!inner)?\(([^()]*)\)/g, '')
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
}

function pick(row: Row, columns: string[]): Row {
  if (columns.length === 0 || columns.includes('*')) return { ...row };
  const picked: Row = {};
  for (const column of columns) picked[column] = row[column];
  return picked;
}

type Result = { data: unknown; count: number | null; error: { message: string; code?: string } | null };

export function createFakeSupabase(tables: Record<string, Row[]> = {}, options: FakeOptions = {}): FakeSupabase {
  const queries: LoggedQuery[] = [];
  const writes: LoggedQuery[] = [];
  const rpcCalls: FakeSupabase['rpcCalls'] = [];
  const ilikes: string[] = [];
  const authCalls: FakeSupabase['authCalls'] = [];

  function from(table: string) {
    const state = {
      kind: 'select' as LoggedQuery['kind'],
      columns: '*',
      head: false,
      count: false,
      filters: [] as Filter[],
      orders: [] as OrderBy[],
      limit: null as number | null,
      offset: 0,
      values: undefined as unknown,
      onConflict: null as string | null,
      /** Colonnes de `insert|update|upsert|delete(...).select(cols)` ; null = pas de retour demandé. */
      returning: null as string | null,
    };

    const runSelect = (): { rows: Row[]; count: number } => {
      const embeds = parseEmbeds(state.columns);
      const relations = options.relations?.[table] ?? {};

      for (const filter of state.filters) {
        const [embedName] = filter.column.split('.');
        if (filter.op !== 'or' && filter.column.includes('.') && !embeds.some((embed) => embed.name === embedName)) {
          throw new Error(`Faux client : filtre « ${filter.column} » sans jointure « ${embedName} » dans le select.`);
        }
      }

      type Entry = { row: Row; joined: Record<string, Row | null> };
      let entries: Entry[] = (tables[table] ?? []).map((row) => {
        const joined: Record<string, Row | null> = {};
        for (const embed of embeds) {
          const relation = relations[embed.name];
          if (!relation) throw new Error(`Faux client : relation « ${table}.${embed.name} » non déclarée.`);
          joined[embed.name] = (tables[relation.table] ?? []).find((related) => related.id === row[relation.foreignKey]) ?? null;
        }
        return { row, joined };
      });

      entries = entries.filter((entry) => {
        for (const embed of embeds) {
          const related = entry.joined[embed.name];
          const prefix = `${embed.name}.`;
          const embedFilters = state.filters.filter((filter) => filter.op !== 'or' && filter.column.startsWith(prefix));
          const passes =
            related !== null && embedFilters.every((filter) => test(related[filter.column.slice(prefix.length)], filter.op, filter.value));
          if (embed.inner && !passes) return false;
          if (!embed.inner && embedFilters.length > 0 && !passes) entry.joined[embed.name] = null;
        }
        return true;
      });

      entries = entries.filter((entry) =>
        state.filters
          .filter((filter) => filter.op === 'or' || !filter.column.includes('.'))
          .every((filter) =>
            filter.op === 'or' ? testOr(entry.row, String(filter.value)) : test(entry.row[filter.column], filter.op, filter.value),
          ),
      );

      entries.sort((left, right) => {
        for (const order of state.orders) {
          const a = left.row[order.column] ?? null;
          const b = right.row[order.column] ?? null;
          if (a === null && b === null) continue;
          if (a === null) return order.nullsFirst ? -1 : 1;
          if (b === null) return order.nullsFirst ? 1 : -1;
          const diff = compare(a, b);
          if (diff !== 0) return order.ascending ? diff : -diff;
        }
        return 0;
      });

      const count = entries.length;
      const limited = entries.slice(state.offset, state.limit === null ? undefined : state.offset + state.limit);
      const columns = topLevelColumns(state.columns);
      const rows = limited.map(({ row, joined }) => {
        const output = pick(row, columns);
        for (const embed of embeds) {
          const related = joined[embed.name];
          output[embed.name] = related ? pick(related, embed.columns) : null;
        }
        return output;
      });
      return { rows, count };
    };

    const rowMatches = (row: Row) =>
      state.filters.every((filter) =>
        filter.op === 'or' ? testOr(row, String(filter.value)) : test(row[filter.column], filter.op, filter.value),
      );

    const log = (): LoggedQuery => ({
      table,
      kind: state.kind,
      columns: state.columns,
      head: state.head,
      count: state.count,
      filters: [...state.filters],
      limit: state.limit,
      values: state.values,
    });

    const returned = (rows: Row[]): Result => {
      if (state.returning === null) return { data: null, count: null, error: null };
      const columns = topLevelColumns(state.returning);
      return { data: rows.map((row) => pick(row, columns)), count: null, error: null };
    };

    const duplicate = (key: string[], row: Row, except?: Row) =>
      (tables[table] ?? []).some((existing) => existing !== except && key.every((column) => existing[column] === row[column]));

    const execute = (): Result => {
      if (options.failTables?.includes(table)) {
        return { data: null, count: null, error: { message: `échec simulé (${table})`, code: 'XX000' } };
      }
      const incoming = (Array.isArray(state.values) ? state.values : [state.values]) as Row[];
      if (state.kind === 'insert') {
        writes.push(log());
        const uniqueKey = options.unique?.[table];
        const added: Row[] = [];
        for (const values of incoming) {
          const row = { ...(options.defaults?.[table]?.(values) ?? {}), ...values };
          if (uniqueKey && duplicate(uniqueKey, row)) {
            return { data: null, count: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          tables[table] = [...(tables[table] ?? []), row];
          added.push(row);
        }
        return returned(added);
      }
      if (state.kind === 'upsert') {
        writes.push(log());
        const key = (state.onConflict ?? 'id').split(',').map((column) => column.trim());
        const touched: Row[] = [];
        for (const values of incoming) {
          const existing = (tables[table] ?? []).find((row) => key.every((column) => row[column] === values[column]));
          if (existing) {
            Object.assign(existing, values);
            touched.push(existing);
          } else {
            const row = { ...(options.defaults?.[table]?.(values) ?? {}), ...values };
            tables[table] = [...(tables[table] ?? []), row];
            touched.push(row);
          }
        }
        return returned(touched);
      }
      if (state.kind === 'update') {
        writes.push(log());
        const updated = (tables[table] ?? []).filter(rowMatches);
        const uniqueKey = options.unique?.[table];
        for (const row of updated) {
          const next = { ...row, ...(state.values as Row) };
          if (uniqueKey && duplicate(uniqueKey, next, row)) {
            return { data: null, count: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
        }
        for (const row of updated) Object.assign(row, state.values as Row);
        return returned(updated);
      }
      if (state.kind === 'delete') {
        writes.push(log());
        const doomed = (tables[table] ?? []).filter(rowMatches);
        tables[table] = (tables[table] ?? []).filter((row) => !doomed.includes(row));
        return returned(doomed);
      }
      queries.push(log());
      const { rows, count } = runSelect();
      return { data: state.head ? null : rows, count: state.count ? count : null, error: null };
    };

    const filter = (op: string) => (column: string, value: unknown) => {
      if (op === 'ilike') ilikes.push(String(value));
      state.filters.push({ op, column, value });
      return builder;
    };

    const builder = {
      select: (columns = '*', opts?: { count?: string; head?: boolean }) => {
        if (state.kind === 'select') {
          state.columns = columns;
          state.head = Boolean(opts?.head);
          state.count = opts?.count === 'exact';
        } else {
          state.returning = columns;
        }
        return builder;
      },
      insert: (values: unknown) => {
        state.kind = 'insert';
        state.values = values;
        return builder;
      },
      upsert: (values: unknown, opts?: { onConflict?: string }) => {
        state.kind = 'upsert';
        state.values = values;
        state.onConflict = opts?.onConflict ?? null;
        return builder;
      },
      update: (values: unknown) => {
        state.kind = 'update';
        state.values = values;
        return builder;
      },
      delete: () => {
        state.kind = 'delete';
        return builder;
      },
      eq: filter('eq'),
      neq: filter('neq'),
      is: filter('is'),
      in: filter('in'),
      lt: filter('lt'),
      lte: filter('lte'),
      gt: filter('gt'),
      gte: filter('gte'),
      ilike: filter('ilike'),
      not: (column: string, operator: string, value: unknown) => {
        state.filters.push({ op: 'not', column, value: { operator, value } });
        return builder;
      },
      or: (expression: string) => {
        state.filters.push({ op: 'or', column: '*', value: expression });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const ascending = opts?.ascending ?? true;
        // Défaut Postgres : ASC → NULLS LAST, DESC → NULLS FIRST.
        state.orders.push({ column, ascending, nullsFirst: opts?.nullsFirst ?? !ascending });
        return builder;
      },
      limit: (value: number) => {
        state.limit = value;
        return builder;
      },
      range: (fromIndex: number, toIndex: number) => {
        state.offset = fromIndex;
        state.limit = toIndex - fromIndex + 1;
        return builder;
      },
      maybeSingle: async () => {
        const result = execute();
        if (result.error) return result;
        const rows = (result.data ?? []) as Row[];
        if (rows.length > 1) return { data: null, count: null, error: { message: 'multiple rows returned', code: 'PGRST116' } };
        return { data: rows[0] ?? null, count: null, error: null };
      },
      single: async () => {
        const result = execute();
        if (result.error) return result;
        const rows = (result.data ?? []) as Row[];
        if (rows.length !== 1) return { data: null, count: null, error: { message: 'expected exactly one row', code: 'PGRST116' } };
        return { data: rows[0], count: null, error: null };
      },
      then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => {
        let result: Result;
        try {
          result = execute();
        } catch (error) {
          return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }

  const users = options.auth?.users ?? [];
  const sessions = options.auth?.sessions ?? [];
  const findUser = (id: string) => users.find((user) => user.id === id) ?? null;
  const authError = (message: string, status = 401) => ({ message, status, name: 'AuthApiError' });

  const auth = {
    getUser: async (token?: string) => {
      authCalls.push({ method: 'getUser' });
      const session = typeof token === 'string' && token ? sessions.find((entry) => entry.token === token) : undefined;
      const user = session ? findUser(session.userId) : null;
      if (!user) return { data: { user: null }, error: authError('invalid JWT') };
      return { data: { user: structuredClone(user) }, error: null };
    },
    admin: {
      getUserById: async (userId: string) => {
        authCalls.push({ method: 'admin.getUserById', userId });
        const user = findUser(userId);
        return user ? { data: { user: structuredClone(user) }, error: null } : { data: { user: null }, error: authError('User not found', 404) };
      },
      mfa: {
        listFactors: async ({ userId }: { userId: string }) => {
          authCalls.push({ method: 'admin.mfa.listFactors', userId });
          const user = findUser(userId);
          if (!user) return { data: null, error: authError('User not found', 404) };
          return { data: { factors: structuredClone(user.factors ?? []) }, error: null };
        },
        deleteFactor: async ({ id, userId }: { id: string; userId: string }) => {
          authCalls.push({ method: 'admin.mfa.deleteFactor', userId, factorId: id });
          const user = findUser(userId);
          const factor = user?.factors?.find((entry) => entry.id === id);
          if (!user || !factor) return { data: null, error: authError('Factor not found', 404) };
          user.factors = (user.factors ?? []).filter((entry) => entry.id !== id);
          return { data: { id }, error: null };
        },
      },
    },
  };

  const fake = { tables, queries, writes, rpcCalls, ilikes, authCalls } as Omit<FakeSupabase, 'client'> as FakeSupabase;
  const rpc = async (name: string, args: Record<string, unknown> = {}): Promise<FakeRpcResult> => {
    rpcCalls.push({ name, args });
    const handler = options.rpc?.[name];
    if (!handler) return { data: null, error: { message: `Faux client : rpc « ${name} » non simulée.`, code: 'PGRST202' } };
    return handler(args, fake);
  };
  fake.client = { from, rpc, auth } as unknown as SupabaseClient;
  return fake;
}

/** Identifiants UUID v4 déterministes pour les tests (`fakeUuid(1)` → `…-000000000001`). */
export const fakeUuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
