#!/usr/bin/env node
/**
 * Garde-fou anti-derive du suivi de taches.
 *
 * Appele par scripts/push-common.bat avant le commit automatique.
 * Verifie deux choses, dans cet ordre :
 *
 *   1. Si du code est modifie (src/, supabase/, .claude/) mais que
 *      SUIVI-TACHES.md ne l'est pas -> le travail partirait en production
 *      sans laisser de trace lisible.
 *   2. Si SUIVI-TACHES.md est modifie mais que son en-tete "Derniere mise
 *      a jour" ne porte pas la date du jour -> le fichier ment sur sa
 *      fraicheur, ce qui est pire qu'un fichier absent : on lui fait
 *      confiance.
 *
 * Code de sortie 0 = rien a signaler. 1 = avertissement (le script
 * appelant demande alors confirmation, il ne bloque pas).
 *
 * Volontairement sans dependance : node seul, comme
 * generate-commit-message.js.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER_SUIVI = 'SUIVI-TACHES.md';

// Repertoires dont une modification constitue du "vrai travail" mericant
// une entree dans le suivi. package-lock.json, *.bat, etc. en sont exclus
// exprès : une bump de dependance n'a pas besoin d'un paragraphe.
const CHEMINS_CODE = ['src/', 'supabase/', '.claude/'];

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

  console.log('');
  console.log('[SUIVI] Verification du suivi de taches :');
  console.log('');
  for (const ligne of avertissements) console.log(`  ${ligne}`);
  console.log('');
  process.exit(1);
}

main();
