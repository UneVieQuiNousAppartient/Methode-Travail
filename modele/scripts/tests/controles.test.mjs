// Tests des contrôles mécaniques — méthode 1.7.0, repris de VieSolution-CSF (scripts/tests/controles.test.mjs,
// 14 nov. 2026, suivi 14l) et étendus aux chemins lus dans la Fiche projet. Lancés en CI :
// node --test scripts/tests/controles.test.mjs
// Pour chaque contrôle : un cas bloqué et un cas qui passe. Les scripts sont lancés pour de vrai dans un dépôt
// Git temporaire (hooks, CI), les fonctions pures sont testées directement.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    configDepuis, dansListe, ficheModifiee, manquesLivraison, nonCouverts, nouveauxEcrans, pagesMaquette, qaRequis, sectionsSemblables, valeurFiche,
    verdictQa,
} from "../lib-controles.mjs";
import { analyser as analyserTaille } from "../check-taille-diff.mjs";
import { classer, versionDe } from "../comparer-methode.mjs";

// Fiche projet d'un projet type (les chemins ne sont plus écrits dans les scripts : ils viennent d'ici).
const FICHE = `# Projet
## Fiche projet

| Clé | Valeur |
|---|---|
| Dossiers de code | \`src/\`, \`supabase/\` |
| Routes publiques | \`src/app/\` |
| Chemins sensibles | \`src/lib/auth/\`, \`middleware.ts\` |

## Conventions
`;
const CFG = configDepuis(FICHE);

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const lancer = (script, entree, opts = {}) =>
    spawnSync("node", [join(SCRIPTS, script), ...(opts.args ?? [])], {
        input: entree === undefined ? "" : typeof entree === "string" ? entree : JSON.stringify(entree),
        cwd: opts.cwd, encoding: "utf8", env: { ...process.env, ...opts.env },
    });

const temporaires = [];
after(() => { for (const t of temporaires) rmSync(t, { recursive: true, force: true }); });

function depot() {
    const d = mkdtempSync(join(tmpdir(), "controles-"));
    temporaires.push(d, `${d}-wt`);
    const g = (...a) => execFileSync("git", a, { cwd: d, encoding: "utf8" });
    g("init", "-q", "-b", "main");
    g("config", "user.email", "test@example.com");
    g("config", "user.name", "test");
    const ecrire = (p, c) => { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); };
    ecrire("CLAUDE.md", FICHE);
    ecrire("SUIVI-TACHES.md", "**Dernière mise à jour : 13 novembre 2026**\n");
    ecrire("docs/ETAT-ACTUEL.md", "état\n");
    g("add", "-A");
    g("commit", "-qm", "base");
    return { d, g, ecrire };
}

// ── Contrôle 1 : qa-agent ──────────────────────────────────────────────────────────────────────────────────
test("Fiche projet : valeurs lues, non remplies ignorées, repli sur les défauts", () => {
    assert.equal(valeurFiche(FICHE, "Routes publiques"), "`src/app/`");
    assert.equal(valeurFiche("## Fiche projet\n| Dossiers de code | <à remplir : ex.> |\n", "Dossiers de code"), null);
    assert.deepEqual(CFG.code, ["src/", "supabase/"]);
    assert.deepEqual(configDepuis("").code, ["src/", "supabase/", ".claude/"], "fiche absente : défauts de check-suivi");
    assert.deepEqual(configDepuis("## Fiche projet\n| Dossiers de code | `app/` |\n| Routes publiques | — |\n").routes, []);
});

