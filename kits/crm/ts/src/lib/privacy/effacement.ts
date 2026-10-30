// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/lib/crm/effacement.ts (empreinte d'abord, bilan, empreintes effacées), commit 59e389a (2026-10-30) + KHI Educ, app/v1/admin/privacy/route.js (adresse de l'équipe refusée, courriel sans fiche, registre des demandes d'accès), commit 1a02685 (2026-10-30) ; généralisé : tables préfixées du projet → ERASABLE_SOURCES, acteur = AuditActor (jamais un nom écrit en dur ni un courriel), secret PRIVACY_HASH_SECRET (sans repli), refus avec message clair au lieu d'exceptions, liste « à effacer à la main » [à adapter].
//
// Demandes Loi 25 d'une personne identifiée par son courriel : accès (export) et effacement.
//
// Effacement — ordre IMPOSÉ :
//   1. refus si l'adresse est invalide, si aucun secret d'empreinte n'est configuré, si c'est une adresse de
//      l'équipe (ou si la liste de l'équipe est illisible) ;
//   2. EMPREINTE d'abord (`privacy_requests`, kind 'erase', statut « en_cours ») : si la suite échoue, plus rien
//      ne part quand même vers cette adresse (`mayContact`) ; une relance de l'effacement réutilise la même ligne ;
//   3. ce qui pointe vers les fiches (sources `lead_id`), puis ce qui porte l'adresse sans fiche (sources
//      `email`), puis les fiches elles-mêmes ;
//   4. statut « fait » et bilan (nombres de lignes seulement, jamais de contenu).
// Courriel sans fiche : couvert (étape 3, sources `email`), l'empreinte est écrite quand même.
// Le journal des actions (`audit('privacy.erase')`, meta = bilan) est écrit par la route APRÈS le résultat.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditActor } from '@/lib/auth/types';
import { actorKey } from '@/lib/audit/admin-audit';
import { empreinteCourriel, hashKeyId, privacyHashSecret } from './conservation';
import {
  type ErasableSource,
  ERASABLE_SOURCES,
  PERSON_TABLE,
  type PersonData,
  TEAM_ALLOWLIST,
  assertSources,
  collectPersonData,
  countsOf,
  emailColumnsByTable,
  isValidPersonEmail,
  normalizePersonEmail,
  personIds,
  rowsByEmail,
  teamAddresses,
} from './privacy';

type Env = Record<string, string | undefined>;

export const PRIVACY_REQUESTS_TABLE = 'privacy_requests';

/** [à adapter] Hors de la base : à effacer À LA MAIN après un effacement (affiché à la personne qui l'a lancé). */
export const MANUAL_ERASURE_STEPS: readonly string[] = [
  'Agenda en ligne : supprimer les rendez-vous qui portent le nom ou l’adresse de cette personne. [à adapter]',
  'Fournisseur d’envoi de courriels : supprimer les journaux d’envoi qui portent son adresse. [à adapter]',
  'Boîte de réception de l’équipe : supprimer les échanges avec cette personne. [à adapter]',
];

export type PrivacyRefusal =
  | 'invalid_email'
  | 'invalid_actor'
  | 'secret_missing'
  | 'team_member'
  | 'team_unreadable'
  | 'hash_failed'
  | 'read_failed'
  | 'register_failed'
  | 'partial';

/** [à adapter] Messages affichés à l'équipe. */
export const PRIVACY_MESSAGES: Record<PrivacyRefusal, string> = {
  invalid_email: 'Courriel invalide.',
  invalid_actor: 'Membre de l’équipe non reconnu : reconnectez-vous.',
  secret_missing:
    'Effacement impossible : aucun secret d’empreinte configuré. Ajoutez PRIVACY_HASH_SECRET (32 caractères ou plus) dans les variables d’environnement, puis relancez.',
  team_member: 'Cette adresse est celle d’un membre de l’équipe : retirez d’abord son accès, puis relancez.',
  team_unreadable: 'La liste de l’équipe est illisible : rien n’a été effacé. Réessayez plus tard.',
  hash_failed: 'Rien n’a été effacé : l’empreinte de l’adresse n’a pas pu être enregistrée. Réessayez.',
  read_failed: 'Lecture des données impossible : rien n’a été exporté. Réessayez.',
  register_failed: 'La demande n’a pas pu être inscrite au registre : rien n’a été exporté. Réessayez.',
  partial: 'Effacement PARTIEL : une partie des données n’a pas pu être effacée. L’adresse est déjà bloquée ; relancez l’effacement.',
};

