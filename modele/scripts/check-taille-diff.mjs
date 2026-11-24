#!/usr/bin/env node
// Garde-fou « moins de code » — méthode 1.7.0, repris de VieSolution-CSF (scripts/check-taille-diff.mjs, 14 nov. 2026,
// demande de Camille : « comment faire pour que Claude ne génère pas beaucoup de lignes de code ? »).
// AVERTIT, ne bloque jamais (code de sortie 0) — comme check-suivi.
//
// Compte les lignes de CODE : fichiers des « Dossiers de code » de la Fiche projet (CLAUDE.md), extensions de code,
// hors tests, __tests__/ et data/ (lib-controles.mjs, estCodeCompte) :
//   1. un fichier DÉJÀ trop long (liste « fichiers_longs » de scripts/architecture-existant.json) qui grossit encore :
//      check-rules ne voit que les NOUVEAUX fichiers trop longs (constat VieSolution du 13 nov. : un fichier de
//      422 lignes passé à 458) ;
//   2. plus de AJOUT_MAX lignes ajoutées pour moins de RETRAIT_MIN retirées : écran refait sans supprimer l'ancien.
// Ces totaux sont les « lignes réelles » de la livraison (.claude/rules/agent-workflow.md, section « Moins de code »).
//
// Usage : node scripts/check-taille-diff.mjs          changements préparés (hook pre-commit) ; n'affiche que les alertes
//         node scripts/check-taille-diff.mjs <base>   arbre de travail comparé à <base> (ex. origin/main) ; affiche
//                                                     toujours les totaux. Fichiers nouveaux non suivis : `git add -N`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estCodeCompte, lireConfig } from "./lib-controles.mjs";

export const AJOUT_MAX = 600;
export const RETRAIT_MIN = 100;

/**
 * Sortie de `git diff --numstat -z` → totaux et avertissements (fonction pure). Avec `-z`, chaque entrée est
 * « ajouts\tretraits\tchemin\0 », ou pour un renommage « ajouts\tretraits\t\0ancien\0nouveau\0 ». Un compte non
 * numérique (fichier binaire « - ») est ignoré.
 */
export function analyser(numstatZ, fichiersLongs, cfg) {
    const avertissements = [];
    let ajouts = 0;
    let retraits = 0;
    const morceaux = numstatZ.split("\0");
    for (let i = 0; i < morceaux.length; i += 1) {
        const [a, r, cheminDirect] = morceaux[i].split("\t");
        if (r === undefined) continue;
        let chemin = cheminDirect;
        if (cheminDirect === "") {
            chemin = morceaux[i + 2];
            i += 2;
        }
        const plus = Number(a);
        const moins = Number(r);
        if (!chemin || !Number.isFinite(plus) || !Number.isFinite(moins)) continue;
        if (!estCodeCompte(chemin, cfg)) continue;
        ajouts += plus;
        retraits += moins;
        if (fichiersLongs.has(chemin) && plus > moins) {
            avertissements.push(`${chemin} : fichier déjà trop long qui grossit encore de ${plus - moins} ligne(s) — sortir du code dans un sous-composant ou une fonction plutôt que l'allonger.`);
        }
    }
    if (ajouts > AJOUT_MAX && retraits < RETRAIT_MIN) {
        avertissements.push(`${ajouts} lignes ajoutées pour ${retraits} retirées : l'ancien code remplacé a-t-il été supprimé ? Le passage simplify / tech-debt l'a-t-il vu ?`);
    }
    return { ajouts, retraits, avertissements };
}

const ici = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const base = process.argv[2];
        const racine = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
        const args = base ? ["diff", "--numstat", "-z", base] : ["diff", "--cached", "--numstat", "-z"];
        const numstat = execFileSync("git", args, { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        let longs = new Set();
        try {
            longs = new Set(JSON.parse(readFileSync(path.join(ici, "architecture-existant.json"), "utf8")).fichiers_longs ?? []);
        } catch {
            // liste absente ou illisible : seul le contrôle du volume s'applique
        }
        const { ajouts, retraits, avertissements } = analyser(numstat, longs, lireConfig(racine));
        if (base) console.log(`[taille] Lignes de code par rapport à ${base} : +${ajouts} / -${retraits}`);
        if (avertissements.length) {
            console.warn(`[taille] Avertissement « moins de code » (jamais bloquant) — +${ajouts} / -${retraits} lignes de code :`);
            for (const a of avertissements) console.warn(`  - ${a}`);
        }
    } catch (e) {
        console.warn(`[taille] contrôle sauté (${String(e.message).split("\n")[0]})`);
    }
    process.exit(0);
}