test("listes de la fiche : dossiers, fichiers exacts, nom de fichier à toute profondeur, préfixe", () => {
    assert.equal(dansListe("src/a.ts", ["src/"]), true);
    assert.equal(dansListe("src2/a.ts", ["src/"]), false);
    assert.equal(dansListe("supabase/x.sql", ["supabase"]), true, "dossier sans / final");
    assert.equal(dansListe("supabase-old/x.sql", ["supabase"]), false);
    assert.equal(dansListe("src/middleware.ts", ["middleware.ts"]), true, "nom seul : toute profondeur");
    assert.equal(dansListe("src/lib/middleware.ts.bak", ["middleware.ts"]), false);
    assert.equal(dansListe("src/app/x.ts", ["src/app/x.ts"]), true, "fichier exact");
    assert.equal(dansListe("scripts/check-rules.mjs", ["scripts/check-"]), true, "préfixe terminé par -");
    assert.deepEqual(configDepuis("## Fiche projet\n| Chemins sensibles | src/lib/auth/ |\n").sensibles.length,
        configDepuis("").sensibles.length, "sans accents graves : ignoré (verifier-methode le signale)");
});

test("seuil qa-agent : 2 fichiers hors .md ou 1 sensible ; les .md seuls passent", () => {
    assert.equal(qaRequis(["src/a.ts", "src/b.ts"], CFG), true);
    assert.equal(qaRequis(["middleware.ts"], CFG), true);
    assert.equal(qaRequis(["src/lib/auth/session.ts"], CFG), true, "chemin sensible de la fiche");
    assert.equal(qaRequis(["src/a.ts", "docs/x.md", "SUIVI-TACHES.md"], CFG), false);
    assert.equal(qaRequis([".claude/rules/a.md", ".claude/skills/b/SKILL.md"], CFG), false);
    for (const p of [".githooks/pre-commit", ".claude/settings.json", "scripts/check-qa-trace.mjs", "scripts/hook-garde-git.mjs",
        ".github/workflows/ci.yml", "scripts/tests/controles.test.mjs", "scripts/lib-controles.mjs", "package.json"]) {
        assert.equal(qaRequis([p], CFG), true, p);
    }
    assert.equal(qaRequis(["src/app/page.tsx"], CFG), false);
    assert.equal(qaRequis(["src/lib/auth/x.ts"], configDepuis("")), false, "sans fiche : seuls les sensibles communs");
});

test("verrou : la Fiche projet modifiée (sur disque, à l'index ou dans le commit) ne retire aucune protection", () => {
    const { d, g, ecrire } = depot();
    const claude = { CLAUDECODE: "1" };
    const verrou = () => lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status;
    ecrire("src/lib/auth/x.ts", "x\n");
    g("add", "src/lib/auth/x.ts");
    assert.equal(verrou(), 1, "fichier sensible seul : refusé");
    const sansSensibles = FICHE.replace(/\| Chemins sensibles \|.*\|/, "| Chemins sensibles | — |");
    ecrire("CLAUDE.md", sansSensibles);
    assert.equal(verrou(), 1, "Fiche modifiée sur le disque seulement : toujours refusé");
    g("add", "CLAUDE.md");
    assert.equal(verrou(), 1, "Fiche modifiée dans le même commit : toujours refusé");
    g("reset", "-q", "src/lib/auth/x.ts");
    assert.equal(verrou(), 1, "commit de CLAUDE.md seul qui change la Fiche : exige qa-agent");
    assert.equal(ficheModifiee(FICHE, FICHE + "\nautre texte\n"), false, "texte hors des clés lues : libre");
    assert.equal(ficheModifiee(FICHE, sansSensibles), true);
});

test("verdict qa-agent : le dernier compte", () => {
    assert.equal(verdictQa("… VERDICT QA : KO … puis corrigé\nVERDICT QA : OK"), "OK");
    assert.equal(verdictQa("VERDICT QA: KO"), "KO");
    assert.equal(verdictQa("tout va bien"), null);
});

test("couverture : un fichier modifié après qa-agent n'est plus couvert", () => {
    assert.deepEqual(nonCouverts({ "a.ts": "1", "b.ts": "2", "c.md": "9" }, { "a.ts": "1", "b.ts": "2" }), []);
    assert.deepEqual(nonCouverts({ "a.ts": "1", "b.ts": "3" }, { "a.ts": "1", "b.ts": "2" }), ["b.ts"]);
    assert.deepEqual(nonCouverts({ "a.ts": "1" }, null), ["a.ts"]);
});

