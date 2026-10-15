#!/usr/bin/env node
// Hook Claude Code PreToolUse (Edit | Write | MultiEdit), déclaré dans .claude/settings.json.
// Refuse l'écriture, par l'éditeur de Claude, des fichiers qu'on ne doit jamais toucher à la main :
//   - secrets : .env, .env.local, .env.production… (seuls .env.example / .env.sample passent) ;
//   - fichiers de verrouillage : générés par le gestionnaire de paquets, pas par un éditeur ;
//   - artefacts générés : on modifie la source, pas le résultat.
// Un script qui écrit volontairement un .env passe par Bash, pas par Edit : ce hook ne le voit pas.
//
// Entrée : JSON du hook sur stdin ({ tool_input: { file_path } }).
// Sortie : JSON { hookSpecificOutput: { permissionDecision: "deny" } } pour refuser, rien pour laisser passer.
// Toujours code 0 : une entrée illisible laisse passer (ce hook protège, il ne doit jamais tout bloquer).
// Modèle « methode-travail » (repris de KHI Educ, 15 oct. 2026) : ajouter ici les fichiers propres au projet.
import { relative, isAbsolute, basename } from "node:path";

// Gabarits de variables (.env.example, .env.local.example, .env.sample, .env.template…) : autorisés.
const ENV_PERMIS = /\.(example|sample|template)$/;
const VERROUS = new Set([
    "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
    "poetry.lock", "Pipfile.lock", "uv.lock", "Cargo.lock", "composer.lock", "Gemfile.lock", "skills-lock.json",
]);
// Testés sur le PREMIER segment du chemin seulement (une route « app/coverage/ » est du code source) ;
// node_modules, __pycache__ et .git sont refusés à toute profondeur.
const ARTEFACTS_RACINE = [".next", "dist", ".vercel", ".turbo", ".svelte-kit", ".nuxt", "coverage"];
const ARTEFACTS_PARTOUT = ["node_modules", "__pycache__", ".git"];

const REGLES = [
    {
        test: (p) => /^\.env(\..+)?$/.test(basename(p)) && !ENV_PERMIS.test(basename(p)),
        why: "fichier de secrets — écrire les variables par un script ou demander à la personne qui valide, jamais par l'éditeur",
    },
    {
        test: (p) => VERROUS.has(basename(p)),
        why: "fichier de verrouillage généré — passer par le gestionnaire de paquets (npm install, pip, cargo…)",
    },
    {
        test: (p) => ARTEFACTS_RACINE.includes(p.split("/")[0]) || p.split("/").some((seg) => ARTEFACTS_PARTOUT.includes(seg)),
        why: "artefact généré ou dossier interne — modifier la source, pas le résultat",
    },
];

let brut = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (brut += c));
process.stdin.on("end", () => {
    let fichier = null;
    try {
        fichier = JSON.parse(brut.replace(/^﻿/, ""))?.tool_input?.file_path ?? null;
    } catch {
        // entrée illisible : on laisse passer
    }
    if (!fichier) process.exit(0);
    const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const rel = (isAbsolute(fichier) ? relative(racine, fichier) : fichier).replace(/\\/g, "/").replace(/^\.\//, "");
    if (rel.startsWith("..")) process.exit(0); // hors du projet : pas notre affaire
    const regle = REGLES.find((r) => r.test(rel));
    if (!regle) process.exit(0);
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Fichier protégé : ${rel} — ${regle.why}.`,
        },
    }));
    process.exit(0);
});
