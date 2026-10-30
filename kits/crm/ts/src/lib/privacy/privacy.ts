// Kit CRM TS (methode-travail) — origine : KHI Educ, lib/privacy.js (normalizePersonEmail, isValidPersonEmail, postgrestQuote, filtre .or() des courriels, mergeById, addressOf, teamAddresses, collecte des courriels), commit 1a02685 (2026-10-30) + KHI Educ, app/v1/admin/privacy/route.js (ordre des tables, courriel sans fiche, adresse de l'équipe), même commit ; généralisé : tables du projet → liste déclarée ERASABLE_SOURCES [à adapter], recherche par motif ILIKE échappé placé entre guillemets dans .or() puis égalité exacte en JS, liste blanche de l'équipe en paramètre.
//
// Droits d'accès et d'effacement (Loi 25) : où se trouvent les données d'une personne, identifiée par son
// courriel, et comment les retrouver SANS jamais viser quelqu'un d'autre.
//
// Règles :
// - Adresse normalisée (minuscules, espaces retirés) et validée avant toute requête.
// - Valeur d'un filtre `.or()` TOUJOURS entre guillemets et échappée (`postgrestQuote`) : supabase-js
//   n'échappe rien dans `.or()` ; sans cela, « x,to_email.neq.y » ajouterait une condition (lecture ou
//   effacement d'autres lignes).
// - Motif ILIKE TOUJOURS échappé (`motifExact` : « % », « _ », « \ » littéraux), jamais entouré de jokers ;
//   puis égalité exacte en JS (PostgREST lit aussi « * » comme un joker dans like/ilike) : seules les lignes
//   dont la colonne vaut EXACTEMENT l'adresse sont gardées. On efface ensuite par identifiant.
// - Adresses de l'équipe (expéditeur, réponses, contact affiché, liste blanche) : jamais effacées, et
//   jamais lues « par adresse » (sinon l'export d'un membre emporterait les échanges avec tous les contacts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { motifExact } from './conservation';

type Env = Record<string, string | undefined>;
export type Row = Record<string, unknown>;

/** Une source de données personnelles : table, et colonne qui la rattache à la personne. */
export interface ErasableSource {
  table: string;
  /** `email` : la colonne contient l'adresse ; `lead_id` : la colonne pointe vers une fiche de la personne. */
  by: 'email' | 'lead_id';
  column: string;
}

/** [à adapter] Table des fiches (une personne peut en avoir plusieurs) et sa colonne courriel. Effacée EN DERNIER. */
export const PERSON_TABLE = { table: 'leads', column: 'email' } as const;

/**
 * [à adapter] Toutes les tables qui portent des données d'une personne, hors `PERSON_TABLE`. Ordre d'effacement :
 * d'abord ce qui pointe vers les fiches (`lead_id`, sans compter sur une cascade), puis ce qui porte l'adresse
 * sans fiche (`email` : courriel reçu avant la demande, fiche déjà supprimée…), puis les fiches.
 * Chaque table doit avoir une colonne `id`.
 */
export const ERASABLE_SOURCES: readonly ErasableSource[] = [
  { table: 'lead_activities', by: 'lead_id', column: 'lead_id' },
  { table: 'lead_tasks', by: 'lead_id', column: 'lead_id' },
  { table: 'email_messages', by: 'lead_id', column: 'lead_id' },
  { table: 'email_messages', by: 'email', column: 'from_email' },
  { table: 'email_messages', by: 'email', column: 'to_email' },
  { table: 'bookings', by: 'email', column: 'email' },
];

/** [à adapter] Table de la liste blanche de l'équipe (migration 0103) et sa colonne courriel. */
export const TEAM_ALLOWLIST = { table: 'team_allowlist', column: 'email' } as const;

// Adresse acceptée : un seul @, un point dans le domaine, ni espace ni caractère de contrôle.
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/;
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const PAGE = 1000;
const CHUNK = 200;

export const normalizePersonEmail = (raw: unknown): string => String(raw ?? '').trim().toLowerCase();
export const isValidPersonEmail = (email: unknown): boolean => {
  const text = String(email ?? '');
  return text.length <= 254 && VALID_EMAIL.test(text) && !CONTROL.test(text);
};

