// Fonctions des contrôles mécaniques de la méthode (méthode 1.7.0, reprises de VieSolution-CSF, 14 nov. 2026,
// suivi 14l : « Oui oui je veux des contrôles »). Utilisées par check-qa-trace.mjs, hook-qa-trace.mjs,
// hook-rappel-skills.mjs, check-livraison-pr.mjs et check-taille-diff.mjs ; testées par
// scripts/tests/controles.test.mjs (node --test, lancé en CI). Sans dépendance : Node seul.
//
// Les chemins propres au projet ne sont PAS écrits ici : ils sont lus dans la « Fiche projet » de CLAUDE.md
// (lireConfig), comme le fait check-suivi.js depuis la méthode 1.1.0 :
//   « Dossiers de code »   → code dont un changement compte (seuil qa-agent, suivi exigé à la PR, lignes comptées) ;
//   « Routes publiques »   → où chercher les nouveaux écrans et les pages d'essai de maquette ;
//   « Chemins sensibles »  → un seul fichier suffit à exiger qa-agent (authentification, sécurité, base, argent).
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Utilisés quand la Fiche projet n'est pas remplie (même repli que check-suivi.js). */
export const CODE_DEFAUT = ["src/", "supabase/", ".claude/"];

/**
 * Toujours sensibles, quel que soit le projet : les contrôles eux-mêmes (sinon on pourrait les affaiblir en un
 * commit d'un fichier — revue qa-agent du 14 nov. 2026), la CI et les dépendances.
 */
export const SENSIBLES_COMMUNS = [
    ".githooks/", ".claude/settings.json", ".github/workflows/", "scripts/lib-controles.mjs", "scripts/check-",
    "scripts/hook-", "scripts/tests/", "package.json", "pyproject.toml", "requirements.txt", "composer.json", "Gemfile",
    "go.mod", "Cargo.toml",
];

/** Clés de la Fiche projet lues par les contrôles : les changer change ce que le verrou protège. */
export const CLES_CONTROLES = ["Dossiers de code", "Routes publiques", "Chemins sensibles"];