test("pre-commit : refusé sans trace, accepté après qa-agent OK, refusé si modifié après, KO n'écrit rien", () => {
    const { d, g, ecrire } = depot();
    ecrire("src/a.ts", "a\n");
    ecrire("src/b.ts", "b\n");
    g("add", "-A");
    const claude = { CLAUDECODE: "1" };
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 1, "sans trace : refusé");
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: { CLAUDECODE: "" } }).status, 0, "hors Claude : averti");

    const journal = join(d, "agent.jsonl");
    const rapport = (t) => writeFileSync(journal, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: t }] } }) + "\n");
    const evt = (hook_event_name, type = "qa-agent", cwd = d) =>
        lancer("hook-qa-trace.mjs", { hook_event_name, agent_type: type, agent_id: "x", cwd, agent_transcript_path: journal });
    const debut = (cwd) => evt("SubagentStart", "qa-agent", cwd);
    const fin = (type = "qa-agent", cwd = d) => evt("SubagentStop", type, cwd);

    rapport("Problème trouvé.\nVERDICT QA : KO");
    debut();
    fin();
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 1, "KO : toujours refusé");

    rapport("Tout est vérifié.\nVERDICT QA : OK");
    debut();
    fin("ux-agent");
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 1, "autre agent : pas de trace");

    debut();
    ecrire("src/a.ts", "modifié pendant la revue\n");
    assert.match(fin().stdout, /changé pendant la revue/);
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 1, "modifié pendant la revue : refusé");

    ecrire("src/a.ts", "a\n");
    debut();
    fin();
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 0, "qa-agent OK : accepté");

    ecrire("src/b.ts", "b modifié après la QA\n");
    g("add", "-A");
    const r = lancer("check-qa-trace.mjs", "", { cwd: d, env: claude });
    assert.equal(r.status, 1, "modifié après qa-agent : refusé");
    assert.match(r.stderr, /src\/b\.ts/);

    g("rm", "-q", "--cached", "src/a.ts");
    execFileSync("rm", [join(d, "src/a.ts")]);
    debut();
    fin();
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 0, "suppression vérifiée : acceptée");

    g("commit", "-qm", "étape");
    g("mv", "src/b.ts", "src/renomme.ts");
    ecrire("src/c d.ts", "espace\n");
    g("add", "-A");
    debut();
    fin();
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: d, env: claude }).status, 0, "renommage et espace : acceptés");

    const wt = `${d}-wt`;
    g("worktree", "add", "-q", wt, "-b", "wt");
    writeFileSync(join(wt, "src/x.ts"), "x\n");
    writeFileSync(join(wt, "src/y.ts"), "y\n");
    execFileSync("git", ["add", "-A"], { cwd: wt });
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: wt, env: claude }).status, 1, "worktree sans trace : refusé");
    debut(wt);
    assert.match(fin("qa-agent", wt).stdout, /trace écrite/);
    assert.equal(lancer("check-qa-trace.mjs", "", { cwd: wt, env: claude }).status, 0, "worktree : trace écrite et lue");
});

