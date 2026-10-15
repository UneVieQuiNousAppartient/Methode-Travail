#!/usr/bin/env node
// Vérifie que la méthode de travail est installée correctement dans le projet.
// Étape 5 de l'installation (README du dépôt methode-travail) ; rappelé par la skill point-projet.
//
// Contrôles :
//   1. .claude/settings.json : JSON valide, scripts appelés par les hooks présents ;
//   2. frontmatter des agents (name, description, model) et des skills (name, description) ;
//   3. scripts : `bash -n` des .sh, `sh -n` des hooks Git, `node --check` des .js / .mjs ;
//   4. CLAUDE.md : section « Fiche projet » présente, toutes ses clés, et remplie ;
//   5. dossiers de code (Fiche projet, sinon CHEMINS_CODE de check-suivi.js) existants ;
//   6. skills copiées d'un autre dépôt : SOURCE.md présent et complet ;
//   7. hook Git activé (core.hooksPath), garde-fous appelés par la Vérification, version de la
//      méthode notée dans docs/ETAT-ACTUEL.md, registre docs/ERREURS-CONNUES.md présent.
//
// Usage :
//   node scripts/verifier-methode.mjs             projet installé : tout manque est une erreur
//   node scripts/verifier-methode.mjs --gabarit   dépôt methode-travail (modele/) : une Fiche projet
//                                                 non remplie et des dossiers de code absents sont attendus
// Sortie : ✔ / ⚠ / ✖ par contrôle ; code 1 s'il y a au moins un ✖.
// Sans dépendance : Node seul.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GABARIT = process.argv.includes("--gabarit");
const rel = (p) => path.relative(RACINE, p).replace(/\\/g, "/") || ".";
const lire = (p) => readFileSync(p, "utf8");

const bilan = { ok: 0, avert: 0, erreur: 0 };
const ok = (m) => { bilan.ok++; console.log(`  ✔ ${m}`); };
const avert = (m) => { bilan.avert++; console.log(`  ⚠ ${m}`); };
const erreur = (m) => { bilan.erreur++; console.log(`  ✖ ${m}`); };
const titre = (t) => console.log(`\n${t}`);

// Clés de la Fiche projet (CLAUDE.md). Obligatoires : sans elles, les skills ne savent pas quoi lancer.
const CLES_FICHE = [
    ["Pile", true],
    ["Dossiers de code", true],
    ["Hors périmètre de Claude", false],
    ["Vérification", true],
    ["Tests ciblés", false],
    ["Serveur local", false],
    ["Déploiement", true],
    ["Contrôle après déploiement", false],
    ["Routes publiques", false],
    ["Sitemap et navigation", false],
    ["Langues", false],
    ["Valide les livraisons", true],
];
const NON_REMPLI = /<à remplir|^\s*<[^>]*>\s*$|^\s*$/;

function frontmatter(fichier) {
    const texte = lire(fichier);
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte);
    if (!m) return null;
    const champs = {};
    for (const ligne of m[1].split(/\r?\n/)) {
        const c = /^([A-Za-z_-]+):\s*(.*)$/.exec(ligne);
        if (c) champs[c[1]] = c[2].trim();
    }
    return champs;
}

function lister(dossier, filtre) {
    if (!existsSync(dossier)) return [];
    return readdirSync(dossier).map((n) => path.join(dossier, n)).filter(filtre);
}