export type Bilan = Record<string, number>;

export type EraseResult =
  | { ok: true; bilan: Bilan; requestId: string; manual: readonly string[] }
  | { ok: false; code: PrivacyRefusal; message: string; bilan?: Bilan };

export interface PrivacyOptions {
  actor: AuditActor;
  env?: Env;
  sources?: readonly ErasableSource[];
  person?: { table: string; column: string };
  allowlist?: { table: string; column: string };
  /** Adresses de l'équipe en plus de EMAIL_FROM, EMAIL_REPLY_TO, CONTACT_EMAIL et de la liste blanche. */
  teamExtra?: readonly string[];
}

const refuse = (code: PrivacyRefusal, bilan?: Bilan): EraseResult => ({ ok: false, code, message: PRIVACY_MESSAGES[code], ...(bilan ? { bilan } : {}) });

const CHUNK = 200;

async function deleteIn(db: SupabaseClient, table: string, column: string, values: readonly string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await db.from(table).delete().in(column, values.slice(i, i + CHUNK)).select('id');
    if (error) throw new Error(`${table} : ${error.code ?? 'suppression impossible'}`);
    total += (data ?? []).length;
  }
  return total;
}

/** Préconditions communes : adresse, acteur, équipe. `null` = on peut continuer. */
async function precheck(db: SupabaseClient, email: string, options: PrivacyOptions): Promise<{ code: PrivacyRefusal } | { team: boolean }> {
  if (!isValidPersonEmail(email)) return { code: 'invalid_email' };
  if (!actorKey(options.actor)) return { code: 'invalid_actor' };
  const team = await teamAddresses(db, { env: options.env, extra: options.teamExtra, allowlist: options.allowlist ?? TEAM_ALLOWLIST });
  if (team.error) return { code: 'team_unreadable' };
  return { team: team.set.has(email) };
}

/** Efface la personne de cette adresse. Ne lève pas : refus ou effacement partiel → `{ ok: false, code, message }`. */
export async function erasePerson(db: SupabaseClient, rawEmail: string, options: PrivacyOptions): Promise<EraseResult> {
  const email = normalizePersonEmail(rawEmail);
  const sources = options.sources ?? ERASABLE_SOURCES;
  const person = options.person ?? PERSON_TABLE;
  assertSources(sources); // erreur de configuration du projet : doit se voir, pas se taire

  if (!isValidPersonEmail(email)) return refuse('invalid_email');
  const secret = privacyHashSecret(options.env ?? process.env);
  if (!secret) return refuse('secret_missing');
  const actor = actorKey(options.actor);
  if (!actor) return refuse('invalid_actor');
  let checked: Awaited<ReturnType<typeof precheck>>;
  try {
    checked = await precheck(db, email, options);
  } catch {
    return refuse('team_unreadable');
  }
  if ('code' in checked) return refuse(checked.code);
  if (checked.team) return refuse('team_member');

  // 2. L'empreinte D'ABORD. Une seule ligne par adresse (index unique, migration 0108) : une relance la réutilise.
  const hash = empreinteCourriel(email, secret);
  const key = hashKeyId(secret);
  let requestId: string;
  try {
    const { data: existing, error: readError } = await db.from(PRIVACY_REQUESTS_TABLE).select('id').eq('kind', 'erase').eq('email_hash', hash).limit(1);
    if (readError) return refuse('hash_failed');
    if (existing && existing.length) requestId = String((existing[0] as { id: unknown }).id);
    else {
      const { data, error } = await db
        .from(PRIVACY_REQUESTS_TABLE)
        .insert({ kind: 'erase', email_hash: hash, actor, summary: { status: 'in_progress', key } })
        .select('id')
        .single();
      if (error || !data) return refuse('hash_failed');
      requestId = String((data as { id: unknown }).id);
    }
  } catch {
    return refuse('hash_failed');
  }

  // 3. Les données : ce qui pointe vers les fiches, puis ce qui porte l'adresse, puis les fiches.
  const bilan: Bilan = {};
  try {
    const leadIds = await personIds(db, email, person);
    for (const source of sources) {
      if (source.by !== 'lead_id' || !leadIds.length) continue;
      bilan[source.table] = (bilan[source.table] ?? 0) + (await deleteIn(db, source.table, source.column, leadIds));
    }
    for (const [table, columns] of emailColumnsByTable(sources)) {
      const ids = (await rowsByEmail(db, table, columns, email, ['id', ...columns].join(', '))).map((row) => String(row.id));
      bilan[table] = (bilan[table] ?? 0) + (await deleteIn(db, table, 'id', ids));
    }
    bilan[person.table] = await deleteIn(db, person.table, 'id', leadIds);
  } catch {
    // L'empreinte reste « en_cours » : l'adresse est bloquée ; relancer l'effacement termine le travail.
    await db
      .from(PRIVACY_REQUESTS_TABLE)
      .update({ summary: { status: 'partial', key, bilan } })
      .eq('id', requestId)
      .then(
        () => undefined,
        () => undefined,
      );
    return refuse('partial', bilan);
  }

  // 4. Statut final. Un échec ici ne défait rien (les données sont effacées, l'empreinte existe).
  const { error: doneError } = await db.from(PRIVACY_REQUESTS_TABLE).update({ summary: { status: 'done', key, bilan } }).eq('id', requestId);
  if (doneError) console.warn('[privacy] statut final non écrit', doneError.code ?? 'inconnu');
  return { ok: true, bilan, requestId, manual: MANUAL_ERASURE_STEPS };
}