// ── Socle : garde Git ──────────────────────────────────────────────────────────────────────────────────────
test("garde Git : sauter les contrôles est refusé, le reste passe", () => {
    const refuse = (c) => /"deny"/.test(lancer("hook-garde-git.mjs", { tool_input: { command: c } }).stdout);
    for (const c of ["git commit --no-verify -m x", "git commit -nm x", "git push --no-verify",
        "git -c core.hooksPath=/dev/null commit -m x", "git config core.hooksPath /tmp",
        "echo {} > .git/qa-verifie.json", "cp x .git/qa-verifie.json", "rm .git/qa-verifie.json",
        "git config --unset core.hooksPath", "git config --local --unset-all core.hooksPath", "git commit --no-verif -m x",
        "git config core.hooksPath .githooks-off", "cd x && git commit --no-verify", "sed -i s/a/b/ .git/qa-debut.json",
        "node -e 'require(\"fs\").writeFileSync(\".git/qa-verifie.json\",\"{}\")'",
        // 2e revue qa-agent : message multi-ligne ou avec ; | avant l'option, lancement manuel du hook, -C, chemin complet
        "git commit -m \"$(cat <<'EOF'\nTitre\n\nCorps\nEOF\n)\" --no-verify", "git commit -m \"fix; suite\" --no-verify",
        "git commit -m 'a|b' -n", "echo '{}' | node scripts/hook-qa-trace.mjs", "node /x/scripts/hook-qa-trace.mjs < e.json",
        "git -C /home/user/projet commit -n -m x", "/usr/bin/git commit --no-verify -m x", "\\git commit --no-verify -m x",
        "git config --remove-section core", "git --config-env=core.hooksPath=X commit -m x",
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit -m x",
        "git config unset core.hooksPath"]) {
        assert.equal(refuse(c), true, c);
    }
    for (const c of ["git commit -m \"ajout du lien\"", "git push -u origin x", "git config core.hooksPath .githooks",
        "git config core.hooksPath", "cat .git/qa-verifie.json", "grep -rn qa-verifie scripts 2>&1", "npm run verify",
        "cat > note.md <<'FIN'\nle mot --no-verify dans un texte\nFIN", "grep -i qa-verifie scripts",
        "git status 2>/dev/null; cat .git/qa-verifie.json", "git diff > /tmp/x && grep qa-verifie /tmp/x",
        "git commit -m \"fix: ajout -n dans le log\"", "git log --grep commit -n 3", "git config --get core.hooksPath",
        "node scripts/hook-garde-git.mjs < x.json; git commit -m ok",
        "node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(\".git/qa-debut.json\")))'",
        "git commit -m \"$(cat <<'EOF'\nTitre ; avec | et -n\nEOF\n)\"", "grep -n hook-qa-trace .claude/settings.json",
        "git -C /home/user/projet status", "git config set core.hooksPath .githooks"]) {
        assert.equal(refuse(c), false, c);
    }
});

// ── Contrôle 2 : skills et tâches semblables ───────────────────────────────────────────────────────────────
const SUIVI = `## 14e. ✅ Page Rendez-vous : onglets (13 nov.)
Fait (skills \`tache\`, \`frontend-design\`) : src/app/dashboard/rendez-vous/page.tsx
## 14f. ✅ #469 rendez-vous suivent le conseiller
RendezVousPanel modifié dans rendez-vous.
## 14g. ✅ Autre chose
rien`;

test("tâches semblables : trouvées par le fichier, avec les skills, au plus 3", () => {
    const s = sectionsSemblables(SUIVI, "src/app/dashboard/rendez-vous/page.tsx");
    assert.deepEqual(s.map((x) => x.num), ["14e", "14f"]);
    assert.deepEqual(s[0].skills, ["tache", "frontend-design"]);
    assert.deepEqual(sectionsSemblables(SUIVI, "src/app/inconnu/page.tsx"), []);
});

test("hook de rappel : rappel sans skill et tâches semblables, une fois par dossier ; muet hors des dossiers de code", () => {
    const { d, ecrire } = depot();
    ecrire("SUIVI-TACHES.md", SUIVI);
    mkdirSync(join(d, "src"));
    ecrire(".claude/agents/diagnostic-agent.md", "---\nname: diagnostic-agent\nskills:\n  - tester-dabord\n---\n");
    const journal = join(d, "t.jsonl");
    writeFileSync(journal, "{}\n");
    const s = `test-${process.pid}-${Date.now()}`;
    const sessions = [];
    const rappel = (f, suffixe, extra = {}) => {
        sessions.push(`${s}${suffixe}`);
        const r = lancer("hook-rappel-skills.mjs", { cwd: d, session_id: `${s}${suffixe}`, transcript_path: journal,
            tool_input: { file_path: join(d, f) }, ...extra }, { env: { CLAUDE_PROJECT_DIR: "" } });
        return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
    };
    try {
        const ctx = rappel("src/app/dashboard/rendez-vous/page.tsx", "a");
        assert.match(ctx, /aucune skill chargée/);
        assert.match(ctx, /14e\./);
        assert.equal(rappel("src/app/dashboard/rendez-vous/autre.tsx", "a"), "", "même dossier : une seule fois");
        assert.equal(rappel("docs/a.md", "b"), "", "hors des dossiers de code : muet");
        assert.equal(rappel("autre/x.ts", "b2"), "", "dossier absent de la fiche : muet");
        assert.match(rappel("src/x", "c", { cwd: join(d, "src"), tool_input: { file_path: "app/dashboard/rendez-vous/page.tsx" } }),
            /14e\./, "depuis un sous-dossier, chemin relatif");
        assert.doesNotMatch(rappel("src/app/dashboard/rendez-vous/page.tsx", "d", { agent_type: "diagnostic-agent" }),
            /aucune skill/, "skills préchargées en liste YAML");
        writeFileSync(journal, '{"message":{"content":[{"type":"tool_use","name":"Skill"}]}}\n');
        assert.doesNotMatch(rappel("src/app/dashboard/rendez-vous/page.tsx", "e"), /aucune skill/, "skill chargée");
    } finally {
        for (const id of sessions) rmSync(join(tmpdir(), `methode-rappel-${id}.json`), { force: true });
    }
});

