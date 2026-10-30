// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/archivage/garde-archivage.test.ts, commit 508f19a (2026-10-30) ; généralisé : fichiers surveillés en paramètre (ARCHIVAGE_FICHIERS_LISTES) au lieu de tout src/, refus par défaut (une lecture non filtrée doit être une exception motivée), `sansArchives` reconnu comme filtre, listes du projet source retirées.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde de l'archivage. Chaque lecture d'une table archivable dans les fichiers surveillés est jugée AU NIVEAU DE LA
 * FONCTION (déclaration de premier niveau qui la contient) :
 * - par défaut, le corps de la fonction applique le filtre : `applyArchived(`, `sansArchives(` ou
 *   `.is('archived_at', null)` (un simple `archived_at` dans un `select` ne compte pas) ;
 * - sinon, la fonction figure dans `EXCEPTIONS`, avec la raison pour laquelle les archivés doivent rester visibles.
 * Une nouvelle lecture non filtrée et non déclarée fait échouer le test : on choisit, on ne l'oublie pas.
 * Lectures repérées : `from('<table>')` et `head('<table>')` (lecture indirecte par une petite fonction locale).
 *
 * [à adapter] À l'installation : remplacer l'exemple par les fichiers du projet qui lisent `leads` (listes,
 * recherche, tableau du jour, compteurs, relances, automatisations, export, statistiques…), puis classer chaque
 * lecture non filtrée dans `EXCEPTIONS`.
 */

/** [à adapter] Fichiers à surveiller, relatifs à la racine du projet. */
export const ARCHIVAGE_FICHIERS_LISTES: readonly string[] = ['src/lib/archivage/exemple-liste.ts'];

/** [à adapter] Tables archivables (migration 0110 ; ajouter `appointments` si le projet archive les rendez-vous). */
export const ARCHIVAGE_TABLES: readonly string[] = ['leads'];

/**
 * [à adapter] Lectures qui doivent voir les archivés, clé `fichier#fonction` (ou `fichier#*`), avec la raison.
 * Raisons typiques : statistiques (les archivés comptent toujours) ; export, effacement ou désabonnement Loi 25 ;
 * dossier précis lu par son identifiant (la fiche d'un archivé reste ouvrable) ; dédoublonnage d'un formulaire.
 */
export const EXCEPTIONS: Readonly<Record<string, string>> = {};

const FILTRE = /applyArchived\(|sansArchives\(|\.is\(\s*['"]archived_at['"]\s*,\s*null\s*\)/;
const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+(\w+)|(?:const|let)\s+(\w+))/;
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Lecture {
  fichier: string;
  fonction: string;
  cle: string;
  corps: string;
}

/** Lectures d'un texte source, rattachées à leur déclaration de premier niveau. */
export function lecturesDe(fichier: string, source: string, tables: readonly string[] = ARCHIVAGE_TABLES): Lecture[] {
  const lecture = new RegExp(`\\b(?:from|head)\\(\\s*['"](?:${tables.map(echapper).join('|')})['"]\\s*\\)`);
  const lignes = source.split('\n');
  const declarations: Array<{ ligne: number; nom: string }> = [];
  lignes.forEach((ligne, index) => {
    const match = DECLARATION.exec(ligne);
    if (match) declarations.push({ ligne: index, nom: match[1] ?? match[2] });
  });
  const lectures: Lecture[] = [];
  lignes.forEach((ligne, index) => {
    // Commentaires ignorés (une ligne de documentation qui cite `from('leads')` ne lit rien).
    if (/^\s*(\*|\/\/|\/\*)/.test(ligne)) return;
    if (!lecture.test(ligne)) return;
    const debut = [...declarations].reverse().find((d) => d.ligne <= index);
    const suivante = declarations.find((d) => d.ligne > index);
    const fonction = debut?.nom ?? '(module)';
    const corps = lignes.slice(debut?.ligne ?? 0, suivante?.ligne ?? lignes.length).join('\n');
    lectures.push({ fichier, fonction, cle: `${fichier}#${fonction}`, corps });
  });
  return lectures;
}

/** Verdict d'une lecture : `null` si conforme, sinon le message d'erreur. */
export function jugerLecture(lecture: Lecture, exceptions: Readonly<Record<string, string>> = EXCEPTIONS): string | null {
  if (FILTRE.test(lecture.corps)) return null;
  const raison = exceptions[lecture.cle] ?? exceptions[`${lecture.fichier}#*`];
  if (raison && raison.trim().length > 10) return null;
  return `${lecture.cle} : lit une table archivable sans filtre d’archivage ni exception (ajouter applyArchived / sansArchives, ou une exception avec sa raison)`;
}

describe('garde de l’archivage', () => {
  const racine = process.cwd();
  const lectures = ARCHIVAGE_FICHIERS_LISTES.flatMap((fichier) =>
    existsSync(join(racine, fichier)) ? lecturesDe(fichier, readFileSync(join(racine, fichier), 'utf8')) : [],
  );

  it('chaque fichier surveillé existe et contient au moins une lecture (le motif n’est pas cassé)', () => {
    expect(ARCHIVAGE_FICHIERS_LISTES.filter((f) => !existsSync(join(racine, f)))).toEqual([]);
    for (const fichier of ARCHIVAGE_FICHIERS_LISTES) {
      expect(lectures.some((l) => l.fichier === fichier), fichier).toBe(true);
    }
  });

  it('chaque lecture est filtrée ou déclarée en exception', () => {
    const erreurs = lectures.map((l) => jugerLecture(l)).filter((e): e is string => e !== null);
    expect([...new Set(erreurs)]).toEqual([]);
  });

  it('aucune exception morte (chaque clé correspond à une lecture réelle)', () => {
    const cles = new Set(lectures.flatMap((l) => [l.cle, `${l.fichier}#*`]));
    expect(Object.keys(EXCEPTIONS).filter((cle) => !cles.has(cle))).toEqual([]);
  });

  it('la garde refuse : une liste qui oublie sansArchives, une lecture sans filtre, une exception sans raison', () => {
    const oubli = lecturesDe('src/x.ts', [
      'export async function compter(db) {',
      "  const { data } = await db.from('leads').select('id, archived_at');",
      '  return (data ?? []).length;',
      '}',
    ].join('\n'));
    expect(oubli).toHaveLength(1);
    expect(jugerLecture(oubli[0])).toMatch(/sans filtre d’archivage/);
    expect(jugerLecture(oubli[0], { 'src/x.ts#compter': 'court' })).toMatch(/sans filtre/);
    expect(jugerLecture(oubli[0], { 'src/x.ts#compter': 'statistiques : les archivés comptent toujours' })).toBeNull();

    const fleche = lecturesDe('src/y.ts', ['export const lireLeads = async (db) =>', "  db.from('leads').select('*');"].join('\n'));
    expect(fleche[0].cle).toBe('src/y.ts#lireLeads');
    expect(jugerLecture(fleche[0])).not.toBeNull();

    const indirecte = lecturesDe('src/z.ts', ['function compter(db) {', "  return head('leads');", '}'].join('\n'));
    expect(indirecte).toHaveLength(1);
    expect(lecturesDe('src/z.ts', "// db.from('leads')")).toHaveLength(0);
    expect(lecturesDe('src/z.ts', "db.from('appointments')")).toHaveLength(0);
    expect(lecturesDe('src/z.ts', "db.from('appointments')", ['leads', 'appointments'])).toHaveLength(1);
  });
});