export type AccessResult =
  | { ok: true; data: PersonData; counts: Bilan }
  | { ok: false; code: PrivacyRefusal; message: string };

/**
 * Demande d'accès : toutes les données de la personne, et une ligne au registre (`privacy_requests`, kind
 * 'access', empreinte seulement). Adresse de l'équipe : seules les lignes de ses propres fiches (scope
 * `leads_only`). Registre impossible → rien n'est rendu (la demande doit être tracée).
 */
export async function accessPerson(db: SupabaseClient, rawEmail: string, options: PrivacyOptions): Promise<AccessResult> {
  const email = normalizePersonEmail(rawEmail);
  const sources = options.sources ?? ERASABLE_SOURCES;
  const person = options.person ?? PERSON_TABLE;
  assertSources(sources);
  if (!isValidPersonEmail(email)) return { ok: false, code: 'invalid_email', message: PRIVACY_MESSAGES.invalid_email };
  const secret = privacyHashSecret(options.env ?? process.env);
  if (!secret) return { ok: false, code: 'secret_missing', message: PRIVACY_MESSAGES.secret_missing };
  if (!actorKey(options.actor)) return { ok: false, code: 'invalid_actor', message: PRIVACY_MESSAGES.invalid_actor };
  let byAddress = false;
  try {
    const team = await teamAddresses(db, { env: options.env, extra: options.teamExtra, allowlist: options.allowlist ?? TEAM_ALLOWLIST });
    // Liste illisible : pas de lecture « par adresse », par prudence.
    byAddress = !team.error && !team.set.has(email);
  } catch {
    byAddress = false;
  }
  let data: PersonData;
  try {
    data = await collectPersonData(db, email, { sources, person, byAddress });
  } catch {
    return { ok: false, code: 'read_failed', message: PRIVACY_MESSAGES.read_failed };
  }
  const counts = countsOf(data, person.table);
  const { error } = await db.from(PRIVACY_REQUESTS_TABLE).insert({
    kind: 'access',
    email_hash: empreinteCourriel(email, secret),
    actor: actorKey(options.actor),
    summary: { status: 'done', key: hashKeyId(secret), counts, scope: data.scope },
  });
  if (error) return { ok: false, code: 'register_failed', message: PRIVACY_MESSAGES.register_failed };
  return { ok: true, data, counts };
}

/** Empreintes des personnes effacées (moteur des relances : ne plus jamais leur écrire). Lève si la lecture échoue. */
export async function erasedHashes(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(PRIVACY_REQUESTS_TABLE).select('email_hash').eq('kind', 'erase').order('id').range(start, start + 999);
    if (error) throw new Error(`${PRIVACY_REQUESTS_TABLE} : ${error.code ?? 'lecture impossible'}`);
    for (const row of (data ?? []) as Array<{ email_hash: string }>) out.add(row.email_hash);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Peut-on écrire (relance, accusé, infolettre) à cette adresse ? Non si elle a été effacée, et non, par
 * prudence, quand aucun secret ne permet de le vérifier.
 */
export function mayContact(rawEmail: string, erased: ReadonlySet<string>, env: Env = process.env): boolean {
  const email = normalizePersonEmail(rawEmail);
  if (!isValidPersonEmail(email)) return false;
  const secret = privacyHashSecret(env);
  if (!secret) return false;
  return !erased.has(empreinteCourriel(email, secret));
}