// ── Contrôles 3 et 4 : maquettes, suivi à la PR, seuil des documents ───────────────────────────────────────
test("maquettes et nouveaux écrans", () => {
    assert.deepEqual(pagesMaquette(["src/app/maquette-accueil/page.tsx", "src/app/a/maquette-x.tsx", "src/app/maquettes.ts",
        "docs/maquette-x.md"], CFG), ["src/app/maquette-accueil/page.tsx", "src/app/a/maquette-x.tsx"]);
    assert.deepEqual(nouveauxEcrans(["src/app/a/page.tsx", "src/app/page.tsx", "src/app/x/homepage.tsx", "src/app/maquette-b/page.tsx",
        "src/components/page.tsx", "src/app/b/+page.svelte"], CFG), ["src/app/a/page.tsx", "src/app/page.tsx", "src/app/b/+page.svelte"]);
    assert.deepEqual(nouveauxEcrans(["src/app/a/page.tsx"], configDepuis("")), [], "sans routes publiques : aucun écran");
});

test("livraison : code sans suivi refusé ; en-tête inchangé refusé ; complet accepté ; docs seules acceptées", () => {
    const e = { base: "13 nov.", tete: "14 nov." };
    assert.equal(manquesLivraison(["src/a.ts"], e, CFG).length, 2);
    assert.equal(manquesLivraison(["src/a.ts", "SUIVI-TACHES.md", "docs/ETAT-ACTUEL.md"], { base: "x", tete: "x" }, CFG).length, 1);
    assert.deepEqual(manquesLivraison(["src/a.ts", "SUIVI-TACHES.md", "docs/ETAT-ACTUEL.md"], e, CFG), []);
    assert.deepEqual(manquesLivraison(["docs/a.md", "scripts/x.mjs", "src/notes.md"], e, CFG), []);
});

test("check-livraison-pr : PR réelle refusée puis acceptée ; maquette et nouvel écran avertis", () => {
    const { d, g, ecrire } = depot();
    g("checkout", "-qb", "travail");
    ecrire("src/app/neuf/page.tsx", "x\n");
    ecrire("src/app/maquette-neuf/page.tsx", "x\n");
    g("add", "-A");
    g("commit", "-qm", "code");
    let r = lancer("check-livraison-pr.mjs", "", { cwd: d, args: ["--base", "main"] });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SUIVI-TACHES\.md/);
    assert.match(r.stdout, /maquette-neuf/);
    assert.match(r.stdout, /nouvel écran/);

    ecrire("SUIVI-TACHES.md", "**Dernière mise à jour : 14 novembre 2026**\n## 1. ✅ x\n");
    ecrire("docs/ETAT-ACTUEL.md", "état à jour\n");
    g("add", "-A");
    g("commit", "-qm", "suivi");
    r = lancer("check-livraison-pr.mjs", "", { cwd: d, args: ["--base", "main"] });
    assert.equal(r.status, 0, r.stderr);
});

