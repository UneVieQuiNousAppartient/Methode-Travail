// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/audit/subject-access.ts, commit 508f19a (2026-10-30) ; généralisé : acteur = membre de l'équipe (identifiant + rôle, sans courriel), mode jeton et repli sur l'ancienne table retirés, types de fiches en liste [à adapter], purge avec durée de conservation en paramètre obligatoire.
//
// Journal d'accès Loi 25 : point d'écriture UNIQUE pour « qui a ouvert quelle fiche » et « qui a exporté ou
// cherché combien de fiches », dans `subject_access_log` (migration 0107).
//
// Règles :
// - UNE ligne par OUVERTURE de fiche (`view`, un seul identifiant). Une liste ou une recherche n'écrit pas une
//   ligne par fiche affichée : une seule ligne `search` (ou `export`) avec le NOMBRE de fiches.
// - Identifiants seulement : jamais de nom, de courriel ni de contenu de fiche ; ni l'adresse du membre (son
//   identifiant suffit) ; ni le texte cherché ni les filtres saisis.
// - Chemin journalisé sans paramètres d'URL (`sanitizeLoggedPath`) : `?q=…` peut contenir un nom ou un courriel.
// - Jamais bloquant : un échec d'écriture ne casse pas l'affichage (avertissement sans donnée personnelle,
//   la fonction ne lève jamais).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamMember, TeamRole } from '@/lib/auth/types';

export const ACCESS_LOG_TABLE = 'subject_access_log';

/** [à adapter] Types de fiches dont l'ouverture est journalisée. */
export const SUBJECT_TYPES = ['lead', 'client', 'appointment'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type SubjectAccessInput =
  | { action: 'view'; subjectType: SubjectType; subjectId: string; path: string }
  | { action: 'export'; subjectType: SubjectType; rowCount: number; path: string }
  | { action: 'search'; subjectType: SubjectType; rowCount: number; path: string };

/** Ce qui est lu du membre : son identifiant et son rôle, rien d'autre. */
export type AccessActor = Pick<TeamMember, 'userId' | 'role'>;

export interface SubjectAccessRow {
  actor_user_id: string;
  actor_role: TeamRole;
  path: string;
  subject_type: SubjectType;
  subject_id: string | null;
  action: 'view' | 'export' | 'search';
  row_count: number | null;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_EXACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_PATH = /^[A-Za-z0-9/_\-[\]]*$/;
export const MASKED_PATH = '(chemin masqué)';

const isSubjectType = (value: unknown): value is SubjectType => typeof value === 'string' && (SUBJECT_TYPES as readonly string[]).includes(value);

/**
 * Chemin journalisé : sans paramètres d'URL ni fragment, identifiants remplacés par `[id]` (le sujet a sa
 * propre colonne), et masqué s'il contient autre chose que des caractères de chemin (un courriel, des espaces…).
 */
export function sanitizeLoggedPath(path: string): string {
  const withoutQuery = String(path ?? '').split(/[?#]/)[0] ?? '';
  const templated = withoutQuery.replace(UUID_PATTERN, '[id]');
  return SAFE_PATH.test(templated) && templated.startsWith('/') ? templated.slice(0, 300) : MASKED_PATH;
}

/** Ligne à écrire, ou `null` si l'entrée est invalide (acteur ou fiche non uuid, compte négatif, type inconnu…). */
export function buildSubjectAccessRow(actor: AccessActor, input: SubjectAccessInput): SubjectAccessRow | null {
  if (!actor || typeof actor.userId !== 'string' || !UUID_EXACT.test(actor.userId) || !actor.role) return null;
  if (!input || !isSubjectType(input.subjectType)) return null;
  const base = { actor_user_id: actor.userId.toLowerCase(), actor_role: actor.role, path: sanitizeLoggedPath(input.path) };

  if (input.action === 'view') {
    if (typeof input.subjectId !== 'string' || !UUID_EXACT.test(input.subjectId)) return null;
    return { ...base, subject_type: input.subjectType, subject_id: input.subjectId.toLowerCase(), action: 'view', row_count: null };
  }
  if (input.action !== 'export' && input.action !== 'search') return null;
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) return null;
  return { ...base, subject_type: input.subjectType, subject_id: null, action: input.action, row_count: input.rowCount };
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'inconnu';
}

/**
 * Écrit une ligne de journal. Ne lève JAMAIS : `true` si la ligne est écrite, `false` sinon (avec un
 * avertissement sans donnée personnelle). L'appelant continue l'affichage dans les deux cas.
 */
export async function recordSubjectAccess(admin: SupabaseClient | null, actor: AccessActor, input: SubjectAccessInput): Promise<boolean> {
  try {
    const row = buildSubjectAccessRow(actor, input);
    if (!row) {
      console.warn('[access-log] entrée invalide, rien écrit', input?.action);
      return false;
    }
    if (!admin) {
      console.warn('[access-log] base indisponible, accès non journalisé', row.action, row.subject_type);
      return false;
    }
    const { error } = await admin.from(ACCESS_LOG_TABLE).insert(row);
    if (!error) return true;
    console.warn('[access-log] écriture du journal en échec', errorCode(error));
    return false;
  } catch (error) {
    console.warn('[access-log] écriture du journal en échec', error instanceof Error ? error.name : 'inconnue');
    return false;
  }
}

/**
 * Purge des lignes plus vieilles que `months` mois (durée de conservation du journal : paramètre OBLIGATOIRE,
 * aucune durée par défaut — [à adapter] selon la politique de conservation du projet). Lève si la base répond
 * en erreur (tâche planifiée : l'échec doit se voir).
 */
export async function purgeSubjectAccessLog(admin: SupabaseClient, months: number, now: Date = new Date()): Promise<number> {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error('purgeSubjectAccessLog : durée de conservation invalide (mois entier de 1 à 120).');
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
  const { data, error } = await admin.from(ACCESS_LOG_TABLE).delete().lt('created_at', cutoff.toISOString()).select('id');
  if (error) throw new Error(`${ACCESS_LOG_TABLE} : ${errorCode(error)}`);
  return (data ?? []).length;
}