/** Valeur d'une clé de la Fiche projet (texte de CLAUDE.md) ; null si absente ou non remplie. */
export function valeurFiche(texteClaude, cle) {
    const debut = String(texteClaude).search(/^## Fiche projet\s*$/m);
    if (debut < 0) return null;
    const section = String(texteClaude).slice(debut).split(/\n(?=## )/)[0];
    for (const ligne of section.split("\n")) {
        const c = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(ligne);
        if (c && c[1] === cle) return /<à remplir|^\s*<[^>]*>\s*$|^\s*$/.test(c[2]) ? null : c[2];
    }
    return null;
}

/** Chemins écrits entre accents graves dans une valeur de la fiche (« — » ou rien = liste vide). */
export const chemins = (valeur) => [...String(valeur ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);

/** Configuration des contrôles, à partir du texte de CLAUDE.md (pure : testable sans fichier). */
export function configDepuis(texteClaude) {
    const code = valeurFiche(texteClaude, "Dossiers de code");
    return {
        code: code === null ? CODE_DEFAUT : chemins(code),
        routes: chemins(valeurFiche(texteClaude, "Routes publiques")),
        sensibles: [...SENSIBLES_COMMUNS, ...chemins(valeurFiche(texteClaude, "Chemins sensibles"))],
    };
}

/**
 * La Fiche projet a-t-elle changé sur une clé lue par les contrôles ? Si oui, CLAUDE.md devient un fichier sensible
 * du commit (sinon on pourrait retirer un chemin sensible en un commit de .md, que le verrou ne compte jamais —
 * revue indépendante de la 1.7.0, 24 nov. 2026).
 */
export const ficheModifiee = (avant, apres) => CLES_CONTROLES.some((c) => valeurFiche(avant, c) !== valeurFiche(apres, c));

/** Réunion de plusieurs configurations (Fiche de HEAD, de l'index, du disque) : le plus protecteur l'emporte. */
export const reunir = (...cfgs) => ({
    code: [...new Set(cfgs.flatMap((c) => c.code))],
    routes: [...new Set(cfgs.flatMap((c) => c.routes))],
    sensibles: [...new Set(cfgs.flatMap((c) => c.sensibles))],
});

/** Configuration lue dans CLAUDE.md à la racine du projet (repli sur les valeurs par défaut si illisible). */
export function lireConfig(racine) {
    let texte = "";
    try { texte = readFileSync(join(racine, "CLAUDE.md"), "utf8"); } catch { /* fiche absente : défauts */ }
    return configDepuis(texte);
}

/** `p` est-il dans l'un des dossiers (ou est-il l'un des fichiers) de la liste ? */
export function dansListe(p, liste) {
    return liste.some((c) => (c.endsWith("/") ? p.startsWith(c)
        : p === c || p.startsWith(`${c}/`) || (/[-_]$/.test(c) && p.startsWith(c))
            // nom de fichier seul (ex. `middleware.ts`) : à n'importe quelle profondeur (`src/middleware.ts`)
            || (!c.includes("/") && p.endsWith(`/${c}`))));
}

/** Fichier de méthode (Markdown) : jamais compté pour le seuil qa-agent, jamais exigé dans la trace. */
export const estMethode = (p) => p.endsWith(".md");

/** Fichier sensible : un seul suffit à exiger qa-agent (agent-workflow.md, « Quand ça s'applique »). */
export const estSensible = (p, cfg) => dansListe(p, cfg.sensibles);

/**
 * Le commit exige-t-il une trace qa-agent ? 2 fichiers hors .md, ou 1 fichier sensible. `forces` : fichiers .md
 * traités comme du code (CLAUDE.md quand sa Fiche change, voir ficheModifiee).
 */
export function qaRequis(fichiers, cfg, forces = []) {
    if (fichiers.some((p) => forces.includes(p))) return true;
    const hors = fichiers.filter((p) => !estMethode(p));
    return hors.length >= 2 || hors.some((p) => estSensible(p, cfg));
}

/**
 * Fichiers du commit que la trace ne couvre pas : `indexes` = { chemin: empreinte de l'index ou "supprime" },
 * `trace` = { chemin: empreinte vue par qa-agent }. Les .md ne sont jamais exigés.
 */
export function nonCouverts(indexes, trace, forces = []) {
    return Object.entries(indexes)
        .filter(([p]) => !estMethode(p) || forces.includes(p))
        .filter(([p, empreinte]) => !trace || trace[p] !== empreinte)
        .map(([p]) => p);
}

/** Empreintes (hors .md) qui diffèrent entre deux instantanés { chemin: empreinte } : vide = rien n'a bougé. */
export function changesEntre(avant, apres) {
    const tous = new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})]);
    return [...tous].filter((p) => !estMethode(p) && (avant ?? {})[p] !== (apres ?? {})[p]);
}

/** Dernier verdict du rapport de qa-agent : "OK", "KO" ou null s'il n'y en a pas. */
export function verdictQa(texte) {
    const tous = [...String(texte).matchAll(/VERDICT QA\s*:\s*(OK|KO)\b/g)];
    return tous.length ? tous[tous.length - 1][1] : null;
}

/** Ligne « Dernière mise à jour » du suivi (null si absente). */
export function enteteSuivi(contenu) {
    return String(contenu).split("\n").find((l) => l.includes("Dernière mise à jour")) ?? null;
}

/** Pages d'essai de maquette encore présentes (dossier ou fichier `maquette-*` dans le code ; à supprimer avant la PR). */
export const pagesMaquette = (liste, cfg) =>
    liste.filter((p) => dansListe(p, cfg.code) && /(^|\/)maquette-[^/]+/.test(p));

