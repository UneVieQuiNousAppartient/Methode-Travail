#!/usr/bin/env node
/**
 * Garde-fou anti-derive du suivi de taches.
 *
 * Verifie deux choses, dans cet ordre :
 *
 *   1. Si du code est modifie (dossiers de la ligne « Dossiers de code » de
 *      la Fiche projet de CLAUDE.md) mais que SUIVI-TACHES.md ne l'est pas
 *      -> le travail partirait en production sans trace lisible.
 *   2. Si SUIVI-TACHES.md est modifie mais que son en-tete "Derniere mise
 *      a jour" ne porte pas la date du jour -> le fichier ment sur sa
 *      fraicheur, ce qui est pire qu'un fichier absent : on lui fait
 *      confiance.
 *
 * Deux modes :
 *   node scripts/check-suivi.js          fichiers modifies (git status).
 *                                         Code 0 = rien a signaler, 1 = avertissement
 *                                         (l'appelant demande confirmation, il ne bloque pas).
 *   node scripts/check-suivi.js --hook   fichiers indexes (git diff --cached), pour le
 *   (alias : --non-interactif)           hook .githooks/pre-commit : avertit sur stderr,
 *                                         ne pose aucune question, sort TOUJOURS en code 0.
 *
 * Exemple d'appel par un script de mise en ligne : VieSolution l'appelle depuis
 * scripts/push-common.bat (push-staging.bat / push-prod.bat), en mode par defaut.
 *
 * Volontairement sans dependance : node seul.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER_SUIVI = 'SUIVI-TACHES.md';

// Repertoires dont une modification constitue du "vrai travail" meritant
// une entree dans le suivi. Lus dans la Fiche projet de CLAUDE.md (ligne
// « Dossiers de code ») ; cette liste ne sert que si la fiche n'est pas
// remplie. package-lock.json, scripts de mise en ligne, etc. en sont exclus
// expres : une montee de dependance n'a pas besoin d'un paragraphe.
const CHEMINS_CODE_DEFAUT = ['src/', 'supabase/', '.claude/'];

const MODE_HOOK = process.argv.includes('--hook') || process.argv.includes('--non-interactif');

/** Dossiers de code declares dans la Fiche projet, ou null si non remplie. */
export function cheminsDeLaFiche(racine = RACINE) {
  let claude;
  try {
    claude = fs.readFileSync(path.join(racine, 'CLAUDE.md'), 'utf8');
  } catch {
    return null;
  }
  const ligne = claude
    .split('\n')
    .find((l) => /^\|\s*Dossiers de code\s*\|/.test(l));
  if (!ligne || ligne.includes('<à remplir')) return null;
  const valeur = ligne.split('|')[2] || '';
  const chemins = [...valeur.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .map((c) => (c.endsWith('/') ? c : `${c}/`));
  return chemins.length ? chemins : null;
}

const CHEMINS_CODE = cheminsDeLaFiche() || CHEMINS_CODE_DEFAUT;

const MOIS = [
  ['janvier', 'janv'],
  ['fevrier', 'févr', 'février', 'fevr'],
  ['mars'],
  ['avril'],
  ['mai'],
  ['juin'],
  ['juillet', 'juil'],
  ['aout', 'août'],
  ['septembre', 'sept'],
  ['octobre', 'oct'],
  ['novembre', 'nov'],
  ['decembre', 'déc', 'décembre', 'dec'],
];

function fichiersModifies() {
  if (MODE_HOOK) {
    // Hook pre-commit : seul ce qui part dans le commit compte.
    return execSync('git diff --cached --name-only --diff-filter=ACMRD', {
      cwd: RACINE,
      encoding: 'utf8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // -uall : sans lui, Git compacte un repertoire entierement non suivi en
  // une seule ligne ("?? src/"), ce qui rend l'avertissement inutilisable
  // — on veut nommer les fichiers, pas le dossier.
  const sortie = execSync('git status --porcelain -uall', {
    cwd: RACINE,
    encoding: 'utf8',
  });
  return sortie
    .split('\n')
    .filter(Boolean)
    // Format porcelain : 2 colonnes de statut, un espace, puis le chemin.
    // Les renommages s'ecrivent "ancien -> nouveau", on garde la destination.
    .map((ligne) => ligne.slice(3).trim().split(' -> ').pop())
    .map((chemin) => chemin.replace(/^"|"$/g, ''));
}

/** L'en-tete porte-t-il la date du jour ? Tolerant sur la forme du mois. */
function enteteEstAJour(contenu) {
  const ligne = contenu
    .split('\n')
    .find((l) => l.includes('Dernière mise à jour'));
  if (!ligne) return false;

  const maintenant = new Date();
  const jour = maintenant.getDate();
  const annee = maintenant.getFullYear();
  const variantesMois = MOIS[maintenant.getMonth()];

  const aLeJour = new RegExp(`(^|[^\\d])${jour}([^\\d]|$)`).test(ligne);
  const aLAnnee = ligne.includes(String(annee));
  const aLeMois = variantesMois.some((m) =>
    ligne.toLowerCase().includes(m.toLowerCase()),
  );

  // Format ISO accepte aussi (ex. 2026-10-15).
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jj = String(jour).padStart(2, '0');
  if (ligne.includes(`${annee}-${mm}-${jj}`)) return true;

  return aLeJour && aLeMois && aLAnnee;
}

function main() {
  let modifies;
  try {
    modifies = fichiersModifies();
  } catch {
    // Pas un depot Git, ou git indisponible : ce n'est pas a ce garde-fou
    // de faire echouer le push pour ca.
    process.exit(0);
  }

  const codeModifie = modifies.filter((f) =>
    CHEMINS_CODE.some((prefixe) => f.startsWith(prefixe)),
  );
  const suiviModifie = modifies.includes(FICHIER_SUIVI);

  const avertissements = [];

  if (codeModifie.length > 0 && !suiviModifie) {
    const apercu = codeModifie.slice(0, 5);
    const reste = codeModifie.length - apercu.length;
    avertissements.push(
      `${codeModifie.length} fichier(s) de code modifie(s) sans toucher a ${FICHIER_SUIVI} :`,
      ...apercu.map((f) => `    - ${f}`),
      ...(reste > 0 ? [`    ... et ${reste} autre(s)`] : []),
      '',
      '  Ce travail partirait en production sans trace lisible dans le suivi.',
    );
  }

  if (suiviModifie) {
    let contenu = '';
    try {
      contenu = fs.readFileSync(path.join(RACINE, FICHIER_SUIVI), 'utf8');
    } catch {
      process.exit(0);
    }
    if (!enteteEstAJour(contenu)) {
      avertissements.push(
        `L'en-tete "Derniere mise a jour" de ${FICHIER_SUIVI} ne porte pas la date du jour.`,
        '',
        '  Un suivi qui annonce une date perimee est pire qu\'un suivi absent :',
        '  on lui fait confiance. Mettez la ligne a jour avant de pousser.',
      );
    }
  }

  if (avertissements.length === 0) process.exit(0);

  // En hook : sur stderr, sans question, sans bloquer le commit.
  const ecrire = MODE_HOOK ? (l) => console.error(l) : (l) => console.log(l);
  ecrire('');
  ecrire(`[SUIVI] Verification du suivi de taches${MODE_HOOK ? ' (avertissement, commit non bloque)' : ''} :`);
  ecrire('');
  for (const ligne of avertissements) ecrire(`  ${ligne}`);
  ecrire('');
  process.exit(MODE_HOOK ? 0 : 1);
}

// Toujours lance : aucun fichier n'importe ce script (verifier-methode le lit comme texte).
// Une condition « execute, pas importe » le rendait muet quand il etait appele par un lien
// symbolique ou avec une autre casse de lecteur sous Windows (revue QA du 15 oct. 2026).
main();
