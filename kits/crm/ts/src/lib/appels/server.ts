// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/appels/server.ts, commit df3ff89 (2026-10-30) ; généralisé : contrôle d'accès INJECTÉ (`AccesAppels` : périmètre et auteur fournis par le projet) au lieu de la fonction de périmètre du projet source, configuration et noms de tables en paramètres, auteur transmis à la fonction SQL, lecture du corps de requête (`lireSaisieAppel`) ajoutée, sans `server-only` (le kit n'en dépend pas : n'importer que côté serveur).
//
// Poste d'appel — lectures et écriture côté SERVEUR. Le client est `service_role` : la RLS ne protège rien ici, le
// périmètre de l'acteur est posé sur CHAQUE requête, et la fonction SQL le revérifie (lead verrouillé).
// Les règles sont dans ./regles (pures, testées) ; l'écriture passe par `public.record_call_result`
// (supabase/migrations/0112_call_result.sql), en une transaction.
// Aucune donnée de prospect dans les journaux ni dans les messages d'erreur : seuls des messages techniques.
//
// Colonnes lues [à adapter] : leads(id, first_name, last_name, phone, email, status, owner_id, archived_at) —
// `archived_at` vient de 0110 (L11) ; tasks(id, title, due_at, status, lead_id) ; activities(type, title, author,
// occurred_at). La relation `tasks.lead_id → leads.id` doit exister (jointure `leads!inner`).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bilanDuJour,
  bornesDuJour,
  classerFile,
  detailsAppel,
  DUREE_MAX_SECONDES,
  instantLocalIso,
  NOTES_MAX,
  planResultat,
  PREFIXE_TITRE,
  prochainJourOuvrable,
  type ActiviteBilan,
  type ConfigAppels,
  type PlanAppel,
} from './regles';

/** Erreur montrable telle quelle (message générique, sans donnée). */
export class RefusAppel extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const SQL_ABSENT = "La fonction du poste d'appel n'est pas encore installée (supabase/migrations/0112_call_result.sql).";

/** Périmètre d'un acteur : toute l'équipe, ou seulement les fiches dont il est responsable (`owner_id`). */
export type PerimetreAppels = { tout: true } | { responsable: string };

/**
 * Contrôle d'accès FOURNI PAR LE PROJET (le kit ne sait pas qui est responsable de quoi).
 * Exemple avec le socle du lot 2 : `perimetre: (m: TeamMember) => (hasRole(m.role, 'gestionnaire') ? { tout: true } :
 * { responsable: m.userId })`, `auteur: (m) => m.email` [à adapter : `owner_id` doit contenir le même identifiant].
 */
export interface AccesAppels<A> {
  perimetre(acteur: A): PerimetreAppels;
  /** Auteur écrit sur l'activité et lu par le bilan (nom ou identifiant ; jamais un secret). */
  auteur(acteur: A): string;
}

export interface TablesAppels {
  leads: string;
  taches: string;
  activites: string;
}

export const TABLES_APPELS: TablesAppels = { leads: 'leads', taches: 'tasks', activites: 'activities' }; // [à adapter]

export interface OptionsAppels<A> {
  config: ConfigAppels;
  acces: AccesAppels<A>;
  tables?: TablesAppels;
}

type DbRow = Record<string, unknown>;

const related = (value: unknown): DbRow | null => {
  const first = Array.isArray(value) ? value[0] : value;
  return first !== null && typeof first === 'object' ? (first as DbRow) : null;
};
const texte = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * Auteur des activités, normalisé UNE fois (espaces retirés, 200 caractères au plus, `equipe` si vide — même repli
 * que la fonction SQL) : la même valeur est écrite par la confirmation et cherchée par le bilan.
 */
export function auteurNormalise<A>(options: OptionsAppels<A>, acteur: A): string {
  return String(options.acces.auteur(acteur) ?? '').trim().slice(0, 200).trim() || 'equipe';
}

/** Le périmètre doit être un des deux cas, avec un identifiant non vide : sinon refus (jamais « tout » par défaut). */
function perimetreDe<A>(options: OptionsAppels<A>, acteur: A): PerimetreAppels {
  const p = options.acces.perimetre(acteur) as Partial<{ tout: unknown; responsable: unknown }> | null;
  if (p && p.tout === true) return { tout: true };
  if (p && typeof p.responsable === 'string' && p.responsable.trim()) return { responsable: p.responsable };
  throw new RefusAppel('Accès refusé.', 403);
}

// --- Saisie -----------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SaisieAppel {
  leadId: string;
  taskId: string;
  resultat: unknown;
  notes?: unknown;
  rappelLe?: unknown;
  dureeSecondes?: unknown;
}