/** Le diff de la PR touche-t-il du code (hors .md) ? */
export const toucheCode = (liste, cfg) => liste.some((p) => !estMethode(p) && dansListe(p, cfg.code));

/** Nouvel écran : un fichier de page ajouté sous les routes publiques (hors pages d'essai de maquette). */
export const nouveauxEcrans = (ajoutes, cfg) =>
    ajoutes.filter((p) => dansListe(p, cfg.routes) && /(^|\/)\+?page\.(tsx?|jsx?|vue|svelte|astro|mdx?)$/.test(p)
        && pagesMaquette([p], cfg).length === 0);

/**
 * Livraison d'une PR. `diff` = chemins modifiés ; `entetes` = { base, tete } du suivi.
 * Renvoie la liste des manques (vide = conforme).
 */
export function manquesLivraison(diff, entetes, cfg) {
    if (!toucheCode(diff, cfg)) return [];
    const manques = [];
    if (!diff.includes("SUIVI-TACHES.md")) manques.push("SUIVI-TACHES.md n'a pas d'entrée pour ce travail");
    else if (!entetes?.tete || entetes.tete === entetes.base)
        manques.push("l'en-tête « Dernière mise à jour » de SUIVI-TACHES.md n'a pas été rafraîchi");
    if (!diff.includes("docs/ETAT-ACTUEL.md")) manques.push("docs/ETAT-ACTUEL.md n'est pas à jour");
    return manques;
}

/** Mots cherchés dans le suivi pour un fichier : le chemin, le nom sans extension, le dossier parent. */
export function motsDuFichier(chemin) {
    const segments = chemin.split("/");
    const nom = segments[segments.length - 1].replace(/\.[^.]+$/, "");
    const parent = segments.length > 1 ? segments[segments.length - 2] : "";
    const generiques = new Set(["src", "app", "lib", "components", "page", "index", "route", "layout", "utils", "api"]);
    return [chemin, nom, parent].filter((m) => m && m.length >= 4 && !generiques.has(m) && !/^\[.*\]$/.test(m));
}

/**
 * Au plus `max` sections du suivi qui citent le fichier : titre, skills citées, numéro pour la relire.
 * Classement : nombre de mentions, puis la plus récente (plus bas dans le fichier).
 */
export function sectionsSemblables(suivi, chemin, max = 3) {
    const mots = motsDuFichier(chemin);
    if (!mots.length) return [];
    const sections = [];
    let courante = null;
    String(suivi).split("\n").forEach((ligne, i) => {
        const titre = /^## (\d+[a-z]?)\. (.*)$/.exec(ligne);
        if (titre) {
            courante = { num: titre[1], titre: titre[2], ordre: i, hits: 0, skills: new Set() };
            sections.push(courante);
        }
        if (!courante) return;
        // le chemin exact pèse plus qu'un nom de dossier ou de fichier
        if (ligne.includes(chemin)) courante.hits += 3;
        else if (mots.some((m) => ligne.includes(m))) courante.hits += 1;
        const s = /skills? ((?:`[a-z][a-z0-9:-]*`(?:,| et| puis)? ?)+)/i.exec(ligne);
        if (s) for (const m of s[1].matchAll(/`([a-z][a-z0-9:-]*)`/g)) courante.skills.add(m[1]);
    });
    return sections
        .filter((s) => s.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.ordre - a.ordre)
        .slice(0, max)
        .map((s) => ({ num: s.num, titre: s.titre.slice(0, 110), skills: [...s.skills] }));
}

/** Fichier de code compté par « moins de code » : dans les dossiers de code, extension de code, hors tests et données. */
export const estCodeCompte = (p, cfg) =>
    !p.startsWith(".claude/") && dansListe(p, cfg.code) && /\.(tsx?|jsx?|mjs|cjs|css|scss|sql|py|rb|php|vue|svelte|astro)$/.test(p)
    && !/(\/data\/|\/__tests__\/|\.(test|spec)\.[a-z]+$)/.test(p);
