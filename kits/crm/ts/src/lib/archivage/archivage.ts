// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/archivage/archivage.ts, commit 508f19a (2026-10-30) ; généralisé : leads seulement (règles des rendez-vous retirées : peutArchiverRendezVous, STATUT_RENDEZ_VOUS_ANNULE), provenances qui ne désarchivent pas en paramètre, libellés [à adapter], historique retiré.
//
// Archivage des leads. Un élément archivé (`archived_at` renseigné, migration 0110) est MASQUÉ du travail courant
// (listes, recherche, tableau du jour, compteurs du menu, relances, automatisations), jamais effacé : l'effacement
// Loi 25 reste un geste à part. Les statistiques, l'export, le journal d'accès et l'effacement voient toujours les
// archivés.
//
// Fonctions pures (aucun accès base, aucun import serveur), testées dans `archivage.test.ts`. Le test de garde
// `garde-archivage.test.ts` vérifie que chaque lecture de `leads` des fichiers surveillés passe par ce filtre
// (`applyArchived` ou `sansArchives`) ou figure dans sa liste d'exceptions, avec la raison.

/** `exclude` (défaut) : sans les archivés ; `only` : les archivés seulement ; `all` : tout. */
export const ARCHIVED_MODES = ['exclude', 'only', 'all'] as const;
export type ArchivedMode = (typeof ARCHIVED_MODES)[number];

/** Valeur lue d'une adresse ou d'un corps : toute valeur inconnue (ou absente) vaut `exclude`. */
export function parseArchivedMode(value: unknown): ArchivedMode {
  return typeof value === 'string' && (ARCHIVED_MODES as readonly string[]).includes(value)
    ? (value as ArchivedMode)
    : 'exclude';
}

/** Forme minimale d'une requête PostgREST utilisée par le filtre (supabase-js la respecte). */
export interface ArchivableQuery<Q> {
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: null): Q;
}

/**
 * Applique le mode d'archivage à une requête sur `leads`. Un mode inconnu vaut `exclude` : un oubli ou une valeur
 * trafiquée ne fait jamais réapparaître les archivés dans une liste de travail.
 */
export function applyArchived<Q>(query: Q, mode: unknown = 'exclude'): Q {
  const q = query as unknown as ArchivableQuery<Q>;
  const parsed = parseArchivedMode(mode);
  if (parsed === 'all') return query;
  if (parsed === 'only') return q.not('archived_at', 'is', null);
  return q.is('archived_at', null);
}

/** Retire les lignes archivées d'une liste déjà chargée (ligne sans `archived_at` = active). */
export function sansArchives<T extends { archived_at?: string | null }>(rows: readonly T[] = []): T[] {
  return rows.filter((row) => !row?.archived_at);
}

/**
 * [à adapter] Provenances qui ne désarchivent pas : une référence saisie par un partenaire et un import ne viennent
 * pas de la personne elle-même.
 */
export const SOURCES_SANS_DESARCHIVAGE: readonly string[] = ['referral', 'import'];

/**
 * Un lead archivé qui revient par un formulaire rempli PAR LA PERSONNE est désarchivé. Une provenance de
 * `sourcesSansDesarchivage` (référence, import…) ne le fait pas revenir.
 */
export function doitDesarchiver(
  lead: { archived_at?: string | null } | null | undefined,
  source?: string | null,
  sourcesSansDesarchivage: readonly string[] = SOURCES_SANS_DESARCHIVAGE,
): boolean {
  if (source && sourcesSansDesarchivage.includes(source)) return false;
  return Boolean(lead?.archived_at);
}

/** [à adapter] Titres de l'activité écrite à l'historique du lead. */
export const ARCHIVAGE_TITRES = {
  archive: 'Lead archivé',
  desarchiveFormulaire: 'Lead désarchivé : nouveau formulaire rempli',
  desarchive: 'Lead désarchivé',
} as const;

/** Métadonnées de l'activité « système » écrite à l'historique du lead (pas de type dédié en base). */
export type ArchivageSource = 'admin' | 'formulaire';
export function activiteArchivage(archive: boolean, source: ArchivageSource): {
  title: string;
  metadata: { action: 'archived' | 'unarchived'; source: ArchivageSource };
} {
  const title = archive
    ? ARCHIVAGE_TITRES.archive
    : source === 'formulaire'
      ? ARCHIVAGE_TITRES.desarchiveFormulaire
      : ARCHIVAGE_TITRES.desarchive;
  return { title, metadata: { action: archive ? 'archived' : 'unarchived', source } };
}