// ── Moins de code ──────────────────────────────────────────────────────────────────────────────────────────
test("taille du diff : code compté selon la fiche ; fichier long qui grossit et gros ajout sans retrait avertis", () => {
    const z = (lignes) => lignes.map(([a, r, p]) => `${a}\t${r}\t${p}`).join("\0") + "\0";
    let r = analyserTaille(z([["30", "5", "src/a.tsx"], ["900", "0", "src/a.test.ts"], ["50", "0", "docs/x.md"], ["-", "-", "src/i.png"]]),
        new Set(), CFG);
    assert.deepEqual([r.ajouts, r.retraits, r.avertissements.length], [30, 5, 0]);
    r = analyserTaille(z([["20", "2", "src/long.tsx"]]), new Set(["src/long.tsx"]), CFG);
    assert.match(r.avertissements[0], /déjà trop long/);
    r = analyserTaille(z([["700", "10", "src/neuf.tsx"], ["99", "0", "autre/x.ts"]]), new Set(), CFG);
    assert.deepEqual([r.ajouts, r.avertissements.length], [700, 1]);
    r = analyserTaille("5\t1\t\0src/ancien.ts\0src/nouveau.ts\0", new Set(), CFG);
    assert.equal(r.ajouts, 5, "renommage");
});

// ── Règles d'architecture de check-rules ────────────────────────────────────────────────────────────────────
test("check-rules : règles d'architecture actives seulement avec leurs listes ; liste illisible = échec", () => {
    const { d, g, ecrire } = depot();
    // --seulement : le test ne dépend pas des règles propres au projet qui a copié ce fichier.
    const regles = () => spawnSync("node", [join(SCRIPTS, "check-rules.mjs"), "--racine", d, "--seulement",
        "date-sans-fuseau,couleur-hors-palette,acces-base-hors-domaine,fichier-trop-long"], { encoding: "utf8" });
    ecrire("src/app/a.tsx", "const c = '#123456';\nconst x = supabase.from('clients').select();\n" + "// l\n".repeat(450));
    ecrire("src/lib/clients.ts", "export const lire = () => supabase.from('clients').select();\n");
    ecrire("src/lib/date.ts", "export const h = (d) => d.toLocaleTimeString('fr-CA', {\n  hour: '2-digit',\n});\n");
    ecrire("src/lib/date-ok.ts", "export const h = (d) => d.toLocaleTimeString('fr-CA', {\n  timeZone: 'America/Toronto',\n});\n");
    g("add", "-A");
    let r = regles();
    assert.equal(r.status, 1, "date sans fuseau : toujours active");
    assert.match(r.stderr, /src\/lib\/date\.ts:1.*date-sans-fuseau/);
    assert.doesNotMatch(r.stderr, /date-ok|couleur-hors-palette|acces-base|fichier-trop-long/, "sans listes : règles d'architecture inactives");

    ecrire("src/lib/date.ts", "export const h = 1;\n");
    ecrire("scripts/couleurs-autorisees.json", JSON.stringify({ couleurs: ["#ABCDEF"] }));
    ecrire("scripts/architecture-existant.json", JSON.stringify({ dossiers_domaine: ["src/lib/"], acces_base: [], fichiers_longs: [] }));
    g("add", "-A");
    r = regles();
    assert.equal(r.status, 1);
    for (const id of ["couleur-hors-palette", "acces-base-hors-domaine", "fichier-trop-long"]) assert.match(r.stderr, new RegExp(`src/app/a\\.tsx:\\d+ +\\[${id}\\]`), id);
    assert.doesNotMatch(r.stderr, /src\/lib\/clients/, "accès dans le domaine : permis");

    ecrire("scripts/couleurs-autorisees.json", JSON.stringify({ couleurs: ["#123456"] }));
    ecrire("scripts/architecture-existant.json", JSON.stringify({ dossiers_domaine: ["src/lib/"], acces_base: ["src/app/a.tsx"], fichiers_longs: ["src/app/a.tsx"] }));
    r = regles();
    assert.equal(r.status, 0, `infractions existantes tolérées : ${r.stderr}`);

    ecrire("scripts/couleurs-autorisees.json", "{ pas du JSON");
    r = regles();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /couleurs-autorisees\.json illisible/);
});

