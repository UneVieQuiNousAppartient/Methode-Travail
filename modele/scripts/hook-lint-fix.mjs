#!/usr/bin/env node
// Hook Claude Code PostToolUse (Edit | Write | MultiEdit), déclaré dans .claude/settings.json.
// Passe le correcteur de lint du projet sur le fichier qui vient d'être écrit, et remonte à l'agent
// les erreurs qui restent (stdout = retour à l'agent).
//
// Correcteur utilisé : ESLint (`eslint --fix`) s'il est installé dans le projet
// (node_modules/eslint/bin/eslint.js). Sinon : rien, en silence. Pour une autre pile (ruff, rubocop…),
// ajouter une entrée à CORRECTEURS.
//
// Jamais bloquant (toujours code 0) : c'est un correcteur, la commande « Vérification » de la
// Fiche projet (CLAUDE.md) reste le juge.
// Modèle « methode-travail » (repris de KHI Educ, 15 oct. 2026).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, isAbsolute, join } from "node:path";

const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const CORRECTEURS = [
    {
        nom: "eslint --fix",
        extensions: /\.(js|mjs|cjs|jsx|ts|mts|cts|tsx)$/,
        binaire: join(racine, "node_modules", "eslint", "bin", "eslint.js"),
        // eslint par son binaire Node, sans shell : portable Windows / Linux.
        commande: (bin, fichier) => [process.execPath, [bin, "--fix", "--no-warn-ignored", fichier]],
    },
];

const IGNORES = /(^|\/)(node_modules|\.next|dist|\.vercel|\.turbo|coverage)\//;

let brut = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (brut += c));
process.stdin.on("end", () => {
    let fichier = null;
    try {
        fichier = JSON.parse(brut.replace(/^﻿/, ""))?.tool_input?.file_path ?? null;
    } catch {
        // entrée illisible : rien à faire
    }
    if (!fichier) process.exit(0);
    const rel = (isAbsolute(fichier) ? relative(racine, fichier) : fichier).replace(/\\/g, "/");
    if (rel.startsWith("..") || IGNORES.test(rel) || !existsSync(join(racine, rel))) process.exit(0);

    const correcteur = CORRECTEURS.find((c) => c.extensions.test(rel) && existsSync(c.binaire));
    if (!correcteur) process.exit(0);

    const [cmd, args] = correcteur.commande(correcteur.binaire, rel);
    const res = spawnSync(cmd, args, { cwd: racine, encoding: "utf8", timeout: 25000 });
    const sortie = `${res.stdout || ""}${res.stderr || ""}`.trim();
    // Seules les erreurs restantes intéressent l'agent (les avertissements se voient à la vérification).
    if (res.status && /error/i.test(sortie)) {
        const lignes = sortie.split("\n").filter((l) => /error/i.test(l)).slice(0, 12);
        process.stdout.write(`${correcteur.nom} (${rel}) : des erreurs subsistent\n${lignes.join("\n")}\n`);
    }
    process.exit(0);
});
