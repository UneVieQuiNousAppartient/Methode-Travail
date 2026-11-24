#!/usr/bin/env node
// Contrôles de livraison d'une PR (méthode 1.7.0, repris de VieSolution-CSF, scripts/check-livraison-pr.mjs,
// 14 nov. 2026, suivi 14l) — lancé en CI (job qualité, PR seulement). Dossiers lus dans la Fiche projet de CLAUDE.md.
//   4. BLOQUANT : une PR qui touche les « Dossiers de code » (hors .md) doit modifier SUIVI-TACHES.md (en-tête « Dernière mise à
//      jour » changé par rapport à la base) et docs/ETAT-ACTUEL.md (suivi-taches.md). Bloqué à la PR, pas au
//      commit : les commits intermédiaires sans suivi sont normaux ; la PR est le moment de la livraison.
//   3. Avertissement : une page d'essai de maquette (maquette-* dans le code) doit être supprimée avant la PR.
//   Seuil des documents (décision de Camille, 14 nov. 2026) : avertissement si un gros chantier (> 800 lignes de code
//      ajoutées) ou un nouvel écran (« Routes publiques ») arrive sans IMPLEMENTATION-PLAN.md dans docs/projets/.
// Usage : node scripts/check-livraison-pr.mjs [--base <ref>]   (défaut : origin/main)
//         node scripts/check-livraison-pr.mjs --maquettes       (pre-commit : avertit seulement)
import { execFileSync } from "node:child_process";
import { enteteSuivi, estCodeCompte, lireConfig, manquesLivraison, nouveauxEcrans, pagesMaquette } from "./lib-controles.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const enCI = Boolean(process.env.GITHUB_ACTIONS);
const cfg = lireConfig(git(["rev-parse", "--show-toplevel"]).trim());
const avertir = (m) => console.log(enCI ? `::warning::${m}` : `[livraison] Avertissement : ${m}`);

if (process.argv.includes("--maquettes")) {
    const pages = pagesMaquette(git(["ls-files", "--cached"]).split("\n"), cfg);
    if (pages.length) avertir(`page(s) d'essai de maquette à supprimer avant la PR : ${pages.join(", ")}`);
    process.exit(0);
}

const i = process.argv.indexOf("--base");
const base = i > 0 ? process.argv[i + 1] : "origin/main";
// diff à trois points : ce que la branche apporte depuis qu'elle a quitté la base (en CI, HEAD^1...HEAD = la PR)
const liste = (filtre) => git(["diff", "--name-only", `--diff-filter=${filtre}`, `${base}...HEAD`]).split("\n").filter(Boolean);
const diff = liste("ACMRD");

// stderr ignoré : un suivi absent de la base est un cas prévu, pas une erreur à afficher en CI
const lireEntete = (ref) => {
    try {
        return enteteSuivi(execFileSync("git", ["show", `${ref}:SUIVI-TACHES.md`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch {
        return null;
    }
};
const manques = manquesLivraison(diff, { base: lireEntete(base), tete: lireEntete("HEAD") }, cfg);

const pages = pagesMaquette(git(["ls-files"]).split("\n"), cfg);
if (pages.length) avertir(`page(s) d'essai de maquette encore présente(s), à supprimer : ${pages.join(", ")}`);

// lignes ajoutées dans les fichiers de code comptés (mêmes règles que check-taille-diff.mjs)
const ajoutees = git(["diff", "--numstat", `${base}...HEAD`]).split("\n").map((l) => l.split("\t"))
    .filter(([, , p]) => p && estCodeCompte(p, cfg)).reduce((n, [a]) => n + (Number(a) || 0), 0);
const ecrans = nouveauxEcrans(liste("A"), cfg);
const plan = diff.some((p) => /^docs\/projets\/[^/]+\/IMPLEMENTATION-PLAN\.md$/.test(p));
if ((ajoutees > 800 || ecrans.length) && !plan) {
    avertir(`${ecrans.length ? `nouvel écran (${ecrans.join(", ")})` : `${ajoutees} lignes de code ajoutées`} sans ` +
        "IMPLEMENTATION-PLAN.md dans docs/projets/ : chantier > 500 k ou nouvel écran → BRIEF + IMPLEMENTATION-PLAN " +
        "(skill nouveau-projet, version courte) validés avant le code (agent-workflow.md).");
}

if (manques.length) {
    console.error(`[livraison] PR refusée : du code est livré sans trace lisible.\n${manques.map((m) => `  - ${m}`).join("\n")}\n` +
        "  Quoi faire : ajouter l'entrée au suivi (format ## <num>. ✅ …, avec « Non fait dans ce round »), rafraîchir\n" +
        "  l'en-tête « Dernière mise à jour », mettre à jour docs/ETAT-ACTUEL.md (.claude/rules/suivi-taches.md).");
    process.exit(1);
}
console.log("[livraison] suivi et état à jour (ou aucun code touché).");
