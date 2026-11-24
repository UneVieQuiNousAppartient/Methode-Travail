#!/usr/bin/env node
// Compare un projet au modèle de la méthode (dépôt methode-travail, dossier modele/) — méthode 1.7.0.
// Demande de Camille (24 nov. 2026) : « je ne veux plus recommencer ces étapes, il faut que ce soit commun ».
// Base mécanique des skills `methode-a-jour` (le modèle descend dans le projet) et `remonter-methode` (une
// amélioration du projet remonte au modèle) : au lieu de relire 100 fichiers, on sait lesquels ont bougé.
//
// Pour chaque fichier de modele/ :
//   identique  — rien à faire ;
//   absent     — à copier dans le projet (ou à ignorer s'il ne sert pas à la pile : le dire) ;
//   différent  — « commun » : le projet devrait avoir la version du modèle (ou l'améliore : à remonter) ;
//                « à adapter » : différence attendue (Fiche projet, listes, état…), fusion à la main.
// Et les fichiers du projet dans les mêmes dossiers que le modèle (.claude/, scripts/, .githooks/) qui ne sont pas
// dans le modèle : « propres au projet » (candidats à remonter s'ils sont communs).
//
// Usage (depuis le projet) : node scripts/comparer-methode.mjs <chemin du dépôt methode-travail> [--json]
// Lit seulement ; ne modifie rien. Sans dépendance : Node seul.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Fichiers dont le contenu est propre au projet : une différence avec le modèle est attendue. */
export const A_ADAPTER = [
    /^CLAUDE\.md$/, /^docs\//, /^\.claude\/settings\.json$/, /^\.claude\/agents\//, /^\.claude\/rules\/agent-workflow\.md$/,
    /^\.claude\/skills\/REGISTRE\.md$/, /^scripts\/(architecture-existant|couleurs-autorisees)\.json$/,
    /^scripts\/(check-rules\.mjs|session-start\.sh|hook-protect-files\.mjs|hook-lint-fix\.mjs)$/, /^\.github\//,
];
/** Dossiers du projet où un fichier absent du modèle est « propre au projet ». */
const DOSSIERS_METHODE = [".claude/agents/", ".claude/rules/", ".claude/skills/", "scripts/", ".githooks/"];

const normal = (t) => String(t).replace(/\r\n/g, "\n");

/**
 * Classement pur. `modele` et `projet` : { chemin: contenu } (contenu absent = fichier absent).
 * Renvoie { identiques, absents, communsDifferents, aAdapter, propres }.
 */
export function classer(modele, projet) {
    const r = { identiques: [], absents: [], communsDifferents: [], aAdapter: [], propres: [] };
    for (const p of Object.keys(modele).sort()) {
        if (!(p in projet)) r.absents.push(p);
        else if (normal(modele[p]) === normal(projet[p])) r.identiques.push(p);
        else if (A_ADAPTER.some((m) => m.test(p))) r.aAdapter.push(p);
        else r.communsDifferents.push(p);
    }
    r.propres = Object.keys(projet).filter((p) => !(p in modele) && DOSSIERS_METHODE.some((d) => p.startsWith(d))).sort();
    return r;
}

/** Version notée dans un texte (« Méthode : version X » d'ETAT-ACTUEL.md, ou contenu de VERSION). */
export const versionDe = (texte) => (/Méthode\s*:\s*version\s+([\d.]+)/.exec(texte ?? "") ?? /^\s*([\d.]+)\s*$/.exec(texte ?? ""))?.[1] ?? null;

function lireArbre(racine, filtre = () => true) {
    const out = {};
    const ignores = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);
    const marcher = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            if (ignores.has(e.name)) continue;
            const complet = path.join(d, e.name);
            const rel = path.relative(racine, complet).split(path.sep).join("/");
            if (e.isDirectory()) marcher(complet);
            else if (e.isFile() && filtre(rel) && statSync(complet).size < 2_000_000) out[rel] = readFileSync(complet, "utf8");
        }
    };
    if (existsSync(racine)) marcher(racine);
    return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const source = process.argv.slice(2).find((a) => !a.startsWith("--"));
    if (!source || !existsSync(path.join(source, "modele"))) {
        console.error("Usage : node scripts/comparer-methode.mjs <chemin du dépôt methode-travail> [--json]");
        process.exit(2);
    }
    const projetRacine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const modele = lireArbre(path.join(source, "modele"));
    const projet = lireArbre(projetRacine, (p) => p in modele || DOSSIERS_METHODE.some((d) => p.startsWith(d)));
    const r = classer(modele, projet);
    const lireSiPresent = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
    const vModele = versionDe(lireSiPresent(path.join(source, "VERSION")));
    const vProjet = versionDe(lireSiPresent(path.join(projetRacine, "docs", "ETAT-ACTUEL.md")));
    if (process.argv.includes("--json")) {
        console.log(JSON.stringify({ versionModele: vModele, versionProjet: vProjet, ...r }, null, 2));
        process.exit(0);
    }
    console.log(`Méthode : modèle ${vModele ?? "?"} · projet ${vProjet ?? "non notée"} (docs/ETAT-ACTUEL.md)`);
    const bloc = (titre, liste, conseil) => {
        if (!liste.length) return;
        console.log(`\n${titre} (${liste.length}) — ${conseil}`);
        for (const p of liste) console.log(`  - ${p}`);
    };
    bloc("Absents du projet", r.absents, "à copier depuis modele/ (ou à écarter avec la raison)");
    bloc("Communs mais différents", r.communsDifferents, "relire le diff : version du modèle à reprendre, ou amélioration du projet à remonter");
    bloc("À adapter, différents", r.aAdapter, "différence attendue : fusionner à la main les sections nouvelles du modèle");
    bloc("Propres au projet", r.propres, "absents du modèle : à remonter seulement s'ils servent à tous les projets");
    console.log(`\nIdentiques : ${r.identiques.length}`);
}
