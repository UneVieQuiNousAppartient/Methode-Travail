#!/usr/bin/env node
// Fichiers sensibles suivis par Git — garde-fou mécanique (voir .claude/rules/agent-workflow.md,
// « Garde-fous mécaniques », et .claude/rules/regles-metier.md).
//
// Pourquoi un script à part : check-rules.mjs analyse le contenu ligne par ligne ; ici, c'est la
// PRÉSENCE du fichier dans Git qui est la faute (un `.env` suivi fuit au premier push, même si
// chaque ligne a l'air anodine). Un `.env` listé dans .gitignore mais déjà suivi reste suivi :
// seul `git ls-files` le voit.
//
// Contrôles :
//   1. aucun fichier d'environnement réel suivi (.env, .env.local, .env.production, supabase/.env…) ;
//      les gabarits .env.example / .env.sample / .env.template / .env.dist sont admis ;
//   2. aucun fichier de configuration de paquets suivi avec un jeton (.npmrc, .yarnrc.yml, .pypirc) ;
//   3. aucune clé privée suivie (id_rsa, id_ed25519…, *.p12, *.pfx, *.jks, *.keystore, et
//      *.pem / *.key qui contiennent « PRIVATE KEY ») ;
//   4. les gabarits .env.example… ne contiennent pas de vraie valeur de secret.
//
// Usage :
//   node scripts/check-secrets-suivis.mjs                  dépôt courant (code 1 si un fichier est refusé)
//   node scripts/check-secrets-suivis.mjs --racine <dir>   un autre dépôt (tests du script)
// Lancé par .githooks/pre-commit (bloquant) et à inclure dans la commande « Vérification » de la
// Fiche projet (CLAUDE.md), donc en CI. Pendant le hook pre-commit, `git ls-files` voit aussi les
// fichiers ajoutés par `git add` : le commit qui ajouterait un `.env` est refusé.
//
// Exception assumée (rare) : ajouter le chemin exact à AUTORISES, avec la raison en commentaire.
// Sans dépendance : Node seul. Modèle « methode-travail » 1.2.0.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const iRacine = args.indexOf("--racine");
const RACINE = iRacine >= 0
    ? path.resolve(args[iRacine + 1] || ".")
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Chemins exacts admis malgré tout — chacun avec sa raison. Vide par défaut.
const AUTORISES = new Set([
    // "config/.env.ci",   // raison : valeurs factices pour la CI, aucune vraie clé (revu le AAAA-MM-JJ)
]);

const GABARIT_ENV = /^\.env\.(example|sample|template|dist)$|\.example$/i;
const ENV_REEL = /^\.env(\..+)?$/i;                        // .env, .env.local, .env.production…
const CONFIG_PAQUETS = /^(\.npmrc|\.yarnrc\.yml|\.pypirc)$/i;
// Une ligne de jeton dont la valeur est écrite en clair ; `${NPM_TOKEN}` (variable d'environnement) est admis.
const JETON_PAQUETS = /(_authToken|_auth|npmAuthToken|^\s*password)\s*[:=]\s*(?!["']?\$\{|["']["']|\s*$)\S/im;
const CLE_PRIVEE_NOM = /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$|\.(p12|pfx|jks|keystore)$/i;
const CLE_PRIVEE_A_LIRE = /\.(pem|key)$/i;
const CONTENU_CLE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
// Valeurs qui ne doivent jamais figurer dans un gabarit .env.example.
const SECRETS_DANS_GABARIT = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT (clé de service, jeton)
    // Longueur minimale exigée : un factice comme `sk_live_xxx` ou `sk-ant-...` reste admis (revue QA du 2026-10-15).
    /\b((sk|rk)_live_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/,
];

function lireSiPossible(rel) {
    try { return readFileSync(path.join(RACINE, rel), "utf8"); } catch { return ""; }
}

let suivis;
try {
    suivis = execFileSync("git", ["ls-files", "-z"], { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        .split("\0").filter(Boolean).map((f) => f.replace(/\\/g, "/"));
} catch {
    console.log(`check-secrets-suivis : ${RACINE} n'est pas un dépôt Git, contrôle sauté.`);
    process.exit(0);
}

const refus = [];
for (const rel of suivis) {
    if (AUTORISES.has(rel)) continue;
    const nom = path.posix.basename(rel);
    if (ENV_REEL.test(nom) && !GABARIT_ENV.test(nom)) {
        refus.push([rel, "fichier d'environnement réel — le retirer de Git, garder un .env.example sans valeur"]);
    } else if (GABARIT_ENV.test(nom) && /^\.env/i.test(nom)) {
        const contenu = lireSiPossible(rel);
        const motif = SECRETS_DANS_GABARIT.find((m) => m.test(contenu));
        if (motif) refus.push([rel, `gabarit qui semble contenir une vraie valeur (${motif.source.slice(0, 40)}…) — remplacer par une valeur vide ou factice`]);
    } else if (CONFIG_PAQUETS.test(nom) && JETON_PAQUETS.test(lireSiPossible(rel))) {
        refus.push([rel, "configuration de paquets avec jeton — passer le jeton par une variable d'environnement (ex. ${NPM_TOKEN})"]);
    } else if (CLE_PRIVEE_NOM.test(nom) || (CLE_PRIVEE_A_LIRE.test(nom) && CONTENU_CLE.test(lireSiPossible(rel)))) {
        refus.push([rel, "clé privée — la sortir du dépôt et la remplacer (elle est compromise si elle a été poussée)"]);
    }
}

if (!refus.length) {
    console.log(`check-secrets-suivis : ${suivis.length} fichier(s) suivi(s), aucun fichier sensible.`);
    process.exit(0);
}
console.error(`\ncheck-secrets-suivis : ${refus.length} fichier(s) sensible(s) suivi(s) par Git\n`);
for (const [rel, message] of refus) console.error(`  ${rel}  — ${message}`);
console.error(`
Que faire :
  git rm --cached <fichier>      (le retire de Git, le garde sur le disque)
  puis l'ajouter à .gitignore.
S'il a déjà été poussé, il est dans l'historique : RÉVOQUER et remplacer chaque secret qu'il contient
(retirer le fichier ne suffit pas). Exception assumée : AUTORISES dans ce script, avec la raison.
`);
process.exit(1);
