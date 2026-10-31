// Kit CRM TS (methode-travail) — origine : écrit pour le kit (exemple de listes de travail sur lequel tourne la garde d'archivage `garde-archivage.test.ts` ; à remplacer par les vraies listes du projet).
//
// EXEMPLE : deux lectures de `leads` qui servent le travail courant, donc sans les archivés.
// - `listerLeadsActifs` filtre côté base (`applyArchived`, mode `exclude` par défaut) ;
// - `compterParEtape` charge des lignes puis les filtre côté serveur (`sansArchives`).
// Retirer l'un ou l'autre filtre fait échouer la garde : c'est ce qui la prouve.
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyArchived, sansArchives } from './archivage';

export interface LeadListe {
  id: string;
  stage: string | null;
  archived_at: string | null;
}

/** Liste de travail : leads non archivés (ou le mode demandé : `only`, `all`), plus récents d'abord. */
export async function listerLeadsActifs(db: SupabaseClient, mode: unknown = 'exclude'): Promise<LeadListe[]> {
  const { data, error } = await applyArchived(db.from('leads').select('id, stage, archived_at'), mode).order('created_at', {
    ascending: false,
  });
  if (error) throw new Error(`leads: ${error.code ?? 'erreur'}`);
  return (data ?? []) as LeadListe[];
}

/** Compteurs du menu : nombre de leads actifs par étape. */
export async function compterParEtape(db: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await db.from('leads').select('id, stage, archived_at');
  if (error) throw new Error(`leads: ${error.code ?? 'erreur'}`);
  const compte: Record<string, number> = {};
  for (const lead of sansArchives((data ?? []) as LeadListe[])) {
    const etape = lead.stage ?? 'sans-etape';
    compte[etape] = (compte[etape] ?? 0) + 1;
  }
  return compte;
}
