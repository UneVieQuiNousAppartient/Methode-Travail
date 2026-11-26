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
//   node scripts/check-rules.mjs --seulement a,b  ne lance que ces règles (tests)
//
// Projet qui a déjà son propre check-rules (méthode 1.7.2, cas de KHI Educ) : copier ce fichier tel quel sous
// scripts/check-rules-commun.mjs et, dans le check-rules du projet, appeler
// `lancerReglesCommunes(process.argv.slice(2), ["id-ecartee", …])` (code de sortie 0 ou 1) — voir README.
//
// Exception ponctuelle et assumée sur une ligne : y écrire `regle-ok: <id>` en commentaire,
// avec la raison. Une exception sans raison se refuse en revue.
//
// Sans dépendance : Node seul. Modèle « methode-travail » (patron repris de KHI Educ, 15 oct. 2026).
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lireConfig } from "./lib-controles.mjs";

const ICI = fileURLToPath(import.meta.url);

/**
 * Lance les règles et renvoie le code de sortie (0 : aucune violation, 1 sinon). `ignorer` : règles que le projet
 * écarte (raison écrite à l'appel) — sauf avec --seulement (tests).
 */
export function lancerReglesCommunes(args = process.argv.slice(2), ignorer = []) {
const iRacine = args.indexOf("--racine");
const RACINE = iRacine >= 0 ? path.resolve(args[iRacine + 1] || ".") : path.join(path.dirname(ICI), "..");

// Dossiers jamais analysés (générés, dépendances, historique).
const IGNORES = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".vercel", ".turbo", "__pycache__", ".venv"]);
// Fichiers texte analysés par défaut (une règle peut restreindre avec `extensions`).
const TEXTE = /\.(m?[jt]sx?|cjs|json|md|mdx|html?|css|scss|vue|svelte|astro|py|rb|php|sql|ya?ml|toml|sh|txt|po)$/i;
const VERROUS = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock)$/;