/**
 * Corps d'un POST du poste d'appel → saisie, ou null (requête invalide). Identifiants UUID dans le CORPS, jamais
 * dans l'adresse. Le résultat, la date et la durée sont vérifiés plus loin (plan recalculé côté serveur).
 */
export function lireSaisieAppel(body: unknown): (SaisieAppel & { confirm: boolean }) | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const leadId = typeof b.leadId === 'string' ? b.leadId : '';
  const taskId = typeof b.taskId === 'string' ? b.taskId : '';
  if (!UUID.test(leadId) || !UUID.test(taskId)) return null;
  if (b.notes !== undefined && b.notes !== null && (typeof b.notes !== 'string' || b.notes.length > NOTES_MAX * 3)) return null;
  return {
    leadId,
    taskId,
    resultat: b.resultat,
    notes: b.notes,
    rappelLe: b.rappelLe,
    dureeSecondes: b.dureeSecondes,
    confirm: b.confirm === true,
  };
}

// --- File et bilan ----------------------------------------------------------------------------

export interface ElementFile {
  taskId: string;
  titre: string;
  dueAt: string | null;
  leadId: string;
  prenom: string | null;
  nom: string | null;
  telephone: string | null;
  courriel: string | null;
  statut: string;
}

const LIMITE_FILE = 500;

/**
 * File du jour de l'acteur : tâches OUVERTES liées à un lead de son périmètre, lead non archivé, classées en
 * retard / du jour / à venir. Un membre limité à ses fiches ne voit que les tâches des leads dont il est responsable.
 */
export async function lireFile<A>(db: SupabaseClient, acteur: A, options: OptionsAppels<A>, maintenant = new Date()) {
  const t = options.tables ?? TABLES_APPELS;
  const perimetre = perimetreDe(options, acteur);
  let query = db
    .from(t.taches)
    .select(`id, title, due_at, status, lead_id, ${t.leads}!inner(id, first_name, last_name, phone, email, status, owner_id, archived_at)`)
    .eq('status', 'open')
    .is(`${t.leads}.archived_at`, null);
  if ('responsable' in perimetre) query = query.eq(`${t.leads}.owner_id`, perimetre.responsable);
  const { data, error } = await query.order('due_at', { ascending: true, nullsFirst: false }).limit(LIMITE_FILE);
  if (error) throw new Error(`${t.taches}: ${error.code ?? 'erreur'}`);

  const elements: ElementFile[] = [];
  for (const row of (data ?? []) as unknown as DbRow[]) {
    const lead = related(row[t.leads]);
    if (!lead) continue;
    elements.push({
      taskId: String(row.id),
      titre: String(row.title ?? ''),
      dueAt: texte(row.due_at),
      leadId: String(lead.id),
      prenom: texte(lead.first_name),
      nom: texte(lead.last_name),
      telephone: texte(lead.phone),
      courriel: texte(lead.email),
      statut: String(lead.status ?? ''),
    });
  }
  const f = classerFile(
    elements.map((element) => ({ due_at: element.dueAt, element })),
    maintenant,
    options.config.fuseau,
  );
  const net = (x: { element: ElementFile }) => x.element;
  return { enRetard: f.enRetard.map(net), duJour: f.duJour.map(net), aVenir: f.aVenir.map(net) };
}

/** Bilan du jour (local) des appels du poste faits par l'acteur lui-même. */
export async function lireBilan<A>(db: SupabaseClient, acteur: A, options: OptionsAppels<A>, maintenant = new Date()) {
  const t = options.tables ?? TABLES_APPELS;
  perimetreDe(options, acteur);
  const auteur = auteurNormalise(options, acteur);
  const { debut } = bornesDuJour(maintenant, options.config.fuseau);
  const { data, error } = await db
    .from(t.activites)
    .select('type, title, author, occurred_at')
    .eq('type', 'appel')
    .eq('author', auteur)
    .ilike('title', `${PREFIXE_TITRE.replace(/[\\%_]/g, '\\$&')}%`)
    .gte('occurred_at', new Date(debut).toISOString())
    .limit(2000);
  if (error) throw new Error(`${t.activites}: ${error.code ?? 'erreur'}`);
  return bilanDuJour((data ?? []) as ActiviteBilan[], maintenant, auteur, options.config);
}

// --- Aperçu et confirmation -------------------------------------------------------------------