// ── consentement-precoche et appel depuis le check-rules d'un projet (méthode 1.7.2, cas de KHI Educ) ─────────────
test("check-rules : consentement précoché bloqué ; consent: true envoyé au serveur après la case cochée : permis", () => {
    const { d, g, ecrire } = depot();
    const regle = () => spawnSync("node", [join(SCRIPTS, "check-rules.mjs"), "--racine", d, "--seulement", "consentement-precoche"], { encoding: "utf8" });
    ecrire("src/app/Formulaire.tsx", "const [consent, setConsent] = useState(false);\nconst envoyer = () => fetch('/api/x', {\n  method: 'POST',\n  body: JSON.stringify({\n    nom,\n    consent: true,\n  }),\n});\n");
    g("add", "-A");
    let r = regle();
    assert.equal(r.status, 0, `corps de requête : permis (${r.stderr})`);
    ecrire("src/app/Precoche.tsx", "const etatInitial = {\n  body: '', // champ « message » d'un formulaire : pas un corps de requête\n  consent: true,\n};\nconst [ok] = useState(true); // consentement\n");
    g("add", "-A");
    r = regle();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Precoche\.tsx:3 +\[consentement-precoche\]/, "état initial à true : bloqué");
    assert.doesNotMatch(r.stderr, /Formulaire\.tsx/);
});

test("check-rules : importé par le check-rules d'un projet, ne lance rien seul ; règles écartées respectées", async () => {
    const { lancerReglesCommunes } = await import(join(SCRIPTS, "check-rules.mjs"));
    assert.equal(typeof lancerReglesCommunes, "function", "l'import ne lance pas l'analyse (sinon le test sortirait)");
    const { d, g, ecrire } = depot();
    ecrire("src/lib/date.ts", "export const h = (d) => d.toLocaleTimeString('fr-CA');\n");
    g("add", "-A");
    const projet = join(d, "check-projet.mjs");
    writeFileSync(projet, `import { lancerReglesCommunes } from ${JSON.stringify(join(SCRIPTS, "check-rules.mjs"))};\n`
        + `process.exit(lancerReglesCommunes(["--racine", ${JSON.stringify(d)}], process.argv.slice(2)));\n`);
    assert.equal(spawnSync("node", [projet], { encoding: "utf8" }).status, 1, "règle commune active : bloque");
    assert.equal(spawnSync("node", [projet, "date-sans-fuseau"], { encoding: "utf8" }).status, 0, "règle écartée par le projet");
});

// ── Comparaison projet ↔ modèle ─────────────────────────────────────────────────────────────────────────────
test("comparer-methode : identiques, absents, communs différents, à adapter, propres au projet", () => {
    const r = classer(
        { "scripts/a.mjs": "x\n", "scripts/b.mjs": "y", "CLAUDE.md": "gabarit", "scripts/c.mjs": "z" },
        { "scripts/a.mjs": "x\r\n", "scripts/b.mjs": "y modifié", "CLAUDE.md": "projet", "scripts/propre.mjs": "p", "src/x.ts": "s" },
    );
    assert.deepEqual(r.identiques, ["scripts/a.mjs"], "fins de ligne Windows ignorées");
    assert.deepEqual(r.absents, ["scripts/c.mjs"]);
    assert.deepEqual(r.communsDifferents, ["scripts/b.mjs"]);
    assert.deepEqual(r.aAdapter, ["CLAUDE.md"]);
    assert.deepEqual(r.propres, ["scripts/propre.mjs"]);
    assert.equal(versionDe("**Méthode** : x\nMéthode : version 1.2.0\n"), "1.2.0");
    assert.equal(versionDe("1.7.0\n"), "1.7.0");
    assert.equal(versionDe("Méthode : version <X>"), null);
});