// ---- Règles d'architecture (méthode 1.7.0, reprises de VieSolution-CSF, scripts/check-rules.mjs, 6 nov. 2026) ----
// Elles analysent les « Dossiers de code » de la Fiche projet (CLAUDE.md). Leurs listes propres au projet sont dans
// deux fichiers JSON à côté de ce script, qui ne font que RÉTRÉCIR (une infraction corrigée en sort, aucune n'y entre
// sans accord) :
//   scripts/architecture-existant.json  dossiers où la base peut être lue (« dossiers_domaine »), fichiers déjà en
//                                       infraction tolérés (« acces_base », « fichiers_longs »), « lignes_max » ;
//   scripts/couleurs-autorisees.json    palette du projet (« couleurs ») : vide = règle en attente de la palette.
// Fichier absent : règle inactive (projet qui ne l'a pas encore adoptée). Fichier illisible : check-rules échoue.
const CODE = lireConfig(RACINE).code.filter((c) => !c.startsWith(".claude"));
const illisibles = [];
function lireListe(nom) {
    const p = path.join(RACINE, "scripts", nom);
    if (!existsSync(p)) return null;
    try {
        return JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
        illisibles.push(`scripts/${nom} illisible (${e.message})`);
        return null;
    }
}
const ARCHI = (() => {
    const j = lireListe("architecture-existant.json");
    return j && {
        domaine: (j.dossiers_domaine ?? []).map((d) => (d.endsWith("/") ? d : `${d}/`)),
        acces: new Set(j.acces_base ?? []),
        longs: new Set(j.fichiers_longs ?? []),
        lignesMax: Number(j.lignes_max) || 400,
    };
})();
const PALETTE = (() => {
    const j = lireListe("couleurs-autorisees.json");
    return j?.couleurs?.length ? new Set(j.couleurs.map((c) => c.toLowerCase())) : null;
})();
// `.from('table')` / `.storage.from('seau')` littéraux et `.rpc(` (Supabase) — pas `.from(variable)`, ni Array.from(…).
const ACCES_BASE = /(?<!\b(?:Array|Buffer|Uint8Array|Object|Set|Map))\.from\(\s*['"`]|\.rpc\(/;
// Nombre de lignes comme `wc -l` : le retour à la ligne final ne crée pas de ligne.
const nombreDeLignes = (lignes) => lignes.length - (lignes.at(-1) === "" ? 1 : 0);
const CODE_SOURCE = /\.(m?[jt]sx?|vue|svelte|astro)$/i;
const TESTS = /(\.(test|spec)\.[a-z]+$|\/__tests__\/)/;

/**
 * Une règle :
 *   id        identifiant court, stable (cité dans `regle-ok: <id>`)
 *   incident  le fait réel qui l'a motivée — date, ce qui s'est passé. Sans incident, pas de règle.
 *   motif     RegExp testée sur chaque ligne, ou fonction (ligne, fichierRelatif, indexLigne, lignes) => booléen
 *   dossiers  dossiers analysés, relatifs à la racine ("." = tout le dépôt)
 *   extensions (facultatif) RegExp sur le nom de fichier
 *   exclure   (facultatif) RegExp sur le chemin relatif
 *   message   quoi faire à la place — phrase lue par l'agent ou la personne qui a écrit la ligne
 */
const RULES = [
    {
        id: "secret-en-dur",
        incident: "Exemple d'origine (projet client, août 2026) : la valeur d'un secret de production a été écrite en clair dans un fichier versionné.",
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

    // ---- Règles génériques reprises d'un projet client (kit CRM TS, lot 1, 30 oct. 2026) ----
    // Valables pour tout projet ; chemins à ajuster (`dossiers`, `exclure`) si le projet n'a pas `src/`.
    {
        id: "consentement-precoche",
        incident: "Projet client, oct. 2026 : 7 formulaires (diagnostic, prise de rendez-vous, lead magnet, estimateurs, témoignages) avaient la case de consentement cochée par défaut — contraire à la Loi 25, qui exige un consentement manifeste.",
        // Côté interface seulement : un état ou une valeur initiale de consentement à true.
        // Les routes API (src/app/api/) écrivent consent: true APRÈS avoir exigé la case cochée (z.literal(true)).
        // KHI Educ, 26 nov. 2026 : `consent: true` écrit dans le corps d'une requête (`body: JSON.stringify(`), envoyé
        // APRÈS que la case a été cochée, n'est pas un consentement précoché (3 fausses alertes sur des formulaires).
        motif: (ligne, _rel, i, lignes) => {
            if (!/consent/i.test(ligne)) return false;
            if (/(useState(<[^>]*>)?\(\s*true\s*\)|(\?\?|\|\|)\s*true\b|checked=\{\s*true\s*\}|\.default\(\s*true\s*\)|defaultChecked(?!=\{\s*false))/i.test(ligne)) return true;
            if (!/\bconsent\w*['"]?\s*:\s*true\b/i.test(ligne)) return false;
            const avant = lignes ? lignes.slice(Math.max(0, i - 12), i + 1).join("\n") : ligne;
            return !/\bbody\s*:\s*JSON\.stringify\(/.test(avant); // corps de requête seulement (un champ `body` de formulaire ne compte pas)
        },
        dossiers: ["src"],
        extensions: /\.(m?[jt]sx?)$/i,
        exclure: /(^src\/app\/api\/|\.(test|spec)\.[jt]sx?$)/,
        message: "consentement précoché — la case de consentement démarre décochée (false) ; seul le serveur enregistre true, après avoir exigé la case cochée",
    },
    {
        id: "stockage-direct",
        incident: "Projet client, oct. 2026 : un accès direct à localStorage faisait planter tout le site quand le navigateur bloque le stockage (Chrome « bloquer tous les cookies », navigateurs intégrés d'applications : le simple accès à window.localStorage lève SecurityError).",
        // Accès au stockage (propriété, crochets, Object.keys, `in`) ; les lignes de commentaire ne comptent pas.
        motif: (ligne) => {
            const t = ligne.trim();
            if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
            return /\b(localStorage|sessionStorage)\s*(\?\.|\.|\[)|Object\.(keys|entries|values)\(\s*(window\.)?(localStorage|sessionStorage)\b|\bin\s+(window\.)?(localStorage|sessionStorage)\b/.test(ligne);
        },
        dossiers: ["src"],
        extensions: /\.(m?[jt]sx?)$/i,
        // À adapter : chemin de l'enrobeur du projet (try/catch autour de chaque accès), seul fichier autorisé.
        exclure: /(^src\/lib\/safe-storage\.ts$|\.(test|spec)\.[jt]sx?$)/,
        message: "accès direct au stockage du navigateur — passer par l'enrobeur sûr (src/lib/safe-storage.ts : try/catch, valeur de repli), jamais localStorage ou sessionStorage en direct",
    },
    {
        id: "police-google",
        incident: "Projet client, oct. 2026 : next/font/google télécharge les polices à chaque build ; le téléchargement échouait par moments en CI — build cassé, puis en-tête d'une page qui débordait de 49 px (police de secours).",
        motif: /next\/font\/google|fonts\.(googleapis|gstatic)\.com/,
        dossiers: ["src"],
        extensions: /\.(m?[jt]sx?|css)$/i,
        message: "police chargée depuis Google — servir la police depuis le dépôt (fichiers dans src/app/fonts + next/font/local), avec sa licence",
    },
    {
        id: "temoignages-demo",
        incident: "Projet client, oct. 2026 (bloquant conformité) : l'accueil retombait sur des témoignages de démonstration dès que la base ne renvoyait aucun avis publié — de faux avis affichés comme réels.",
        // Toute importation d'un fichier de témoignages de démonstration dans le code de l'application.
        motif: /(from\s+|import\(\s*|require\(\s*)['"][^'"]*testimonials?\.seed['"]/,
        dossiers: ["src"],
        extensions: /\.(m?[jt]sx?)$/i,
        exclure: /\.(test|spec)\.[jt]sx?$/,
        message: "témoignages de démonstration importés — n'afficher que des avis réels approuvés ; sans avis, une invitation à en laisser un, jamais un faux témoignage",
    },
    // Non reprises (propres au projet d'origine) : `politique-accents` (mots et chemin de sa politique), `chatbot-formulations`
    // (vocabulaire AMF d'un outil d'éducation financière — exemple d'une règle de vocabulaire par fichier), et une règle
    // propre à une personne.

    {
        id: "date-sans-fuseau",
        incident: "VieSolution, 4 nov. 2026 (issues #394 et #400, après #236 en oct.) : des dates formatées sans fuseau sur le serveur (UTC) — un rendez-vous de 10 h à Montréal annoncé « 15 h » dans les courriels, et des heures décalées de 4 à 5 h dans le tableau de bord.",
        // L'appel peut s'étaler sur plusieurs lignes : on lit l'appel entier (parenthèses équilibrées, 12 lignes au plus).
        motif: (ligne, _rel, i, lignes) => {
            const m = /(\.toLocale(Date|Time)?String|(?:new )?Intl\.DateTimeFormat)\(/.exec(ligne);
            if (!m) return false;
            const suite = (lignes ? lignes.slice(i, i + 12).join("\n") : ligne).slice(m.index + m[0].length - 1);
            let profondeur = 0;
            let fin = suite.length;
            for (let k = 0; k < suite.length; k++) {
                if (suite[k] === "(") profondeur++;
                else if (suite[k] === ")" && --profondeur === 0) { fin = k + 1; break; }
            }
            if (/timeZone/.test(suite.slice(0, fin))) return false;
            if (/^\)\.resolvedOptions\(\)/.test(suite.slice(fin - 1))) return false; // lecture du fuseau du navigateur
            if (m[1].includes("Intl") || m[2]) return true; // DateTimeFormat, toLocaleDateString, toLocaleTimeString
            return /(Date\(|(?<![A-Za-z])date\.)/.test(ligne); // toLocaleString : seulement sur une date (pas un nombre)
        },
        dossiers: CODE,
        extensions: CODE_SOURCE,
        exclure: TESTS,
        message: "date formatée sans fuseau — ajouter timeZone (fuseau du projet, ex. 'America/Toronto') : le serveur tourne en UTC",
    },
    {
        id: "couleur-hors-palette",
        incident: "VieSolution, 6 nov. 2026 (suivi 12z) : 206 couleurs #rrggbb différentes écrites en dur, dont la moitié employées une seule fois — la propriétaire constate des « designs bizarres » ; un bouton s'affichait sans fond faute de couleurs communes.",
        motif: (ligne) => {
            if (!PALETTE) return false;
            for (const m of ligne.matchAll(/(?<![\w/&])#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?\b/g)) {
                if (!PALETTE.has(`#${m[1].toLowerCase()}`)) return true;
            }
            return false;
        },
        dossiers: CODE,
        extensions: /\.(m?[jt]sx?|css|scss|vue|svelte|astro)$/i,
        exclure: TESTS,
        message: "couleur absente de la palette — reprendre une couleur du guide (UI-GUIDE du projet) ; une nouvelle couleur demande l'accord de la personne qui valide, puis s'ajoute au guide et à scripts/couleurs-autorisees.json",
    },
    {
        id: "acces-base-hors-domaine",
        incident: "VieSolution, 6 nov. 2026 (suivi 12z, docs/ARCHITECTURE.md règle 2) : 152 fichiers hors de src/lib/ lisaient ou écrivaient la base eux-mêmes (272 appels dans les seules routes d'API) — une table qui change se corrigeait à des dizaines d'endroits.",
        motif: (ligne, rel) => Boolean(ARCHI?.domaine.length) && !ARCHI.domaine.some((d) => rel.startsWith(d))
            && ACCES_BASE.test(ligne) && !ARCHI.acces.has(rel),
        dossiers: CODE,
        extensions: CODE_SOURCE,
        exclure: TESTS,
        message: "accès direct à la base hors des dossiers du domaine (« dossiers_domaine » de scripts/architecture-existant.json) — écrire (ou réutiliser) une fonction du domaine et l'appeler d'ici",
    },
    {
        id: "fichier-trop-long",
        incident: "VieSolution, 6 nov. 2026 (suivi 12z, docs/ARCHITECTURE.md règle 6) : 79 fichiers de plus de 400 lignes, jusqu'à 2 000 — difficiles à relire et à tester.",
        motif: (_ligne, rel, i, lignes) => i === 0 && Boolean(ARCHI) && Boolean(lignes)
            && nombreDeLignes(lignes) > ARCHI.lignesMax && !ARCHI.longs.has(rel),
        dossiers: CODE,
        extensions: CODE_SOURCE,
        exclure: /(\/data\/|\.(test|spec)\.[a-z]+$|\/__tests__\/)/,
        message: "nouveau fichier trop long (« lignes_max » de scripts/architecture-existant.json, 400 par défaut) — le découper (sous-composants, fonctions) ; les fichiers de données vont dans un dossier data/",
    },

    // ---- Exemples à adapter au projet (décommenter, remplacer les valeurs inventées) ----
    //
    // {
    //     id: "composant-de-base-en-double",
    //     incident: "VieSolution, 6 nov. 2026 (suivi 12z) : Button, Input et Slider existaient en double (src/components/ui et src/shared/ui) ; la règle empêche leur retour.",
    //     motif: /@\/shared\/ui\/(Button|Input|Slider)['"]/,
    //     dossiers: ["src"],
    //     extensions: /\.tsx?$/i,
    //     message: "composant de base en double — importer depuis @/components/ui/",
    // },
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
        if (statSync(dossier).isFile()) { yield dossier; return; } // une entrée de la Fiche peut être un fichier
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
                    const touche = typeof regle.motif === "function" ? regle.motif(ligne, rel, i, lignes) : regle.motif.test(ligne);
                    if (touche) violations.push({ regle, rel, ligne: i + 1, texte: ligne.trim().slice(0, 140) });
                });
            }
        }
    }
    return violations;
}

// Règles écartées par le projet qui appelle (jamais avec --seulement : les tests choisissent eux-mêmes).
if (!args.includes("--seulement")) for (let k = RULES.length - 1; k >= 0; k--) if (ignorer.includes(RULES[k].id)) RULES.splice(k, 1);
if (args.includes("--liste")) {
    console.log(`${RULES.length} règle(s) active(s) :`);
    for (const r of RULES) console.log(`  - ${r.id} [${r.dossiers.join(", ")}] — ${r.incident}`);
    return 0;
}

if (illisibles.length) {
    console.error(`check-rules : ${illisibles.join(" ; ")} — corriger le JSON avant de continuer.`);
    return 1;
}
// --seulement id1,id2 : ne lancer que ces règles (tests des contrôles, indépendants des règles propres au projet).
const iSeul = args.indexOf("--seulement");
if (iSeul >= 0) {
    const ids = new Set(String(args[iSeul + 1] ?? "").split(","));
    for (let k = RULES.length - 1; k >= 0; k--) if (!ids.has(RULES[k].id)) RULES.splice(k, 1);
}
const violations = analyser();
if (!violations.length) {
    console.log(`check-rules : ${RULES.length} règle(s), aucune violation.`);
    return 0;
}
console.error(`\ncheck-rules : ${violations.length} violation(s)\n`);
for (const v of violations) {
    console.error(`  ${v.rel}:${v.ligne}  [${v.regle.id}] ${v.regle.message}`);
    console.error(`      ${v.texte}`);
}
console.error("\nException assumée sur une ligne : commentaire `regle-ok: <id>` avec la raison.\n");
return 1;
}

// Lancé directement (hook pre-commit, Vérification) ; importé par un autre check-rules, il ne lance rien seul.
// Comparaison par chemin réel (lien symbolique, jonction, casse de lecteur sous Windows) : un faux « pas lancé
// directement » ferait sortir le hook en 0 sans rien vérifier.
const memeFichier = (a, b) => {
    try {
        const [x, y] = [realpathSync(a), realpathSync(b)];
        return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
    } catch {
        return false;
    }
};
if (process.argv[1] && memeFichier(path.resolve(process.argv[1]), ICI)) process.exit(lancerReglesCommunes());
