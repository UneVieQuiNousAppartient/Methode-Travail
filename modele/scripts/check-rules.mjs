#!/usr/bin/env node
// Règles métier et de sécurité vérifiées mécaniquement — voir .claude/rules/regles-metier.md.
//
// Principe : chaque incident de contenu ou de sécurité qui s'est produit (ou risque de se
// reproduire) devient une règle ici, pas un rappel dans le fichier d'un agent. Un agent oublie
// un rappel ; ce script, lancé par le hook pre-commit et par la commande « Vérification » de la
// Fiche projet (CLAUDE.md), n'oublie pas.
//
// Usage :
//   node scripts/check-rules.mjs                  analyse le projet (code 1 si une règle est violée)
//   node scripts/check-rules.mjs --racine <dir>   analyse un autre dossier (tests du script)
//   node scripts/check-rules.mjs --liste          affiche les règles actives et leur incident
//
// Exception ponctuelle et assumée sur une ligne : y écrire `regle-ok: <id>` en commentaire,
// avec la raison. Une exception sans raison se refuse en revue.
//
// Sans dépendance : Node seul. Modèle « methode-travail » (patron repris de KHI Educ, 15 oct. 2026).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const iRacine = args.indexOf("--racine");
const RACINE = iRacine >= 0 ? path.resolve(args[iRacine + 1] || ".") : path.join(path.dirname(ICI), "..");

// Dossiers jamais analysés (générés, dépendances, historique).
const IGNORES = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".vercel", ".turbo", "__pycache__", ".venv"]);
// Fichiers texte analysés par défaut (une règle peut restreindre avec `extensions`).
const TEXTE = /\.(m?[jt]sx?|cjs|json|md|mdx|html?|css|scss|vue|svelte|astro|py|rb|php|sql|ya?ml|toml|sh|txt|po)$/i;
const VERROUS = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock)$/;

/**
 * Une règle :
 *   id        identifiant court, stable (cité dans `regle-ok: <id>`)
 *   incident  le fait réel qui l'a motivée — date, ce qui s'est passé. Sans incident, pas de règle.
 *   motif     RegExp testée sur chaque ligne, ou fonction (ligne, fichierRelatif) => booléen
 *   dossiers  dossiers analysés, relatifs à la racine ("." = tout le dépôt)
 *   extensions (facultatif) RegExp sur le nom de fichier
 *   exclure   (facultatif) RegExp sur le chemin relatif
 *   message   quoi faire à la place — phrase lue par l'agent ou la personne qui a écrit la ligne
 */