/**
 * Valeur entre guillemets doubles pour un filtre logique de PostgREST (`or=(…)`) : « \ » et « " » échappés par
 * une barre oblique inverse ; virgules, points et parenthèses deviennent inoffensifs.
 */
export const postgrestQuote = (value: string): string => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Filtre `.or()` « une des colonnes vaut cette adresse, sans tenir compte de la casse » ; null si l'adresse est invalide. */
export function emailOrFilter(columns: readonly string[], email: string): string | null {
  const e = normalizePersonEmail(email);
  if (!isValidPersonEmail(e) || columns.length === 0) return null;
  for (const column of columns) assertIdentifier(column);
  const quoted = postgrestQuote(motifExact(e));
  return columns.map((column) => `${column}.ilike.${quoted}`).join(',');
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`Nom de table ou de colonne invalide : « ${String(name).slice(0, 40)} ».`);
}

/** Vérifie la liste déclarée (noms sûrs, `by` connu). Lève à la première erreur de configuration. */
export function assertSources(sources: readonly ErasableSource[]): void {
  for (const source of sources) {
    assertIdentifier(source.table);
    assertIdentifier(source.column);
    if (source.by !== 'email' && source.by !== 'lead_id') throw new Error(`Source « ${source.table} » : « by » doit valoir email ou lead_id.`);
  }
}

/** Réunit plusieurs listes de lignes sans doublon (par id). */
export const mergeById = (...lists: Row[][]): Row[] => {
  const byId = new Map<string, Row>();
  for (const row of lists.flat()) if (row && row.id !== undefined && row.id !== null && !byId.has(String(row.id))) byId.set(String(row.id), row);
  return [...byId.values()];
};

/** Première adresse d'un « Nom <adresse> » ou d'une liste, en minuscules ; null sinon. */
export const addressOf = (value: unknown): string | null => {
  const match = String(value ?? '').match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return match ? match[0].toLowerCase() : null;
};

/**
 * Adresses de l'équipe : expéditeur (EMAIL_FROM), réponses (EMAIL_REPLY_TO), contact affiché (CONTACT_EMAIL),
 * adresses ajoutées par le projet, et liste blanche. Liste blanche illisible → `error` : l'appelant refuse alors
 * l'effacement, par prudence.
 */
export async function teamAddresses(
  db: SupabaseClient,
  { env = process.env, extra = [], allowlist = TEAM_ALLOWLIST }: { env?: Env; extra?: readonly string[]; allowlist?: { table: string; column: string } } = {},
): Promise<{ set: Set<string>; error: string | null }> {
  const set = new Set([env.EMAIL_FROM, env.EMAIL_REPLY_TO, env.CONTACT_EMAIL, ...extra].map(addressOf).filter((a): a is string => Boolean(a)));
  try {
    assertIdentifier(allowlist.table);
    assertIdentifier(allowlist.column);
    const { data, error } = await db.from(allowlist.table).select(allowlist.column);
    if (error) return { set, error: error.code ?? 'erreur' };
    for (const row of (data ?? []) as unknown as Row[]) {
      const address = addressOf(row[allowlist.column]);
      if (address) set.add(address);
    }
    return { set, error: null };
  } catch (error) {
    return { set, error: error instanceof Error ? error.name : 'erreur' };
  }
}

const exactly = (row: Row, columns: readonly string[], email: string) =>
  columns.some((column) => String(row[column] ?? '').trim().toLowerCase() === email);

/**
 * Lignes d'une table dont UNE des colonnes vaut exactement l'adresse (motif ILIKE échappé, entre guillemets,
 * puis égalité exacte en JS). Toutes les pages sont lues. Lève si une lecture échoue.
 */