/** Tâche ouverte du lead, dans le périmètre de l'acteur, lead non archivé ; RefusAppel 404 (introuvable, hors périmètre OU archivé) / 409. */
async function lireTache<A>(db: SupabaseClient, acteur: A, options: OptionsAppels<A>, leadId: string, taskId: string) {
  const t = options.tables ?? TABLES_APPELS;
  const perimetre = perimetreDe(options, acteur);
  const { data, error } = await db
    .from(t.taches)
    .select(`id, lead_id, status, ${t.leads}!inner(id, first_name, last_name, status, owner_id, archived_at)`)
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw new Error(`${t.taches}: ${error.code ?? 'erreur'}`);
  const row = (data ?? null) as DbRow | null;
  const lead = row ? related(row[t.leads]) : null;
  // Hors périmètre ou archivé (L11, 0110) : même réponse qu'introuvable (rien n'est révélé).
  if (!row || !lead || lead.archived_at != null || ('responsable' in perimetre && lead.owner_id !== perimetre.responsable)) {
    throw new RefusAppel('Tâche introuvable.', 404);
  }
  if (row.status !== 'open') throw new RefusAppel('Cette tâche est déjà terminée.', 409);
  return {
    perimetre,
    statut: String(lead.status ?? ''),
    nom: [texte(lead.first_name), texte(lead.last_name)].filter(Boolean).join(' '),
  };
}

/** Durée saisie : entier de 0 à 4 h, sinon RefusAppel 400 ; absente → null. */
function duree(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > DUREE_MAX_SECONDES) {
    throw new RefusAppel('Durée invalide.');
  }
  return value;
}

/** Plan recalculé côté serveur : étape et nom lus en base, jamais fournis par le navigateur. */
async function calculerPlan<A>(db: SupabaseClient, acteur: A, options: OptionsAppels<A>, saisie: SaisieAppel, maintenant: Date) {
  const { config } = options;
  const { perimetre, statut, nom } = await lireTache(db, acteur, options, saisie.leadId, saisie.taskId);
  const plan = planResultat(
    saisie.resultat,
    {
      statut,
      nom,
      rappelLe: typeof saisie.rappelLe === 'string' ? saisie.rappelLe : null,
      jourOuvrable: prochainJourOuvrable(maintenant, config),
    },
    config,
  );
  if ('erreur' in plan) throw new RefusAppel(plan.erreur);
  const dueIso = plan.suivi ? instantLocalIso(plan.suivi.jour, config.heureSuivi, config.fuseau) : null;
  if (dueIso) {
    const due = Date.parse(dueIso);
    if (due < maintenant.getTime() - 86_400_000 || due > maintenant.getTime() + 366 * 86_400_000) {
      throw new RefusAppel('Choisissez une date de rappel dans les 12 prochains mois.');
    }
  }
  const details = detailsAppel(saisie.notes, duree(saisie.dureeSecondes));
  return { perimetre, plan, dueIso, details };
}

const resume = (p: PlanAppel, dueIso: string | null) => ({
  resultat: p.resultat,
  titre: p.titre,
  issue: p.issue,
  statut: p.statut,
  raisonPerte: p.raisonPerte,
  suivi: p.suivi ? { ...p.suivi, dueAt: dueIso } : null,
});

/** Aperçu : le plan lisible, RIEN n'est écrit. */
export async function apercuAppel<A>(db: SupabaseClient, acteur: A, options: OptionsAppels<A>, saisie: SaisieAppel, maintenant = new Date()) {
  const { plan, dueIso } = await calculerPlan(db, acteur, options, saisie, maintenant);
  return { apercu: plan.apercu, plan: resume(plan, dueIso) };
}

const fonctionAbsente = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /could not find the function|record_call_result[^ ]* does not exist/i.test(e.message ?? '');

/** Confirmation : plan recalculé, appliqué en une transaction par `record_call_result` (qui revérifie le périmètre). */
export async function confirmerAppel<A>(
  db: SupabaseClient,
  acteur: A,
  options: OptionsAppels<A>,
  saisie: SaisieAppel,
  maintenant = new Date(),
) {
  const { perimetre, plan, dueIso, details } = await calculerPlan(db, acteur, options, saisie, maintenant);
  const { data, error } = await db.rpc('record_call_result', {
    p_actor_id: 'responsable' in perimetre ? perimetre.responsable : null,
    p_actor_sees_all: 'tout' in perimetre,
    p_author: auteurNormalise(options, acteur),
    p_lead_id: saisie.leadId,
    p_task_id: saisie.taskId,
    p_outcome: plan.issue,
    p_title: plan.titre,
    p_details: details,
    p_status: plan.statut,
    p_lost_reason: plan.raisonPerte,
    p_followup_title: plan.suivi?.titre ?? null,
    p_followup_due: dueIso,
  });
  if (error) {
    if (fonctionAbsente(error)) throw new RefusAppel(SQL_ABSENT, 503);
    if (/déjà terminée/.test(error.message ?? '')) throw new RefusAppel('Cette tâche est déjà terminée.', 409);
    if (/lead introuvable/.test(error.message ?? '')) throw new RefusAppel('Tâche introuvable.', 404);
    throw new Error(`record_call_result: ${error.code ?? 'erreur'}`);
  }
  return { apercu: plan.apercu, plan: resume(plan, dueIso), resultat: data ?? null };
}
