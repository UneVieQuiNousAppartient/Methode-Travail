#!/usr/bin/env node
// Verrou qa-agent (méthode 1.7.0, repris de VieSolution-CSF, scripts/check-qa-trace.mjs, 14 nov. 2026, suivi 14l) —
// lancé par .githooks/pre-commit, BLOQUANT dans une session Claude.
// Un commit de 2 fichiers ou plus hors .md (ou d'un seul fichier sensible : ligne « Chemins sensibles » de la Fiche
// projet de CLAUDE.md, plus les contrôles eux-mêmes, la CI et package.json) est refusé si un de ses fichiers n'a pas l'empreinte notée par qa-agent dans .git/qa-verifie.json
// (écrite par scripts/hook-qa-trace.mjs à la fin d'un qa-agent « VERDICT QA : OK »). Un fichier modifié après
// le passage de qa-agent n'est plus couvert : un court qa-agent sur ce fichier suffit.
// Hors session Claude (variable CLAUDECODE absente : une personne à son poste), avertit seulement.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lireConfig, nonCouverts, qaRequis } from "./lib-controles.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

// Un seul appel : --raw donne l'empreinte de l'index de chaque fichier (« :100644 100644 <avant> <après> M\0chemin »).
const indexes = {};
const morceaux = git(["diff", "--cached", "--raw", "-z", "--no-renames", "--no-abbrev"]).split("\0").filter(Boolean);
for (let i = 0; i < morceaux.length; i += 2) {
    const [, , , apres, statut] = morceaux[i].split(" ");
    indexes[morceaux[i + 1]] = statut === "D" ? "supprime" : apres;
}
const cfg = lireConfig(git(["rev-parse", "--show-toplevel"]).trim());
if (!qaRequis(Object.keys(indexes), cfg)) process.exit(0);

let trace = null;
try {
    trace = JSON.parse(readFileSync(join(git(["rev-parse", "--absolute-git-dir"]).trim(), "qa-verifie.json"), "utf8")).fichiers;
} catch {
    // pas de trace : tout est non couvert
}
const manquants = nonCouverts(indexes, trace);
if (manquants.length === 0) process.exit(0);

const bloque = Boolean(process.env.CLAUDECODE);
console.error(`
[qa-agent] ${bloque ? "Commit refusé" : "Avertissement"} : ${manquants.length} fichier(s) sans vérification qa-agent à jour :
${manquants.slice(0, 8).map((p) => `    - ${p}`).join("\n")}${manquants.length > 8 ? `\n    … et ${manquants.length - 8} autre(s)` : ""}

  Quoi faire : lancer l'agent qa-agent (Opus) sur ce diff ; son rapport doit finir par « VERDICT QA : OK ».
  La trace est écrite automatiquement à la fin de qa-agent (.git/qa-verifie.json) ; un fichier modifié
  après coup demande un nouveau passage, court, sur ce fichier. Règle : .claude/rules/agent-workflow.md.
`);
process.exit(bloque ? 1 : 0);