// ---------------------------------------------------------------------------
titre("1. Réglages Claude Code (.claude/settings.json)");
const fichierReglages = path.join(RACINE, ".claude", "settings.json");
if (!existsSync(fichierReglages)) {
    erreur(".claude/settings.json absent");
} else {
    try {
        const reglages = JSON.parse(lire(fichierReglages));
        ok("JSON valide");
        const commandes = Object.values(reglages.hooks || {})
            .flat()
            .flatMap((g) => g.hooks || [])
            .map((h) => h.command || "");
        const scripts = [...new Set(commandes.flatMap((c) => [...c.matchAll(/scripts\/[\w.-]+/g)].map((m) => m[0])))];
        for (const s of scripts) (existsSync(path.join(RACINE, s)) ? ok : erreur)(`hook → ${s}${existsSync(path.join(RACINE, s)) ? "" : " : fichier absent"}`);
        if (!reglages.env?.CLAUDE_CODE_SUBAGENT_MODEL) avert("env.CLAUDE_CODE_SUBAGENT_MODEL absent (agents sans modèle par défaut)");
    } catch (e) {
        erreur(`JSON invalide : ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
titre("2. Agents et skills (frontmatter)");
const agents = lister(path.join(RACINE, ".claude", "agents"), (p) => p.endsWith(".md"));
for (const a of agents) {
    const fm = frontmatter(a);
    if (!fm) { erreur(`${rel(a)} : pas de frontmatter`); continue; }
    const manque = ["name", "description", "model"].filter((k) => !fm[k]);
    if (manque.length) erreur(`${rel(a)} : ${manque.join(", ")} manquant(s)`);
    else if (fm.name !== path.basename(a, ".md")) avert(`${rel(a)} : name « ${fm.name} » ≠ nom du fichier`);
    else if (!/^(opus|sonnet|haiku|inherit|claude-[\w.-]+)$/.test(fm.model)) avert(`${rel(a)} : model « ${fm.model} » inattendu`);
}
if (agents.length) ok(`${agents.length} agent(s) lus`);
else avert("aucun agent dans .claude/agents/");

const skills = lister(path.join(RACINE, ".claude", "skills"), (p) => statSync(p).isDirectory());
const skillsCopiees = [];
for (const s of skills) {
    const f = path.join(s, "SKILL.md");
    if (!existsSync(f)) { erreur(`${rel(s)} : SKILL.md absent`); continue; }
    const fm = frontmatter(f);
    if (!fm) { erreur(`${rel(f)} : pas de frontmatter`); continue; }
    const manque = ["name", "description"].filter((k) => !fm[k]);
    if (manque.length) erreur(`${rel(f)} : ${manque.join(", ")} manquant(s)`);
    else if (fm.name !== path.basename(s)) avert(`${rel(f)} : name « ${fm.name} » ≠ nom du dossier`);
    if (fm.source || existsSync(path.join(s, "SOURCE.md"))) skillsCopiees.push([s, fm]);
}
if (skills.length) ok(`${skills.length} skill(s) lues`);

// ---------------------------------------------------------------------------
titre("3. Scripts");
const dossierScripts = path.join(RACINE, "scripts");
for (const f of lister(dossierScripts, (p) => /\.sh$/.test(p))) {
    const r = spawnSync("bash", ["-n", f], { encoding: "utf8" });
    r.status === 0 ? ok(`bash -n ${rel(f)}`) : erreur(`bash -n ${rel(f)} : ${(r.stderr || "").trim()}`);
}
for (const f of lister(path.join(RACINE, ".githooks"), (p) => statSync(p).isFile())) {
    const r = spawnSync("sh", ["-n", f], { encoding: "utf8" });
    r.status === 0 ? ok(`sh -n ${rel(f)}`) : erreur(`sh -n ${rel(f)} : ${(r.stderr || "").trim()}`);
}
for (const f of lister(dossierScripts, (p) => /\.(m?js|cjs)$/.test(p))) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    r.status === 0 ? ok(`node --check ${rel(f)}`) : erreur(`node --check ${rel(f)} : ${(r.stderr || "").trim().split("\n")[0]}`);
}

// ---------------------------------------------------------------------------
titre("4. Fiche projet (CLAUDE.md)");
const fichierClaude = path.join(RACINE, "CLAUDE.md");
let fiche = null;
if (!existsSync(fichierClaude)) {
    erreur("CLAUDE.md absent");
} else {
    const texte = lire(fichierClaude);
    const debut = texte.search(/^## Fiche projet\s*$/m);
    if (debut < 0) {
        erreur("section « ## Fiche projet » absente de CLAUDE.md (gabarit : modele/CLAUDE.md)");
    } else {
        const section = texte.slice(debut).split(/\n(?=## )/)[0];
        fiche = {};
        for (const ligne of section.split("\n")) {
            const c = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(ligne);
            if (c && c[1] !== "Clé" && !/^-+$/.test(c[1])) fiche[c[1]] = c[2];
        }
        const nonRemplies = [];
        for (const [cle, obligatoire] of CLES_FICHE) {
            if (!(cle in fiche)) { erreur(`clé « ${cle} » absente de la Fiche projet`); continue; }
            if (NON_REMPLI.test(fiche[cle])) nonRemplies.push([cle, obligatoire]);
        }
        if (!nonRemplies.length) ok("Fiche projet remplie");
        else if (GABARIT) ok(`Fiche projet présente, ${nonRemplies.length} clé(s) à remplir à l'installation (attendu dans le gabarit)`);
        else {
            for (const [cle, obligatoire] of nonRemplies) (obligatoire ? erreur : avert)(`Fiche projet : « ${cle} » non remplie${obligatoire ? "" : " (mettre « — » si sans objet)"}`);
        }
    }
}

// ---------------------------------------------------------------------------
titre("5. Dossiers de code");
let chemins = null;
let origine = "Fiche projet";
if (fiche && fiche["Dossiers de code"] && !NON_REMPLI.test(fiche["Dossiers de code"])) {
    chemins = [...fiche["Dossiers de code"].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (!chemins.length) erreur("« Dossiers de code » : écrire chaque dossier entre accents graves (ex. `src/`)");
}
if (!chemins) {
    const suivi = path.join(dossierScripts, "check-suivi.js");
    const m = existsSync(suivi) && /CHEMINS_CODE_DEFAUT\s*=\s*\[([^\]]*)\]/.exec(lire(suivi));
    chemins = m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [];
    origine = "CHEMINS_CODE_DEFAUT de scripts/check-suivi.js";
}
for (const c of chemins) {
    if (existsSync(path.join(RACINE, c))) ok(`${c} existe (${origine})`);
    else (GABARIT ? avert : erreur)(`${c} n'existe pas (${origine})${GABARIT ? " — normal dans le gabarit" : ""}`);
}

// ---------------------------------------------------------------------------
titre("6. Skills copiées d'un autre dépôt (SOURCE.md)");
if (!skillsCopiees.length) ok("aucune skill copiée déclarée");
for (const [s, fm] of skillsCopiees) {
    const src = path.join(s, "SOURCE.md");
    if (!existsSync(src)) { erreur(`${rel(s)} : déclare « source: ${fm.source} » mais n'a pas de SOURCE.md`); continue; }
    const t = lire(src);
    const manque = [];
    if (!/github\.com\/[^/\s]+\/[^/\s]+|npx skills add|https?:\/\//i.test(t)) manque.push("dépôt");
    if (!/\b[0-9a-f]{7,40}\b/.test(t) && !/npx skills add/i.test(t)) manque.push("commit");
    if (!/licen[cs]e/i.test(t)) manque.push("licence");
    if (!/\b\d{4}-\d{2}-\d{2}\b/.test(t)) manque.push("date");
    manque.length ? avert(`${rel(src)} : ${manque.join(", ")} à préciser`) : ok(`${rel(src)} complet`);
}

// ---------------------------------------------------------------------------
titre("7. Garde-fous actifs et version");
if (!existsSync(path.join(RACINE, ".githooks", "pre-commit"))) avert(".githooks/pre-commit absent");
else if (GABARIT) ok(".githooks/pre-commit présent (activation à l'installation : git config core.hooksPath .githooks)");
else {
    const r = spawnSync("git", ["config", "core.hooksPath"], { cwd: RACINE, encoding: "utf8" });
    (r.stdout || "").trim() === ".githooks" ? ok("hook Git actif (core.hooksPath = .githooks)") : avert("hook Git inactif : git config core.hooksPath .githooks");
}
const paquet = path.join(RACINE, "package.json");
if (!GABARIT && existsSync(paquet) && existsSync(path.join(dossierScripts, "check-rules.mjs"))) {
    /check-rules/.test(lire(paquet)) ? ok("check-rules appelé par un script de package.json") : avert("check-rules.mjs n'est appelé par aucun script de package.json : l'ajouter à la commande « Vérification »");
}
if (!existsSync(path.join(dossierScripts, "check-secrets-suivis.mjs"))) avert("scripts/check-secrets-suivis.mjs absent (fichiers sensibles suivis par Git)");
else if (!GABARIT && existsSync(paquet)) {
    /check-secrets-suivis/.test(lire(paquet)) ? ok("check-secrets-suivis appelé par un script de package.json") : avert("check-secrets-suivis.mjs n'est appelé par aucun script de package.json : l'ajouter à la commande « Vérification »");
}
const erreursConnues = path.join(RACINE, "docs", "ERREURS-CONNUES.md");
if (!existsSync(erreursConnues)) erreur("docs/ERREURS-CONNUES.md absent (registre des erreurs connues, gabarit : modele/docs/ERREURS-CONNUES.md)");
else if (!/^\|\s*#\s*\|\s*Erreur/m.test(lire(erreursConnues))) avert("docs/ERREURS-CONNUES.md : en-tête de table « | # | Erreur (message exact) | Cause | Solution | Règle | » introuvable");
else ok("docs/ERREURS-CONNUES.md présent");
const etat = path.join(RACINE, "docs", "ETAT-ACTUEL.md");
if (!existsSync(etat)) avert("docs/ETAT-ACTUEL.md absent");
else {
    const v = /Méthode\s*:\s*version\s+(\S+)/.exec(lire(etat));
    if (!v) avert("docs/ETAT-ACTUEL.md : ligne « Méthode : version X » absente");
    else if (/^</.test(v[1])) (GABARIT ? ok : avert)(`docs/ETAT-ACTUEL.md : version de la méthode ${GABARIT ? "à noter à l'installation (gabarit)" : "non remplie (contenu de VERSION du dépôt methode-travail)"}`);
    else ok(`méthode version ${v[1]} notée dans docs/ETAT-ACTUEL.md`);
}

// ---------------------------------------------------------------------------
console.log(`\nBilan : ${bilan.ok} ✔ · ${bilan.avert} ⚠ · ${bilan.erreur} ✖${GABARIT ? "  (mode gabarit)" : ""}`);
process.exit(bilan.erreur ? 1 : 0);
