// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/health/heartbeat.ts, commit 508f19a (2026-10-30) ; généralisé : historique retiré, nom de table en constante exportée, code repris tel quel.
//
// Battement des tâches planifiées (table `public.cron_heartbeats`, migration 0111, service_role seulement). Un
// verrou de tâche supprimé en fin de passage ne garde rien : c'est ici que le tick note son dernier passage, et que
// le point de santé le relit (`verdictTick`).
//
// Jamais de donnée personnelle dans `last_error` : un message court et générique (`messageErreurTick`).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DernierTick } from './verdict';

export const HEARTBEAT_TABLE = 'cron_heartbeats';
export const NOM_TICK = 'tick';
const ERREUR_MAX = 200;

export interface PassageTick {
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  error: string | null;
}

/** Ligne à écrire (fonction pure). */
export function ligneBattement(nom: string, passage: PassageTick) {
  return {
    name: nom,
    last_started_at: passage.startedAt.toISOString(),
    last_finished_at: passage.finishedAt.toISOString(),
    last_ok: passage.ok,
    last_error: passage.ok ? null : (passage.error ?? 'erreur').slice(0, ERREUR_MAX),
  };
}

/**
 * Message court d'un passage en erreur, SANS donnée personnelle : le nom des règles en erreur et leur nombre
 * d'erreurs, ou le type d'exception — jamais son texte (qui peut citer un courriel ou un nom).
 */
export function messageErreurTick(input: {
  moteurIndisponible?: boolean;
  reglesEnErreur?: ReadonlyArray<readonly [string, number]>;
  exception?: unknown;
}): string | null {
  if (input.exception !== undefined) {
    const nom = input.exception instanceof Error ? input.exception.name : 'inconnue';
    return `exception : ${nom}`;
  }
  if (input.moteurIndisponible) return 'moteur d’automatisations indisponible';
  const regles = input.reglesEnErreur ?? [];
  if (regles.length > 0) return regles.map(([cle, n]) => `${cle} : ${n} erreur(s)`).join(' · ');
  return null;
}

/** Enregistre la fin d'un passage. Ne lève jamais : un battement en panne n'arrête pas le tick. */
export async function enregistrerBattement(admin: SupabaseClient, nom: string, passage: PassageTick): Promise<boolean> {
  try {
    const { error } = await admin.from(HEARTBEAT_TABLE).upsert(ligneBattement(nom, passage), { onConflict: 'name' });
    if (error) {
      console.error('[heartbeat] écriture en échec', error.code ?? 'inconnu');
      return false;
    }
    return true;
  } catch (error) {
    console.error('[heartbeat] écriture en échec', error instanceof Error ? error.name : 'inconnu');
    return false;
  }
}

/**
 * Dernier passage du tick, ou `null` si aucune ligne (jamais tourné depuis la migration). Lève si la lecture
 * échoue : la route de santé le transforme en ligne « vérification impossible » (`avecDelai` + repli), jamais en 500.
 */
export async function lireDernierTick(admin: SupabaseClient, nom: string = NOM_TICK): Promise<DernierTick | null> {
  const { data, error } = await admin
    .from(HEARTBEAT_TABLE)
    .select('last_finished_at, last_ok')
    .eq('name', nom)
    .maybeSingle();
  if (error) throw new Error(`cron_heartbeats: ${error.code ?? 'erreur'}`);
  if (!data) return null;
  const row = data as { last_finished_at?: unknown; last_ok?: unknown };
  return {
    lastFinishedAt: typeof row.last_finished_at === 'string' ? row.last_finished_at : null,
    lastOk: typeof row.last_ok === 'boolean' ? row.last_ok : null,
  };
}
