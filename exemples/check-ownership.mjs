#!/usr/bin/env node
// Exemple — « plusieurs agents, un périmètre chacun, appliqué par hook ».
// Patron repris de KHI Educ (15 oct. 2026), où Claude Code tient le backend et un autre agent le frontend
// sur deux branches du même dépôt. Rendu générique : à copier dans scripts/ d'un projet qui en a besoin,
// puis adapter PROPRIETAIRES, ROLES_PAR_BRANCHE et LIBELLES.
//
// Trois usages :
//   node scripts/check-ownership.mjs --staged          ← hook Git pre-commit (.githooks/pre-commit)
//   node scripts/check-ownership.mjs --hook            ← hook Claude Code PreToolUse Edit|Write|MultiEdit (JSON sur stdin)
//   node scripts/check-ownership.mjs --path a.js b.js  ← vérification à la main, ou par l'agent revue-integration
//
// Rôle courant : variable AGENT_ROLE, sinon déduit de la branche (ROLES_PAR_BRANCHE). Autre branche : pas de contrôle.
// Contournement assumé (la personne qui fusionne, en connaissance de cause) : ALLOW_CROSS_OWNERSHIP=1.
// La carte ci-dessous fait foi : la recopier dans CLAUDE.md (ligne « Hors périmètre de Claude ») et la tenir à jour ensemble.
import { execSync } from "node:child_process";
import { relative, isAbsolute } from "node:path";

// --- carte de propriété (EXEMPLE à adapter) -----------------------------------
// Première règle qui correspond gagne. "partage" = tout le monde peut modifier.
const PROPRIETAIRES = [
    { proprietaire: "partage", test: (p) => /^(package\.json|package-lock\.json|README\.md|CLAUDE\.md|\.gitignore)$/.test(p) },
    { proprietaire: "partage", test: (p) => p === "docs/DEMANDES.md" || p === "SUIVI-TACHES.md" || p === "docs/ETAT-ACTUEL.md" },
    { proprietaire: "front", test: (p) => /^(components|public|styles|i18n)\//.test(p) || /^app\/.*\/page\.(jsx?|tsx?)$/.test(p) },
    { proprietaire: "back", test: (p) => /^(app\/api|lib|supabase|scripts|tests|\.claude|\.githooks|\.github)\//.test(p) },
];
const ROLES_PAR_BRANCHE = { main: "back", front: "front" };
const LIBELLES = { back: "backend (Claude Code)", front: "frontend (autre agent)" };

const proprietaireDe = (p) => PROPRIETAIRES.find((r) => r.test(p))?.proprietaire ?? "inconnu";

const roleCourant = () => {
    const env = (process.env.AGENT_ROLE || "").toLowerCase();
    if (env in LIBELLES) return env;
    try {
        const branche = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        return ROLES_PAR_BRANCHE[branche] ?? null;
    } catch {
        return null; // hors dépôt Git
    }
};

const normaliser = (p) => (isAbsolute(p) ? relative(process.cwd(), p) : p).replace(/\\/g, "/").replace(/^\.\//, "");

const violations = (chemins, role) =>
    chemins
        .map((p) => ({ chemin: normaliser(p), proprietaire: proprietaireDe(normaliser(p)) }))
        .filter(({ chemin, proprietaire }) => !chemin.startsWith("..") && !["partage", "inconnu", role].includes(proprietaire));

const expliquer = (role, fautes) =>
    [
        `Hors périmètre ${LIBELLES[role]} :`,
        ...fautes.map((f) => `  - ${f.chemin}  (propriétaire : ${LIBELLES[f.proprietaire]})`),
        "",
        "On ne modifie pas un fichier hors de son périmètre : déposer une demande (ex. docs/DEMANDES.md)",
        "et laisser l'autre agent faire le changement. Fusion en connaissance de cause : ALLOW_CROSS_OWNERSHIP=1.",
    ].join("\n");

const mode = process.argv[2];
const contournement = process.env.ALLOW_CROSS_OWNERSHIP === "1";

if (mode === "--hook") {
    let brut = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (brut += c));
    process.stdin.on("end", () => {
        const role = roleCourant();
        let fichier = null;
        try {
            fichier = JSON.parse(brut.replace(/^﻿/, ""))?.tool_input?.file_path ?? null;
        } catch {
            // entrée illisible : on laisse passer
        }
        if (!role || !fichier || contournement) process.exit(0);
        const fautes = violations([fichier], role);
        if (fautes.length) {
            process.stdout.write(JSON.stringify({
                hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: expliquer(role, fautes) },
            }));
        }
        process.exit(0);
    });
} else if (mode === "--staged") {
    const role = roleCourant();
    if (!role || contournement) process.exit(0);
    const indexes = execSync("git diff --cached --name-only --diff-filter=ACMRD", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
    const fautes = violations(indexes, role);
    if (!fautes.length) process.exit(0);
    console.error(`\n✖ Commit refusé — ${expliquer(role, fautes)}\n`);
    process.exit(1);
} else if (mode === "--path") {
    const role = roleCourant();
    const chemins = process.argv.slice(3);
    if (!role) {
        console.log("Rôle indéterminé (AGENT_ROLE absent, branche sans rôle) — pas de contrôle.");
        process.exit(0);
    }
    for (const p of chemins) console.log(`${normaliser(p).padEnd(50)} → ${proprietaireDe(normaliser(p))}`);
    const fautes = violations(chemins, role);
    if (fautes.length) {
        console.error(`\n${expliquer(role, fautes)}`);
        process.exit(1);
    }
    console.log(`\n✓ Tout est dans le périmètre ${LIBELLES[role]}.`);
} else {
    console.error("Usage : check-ownership.mjs --staged | --hook | --path <fichiers…>");
    process.exit(2);
}