export async function rowsByEmail(db: SupabaseClient, table: string, columns: readonly string[], email: string, select = '*'): Promise<Row[]> {
  assertIdentifier(table);
  const filter = emailOrFilter(columns, email);
  if (!filter) throw new Error('adresse invalide');
  const e = normalizePersonEmail(email);
  const out: Row[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await db.from(table).select(select).or(filter).order('id').range(start, start + PAGE - 1);
    if (error) throw new Error(`${table} : ${error.code ?? 'lecture impossible'}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows.filter((row) => exactly(row, columns, e)));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Identifiants des fiches de cette adresse (`PERSON_TABLE`) : motif ILIKE échappé, puis égalité exacte en JS. */
export async function personIds(db: SupabaseClient, email: string, person: { table: string; column: string } = PERSON_TABLE): Promise<string[]> {
  assertIdentifier(person.table);
  assertIdentifier(person.column);
  const e = normalizePersonEmail(email);
  if (!isValidPersonEmail(e)) throw new Error('adresse invalide');
  const ids: string[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await db
      .from(person.table)
      .select(`id, ${person.column}`)
      .ilike(person.column, motifExact(e))
      .order('id')
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`${person.table} : ${error.code ?? 'lecture impossible'}`);
    const rows = (data ?? []) as unknown as Row[];
    ids.push(...rows.filter((row) => exactly(row, [person.column], e)).map((row) => String(row.id)));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Lignes d'une table rattachées à ces fiches. Lève si une lecture échoue. */
export async function rowsByLead(db: SupabaseClient, table: string, column: string, leadIds: readonly string[], select = '*'): Promise<Row[]> {
  assertIdentifier(table);
  assertIdentifier(column);
  const out: Row[] = [];
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const { data, error } = await db.from(table).select(select).in(column, leadIds.slice(i, i + CHUNK));
    if (error) throw new Error(`${table} : ${error.code ?? 'lecture impossible'}`);
    out.push(...((data ?? []) as unknown as Row[]));
  }
  return out;
}

/** Colonnes courriel par table (une requête `.or()` par table). */
export function emailColumnsByTable(sources: readonly ErasableSource[]): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  for (const source of sources) {
    if (source.by !== 'email') continue;
    byTable.set(source.table, [...(byTable.get(source.table) ?? []), source.column]);
  }
  return byTable;
}

export interface PersonData {
  /** Fiches (`PERSON_TABLE`). */
  person: Row[];
  /** Lignes par table, sans doublon. */
  tables: Record<string, Row[]>;
  /** `leads_only` : adresse de l'équipe, ou liste de l'équipe illisible — seules les lignes de ses fiches sont lues. */
  scope: 'full' | 'leads_only';
}

/**
 * Toutes les données d'une personne (demande d'accès). Courriel sans fiche couvert : les sources `email` sont
 * lues même sans fiche. Lève si une lecture échoue (un export incomplet ne doit pas passer pour complet).
 */
export async function collectPersonData(
  db: SupabaseClient,
  email: string,
  {
    sources = ERASABLE_SOURCES,
    person = PERSON_TABLE,
    byAddress = true,
  }: { sources?: readonly ErasableSource[]; person?: { table: string; column: string }; byAddress?: boolean } = {},
): Promise<PersonData> {
  assertSources(sources);
  const e = normalizePersonEmail(email);
  if (!isValidPersonEmail(e)) throw new Error('adresse invalide');
  const leadIds = await personIds(db, e, person);
  const personRows = await rowsByLead(db, person.table, 'id', leadIds);
  const tables: Record<string, Row[]> = {};
  for (const source of sources) {
    if (source.by !== 'lead_id' || !leadIds.length) continue;
    tables[source.table] = mergeById(tables[source.table] ?? [], await rowsByLead(db, source.table, source.column, leadIds));
  }
  if (byAddress) {
    for (const [table, columns] of emailColumnsByTable(sources)) {
      tables[table] = mergeById(tables[table] ?? [], await rowsByEmail(db, table, columns, e));
    }
  }
  return { person: personRows, tables, scope: byAddress ? 'full' : 'leads_only' };
}

/** Nombre de lignes par table (pour le registre et le journal : jamais de contenu). */
export function countsOf(data: PersonData, personTable: string = PERSON_TABLE.table): Record<string, number> {
  const counts: Record<string, number> = { [personTable]: data.person.length };
  for (const [table, rows] of Object.entries(data.tables)) counts[table] = rows.length;
  return counts;
}