const RULES = [
    {
        id: "secret-en-dur",
        incident: "Exemple d'origine (VieSolution, 6 août 2026) : la valeur d'un secret de production a été écrite en clair dans un fichier versionné.",
        motif: /(sk-ant-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/,
        dossiers: ["."],
        exclure: /(^|\/)\.env(\.[^/]*)?$/,
        message: "secret en dur — le mettre dans une variable d'environnement (.env.local, hébergeur), jamais dans un fichier versionné ; le révoquer s'il a déjà été poussé",
    },
    {
        id: "conflit-de-fusion",
        incident: "Marqueur de conflit Git oublié dans un fichier après une fusion : le build casse, ou pire, le texte part en ligne.",
        motif: /^(<<<<<<<|>>>>>>>) |^=======\r?$/,
        dossiers: ["."],
        extensions: /\.(m?[jt]sx?|cjs|json|css|scss|html?|vue|svelte|astro|py|rb|php|sql|ya?ml|toml|sh)$/i,
        message: "marqueur de conflit de fusion — résoudre le conflit",
    },

    // ---- Exemples à adapter au projet (décommenter, remplacer les valeurs inventées) ----
    //
    // {
    //     id: "domaine-en-dur",
    //     incident: "AAAA-MM-JJ : le domaine du site écrit en dur sur N pages pointait encore vers l'ancien domaine après la bascule.",
    //     motif: /https?:\/\/(www\.)?mon-domaine\.ca\b/i,
    //     dossiers: ["src"],
    //     message: "domaine en dur — passer par la variable d'environnement de l'URL du site (ex. SITE_URL)",
    // },
    // {
    //     id: "coordonnee-inventee",
    //     incident: "AAAA-MM-JJ : un courriel de contact inventé (contact@exemple-inventé.ca) affiché sur N pages ; le client n'en a jamais eu.",
    //     // Seules les coordonnées réelles, fournies par le client, sont admises en dur.
    //     motif: (ligne) => {
    //         const VRAIES = ["bonjour@domaine-reel.ca"];
    //         const courriels = ligne.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    //         return courriels.some((c) => !VRAIES.includes(c.toLowerCase()) && !/@(example|exemple)\./i.test(c));
    //     },
    //     dossiers: ["src"],
    //     message: "coordonnée inventée — n'afficher que les coordonnées fournies par le client (réglages ou contenu validé)",
    // },
];

function* fichiers(dossier) {
    let entrees;
    try {
        entrees = readdirSync(dossier, { withFileTypes: true });
    } catch {
        return; // dossier absent : la règle ne s'applique pas encore
    }
    for (const e of entrees) {
        if (IGNORES.has(e.name)) continue;
        const complet = path.join(dossier, e.name);
        if (e.isDirectory()) yield* fichiers(complet);
        else if (e.isFile()) yield complet;
    }
}

// Fichiers connus de Git (suivis + non suivis non ignorés) : un fichier listé dans .gitignore
// (ex. .env.local, notes privées) ne bloque jamais un commit. Hors dépôt Git : null, tout est analysé.
function fichiersGit() {
    try {
        const sortie = execSync("git ls-files -co --exclude-standard -z", { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return new Set(sortie.split("\0").filter(Boolean).map((f) => f.replace(/\\/g, "/")));
    } catch {
        return null;
    }
}

function analyser() {
    const violations = [];
    const connus = fichiersGit();
    for (const regle of RULES) {
        const vus = new Set();
        for (const d of regle.dossiers) {
            for (const complet of fichiers(path.join(RACINE, d))) {
                if (vus.has(complet) || complet === ICI) continue;
                vus.add(complet);
                const rel = path.relative(RACINE, complet).replace(/\\/g, "/");
                if (connus && !connus.has(rel)) continue;
                if (!(regle.extensions || TEXTE).test(rel) || VERROUS.test(rel)) continue;
                if (regle.exclure && regle.exclure.test(rel)) continue;
                if (statSync(complet).size > 2_000_000) continue; // fichier énorme : sans doute généré
                const lignes = readFileSync(complet, "utf8").split("\n");
                lignes.forEach((ligne, i) => {
                    if (ligne.includes(`regle-ok: ${regle.id}`)) return;
                    const touche = typeof regle.motif === "function" ? regle.motif(ligne, rel) : regle.motif.test(ligne);
                    if (touche) violations.push({ regle, rel, ligne: i + 1, texte: ligne.trim().slice(0, 140) });
                });
            }
        }
    }
    return violations;
}

if (args.includes("--liste")) {
    console.log(`${RULES.length} règle(s) active(s) :`);
    for (const r of RULES) console.log(`  - ${r.id} [${r.dossiers.join(", ")}] — ${r.incident}`);
    process.exit(0);
}

const violations = analyser();
if (!violations.length) {
    console.log(`check-rules : ${RULES.length} règle(s), aucune violation.`);
    process.exit(0);
}
console.error(`\ncheck-rules : ${violations.length} violation(s)\n`);
for (const v of violations) {
    console.error(`  ${v.rel}:${v.ligne}  [${v.regle.id}] ${v.regle.message}`);
    console.error(`      ${v.texte}`);
}
console.error("\nException assumée sur une ligne : commentaire `regle-ok: <id>` avec la raison.\n");
process.exit(1);
