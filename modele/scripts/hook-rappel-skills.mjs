#!/usr/bin/env node
// Hook Claude Code PostToolUse (Edit | Write | MultiEdit), .claude/settings.json — méthode 1.7.0, repris de
// VieSolution-CSF (scripts/hook-rappel-skills.mjs, 14 nov. 2026, suivi 14l). Demande de Camille : « il peut y avoir
// des tâches déjà faites et on s'en inspire ».
// À la première modification d'un dossier de code (« Dossiers de code » de la Fiche projet, hors .md) dans la session :
//   - rappel court si aucune skill n'a été chargée (outil Skill) dans la session ni dans l'agent en cours ;
//   - au plus 3 tâches semblables du suivi (recherche ciblée sur le fichier, jamais lecture en entier par l'agent).
// Une fois par dossier et par session (marque dans le dossier temporaire). Ne bloque rien, n'échoue jamais.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { dansListe, estMethode, lireConfig, sectionsSemblables } from "./lib-controles.mjs";

const lire = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const SKILL_CHARGEE = /"name":"Skill"|Launching skill:/;

try {
    const e = JSON.parse(readFileSync(0, "utf8"));
    // racine du projet, même si la session travaille dans un sous-dossier (revue qa-agent du 14 nov. 2026)
    const racine = process.env.CLAUDE_PROJECT_DIR ||
        execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: e.cwd || process.cwd(), encoding: "utf8" }).trim();
    const cible = e.tool_input?.file_path ?? "";
    const chemin = relative(racine, isAbsolute(cible) ? cible : join(e.cwd || racine, cible)).split("\\").join("/");
    if (chemin.startsWith("..") || estMethode(chemin) || !dansListe(chemin, lireConfig(racine).code)) process.exit(0);

    const marque = join(tmpdir(), `methode-rappel-${e.session_id ?? "x"}.json`);
    const vus = existsSync(marque) ? JSON.parse(lire(marque) || "[]") : [];
    const dossier = dirname(chemin);
    if (vus.includes(dossier)) process.exit(0);
    writeFileSync(marque, JSON.stringify([...vus, dossier]));

    const morceaux = [];
    // Journal de l'agent en cours : …/<session>/subagents/agent-<id>.jsonl, à côté du journal principal.
    const journalAgent = e.agent_id && e.transcript_path
        ? join(dirname(e.transcript_path), basename(e.transcript_path, ".jsonl"), "subagents", `agent-${e.agent_id}.jsonl`)
        : "";
    const fichierAgent = e.agent_type ? lire(join(racine, ".claude/agents", `${e.agent_type}.md`)) : "";
    const skillsPrechargees = /^skills:\s*(\[\s*[^\]\s]|\n\s*-\s*\S)/m.test(fichierAgent); // [a, b] ou liste YAML
    if (vus.length === 0 && !skillsPrechargees && !SKILL_CHARGEE.test(lire(e.transcript_path ?? "") + lire(journalAgent))) {
        morceaux.push("Rappel : aucune skill chargée dans cette tâche. Skill `tache` étape 3 : choisir au registre " +
            "(.claude/skills/REGISTRE.md) et charger la skill avec l'outil Skill avant de continuer.");
    }
    const semblables = sectionsSemblables(lire(join(racine, "SUIVI-TACHES.md")), chemin);
    if (semblables.length) {
        morceaux.push(`Tâches déjà faites sur ${chemin} (s'en inspirer, réutiliser plutôt que refaire) :\n` +
            semblables.map((s) => `- ${s.num}. ${s.titre}${s.skills.length ? ` — skills : ${s.skills.join(", ")}` : ""}`).join("\n") +
            `\nLire une entrée : grep -n "^## <num>\\." SUIVI-TACHES.md, puis lecture ciblée (jamais le suivi en entier).`);
    }
    if (morceaux.length) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: morceaux.join("\n\n") },
        }) + "\n");
    }
} catch {
    // un rappel manqué ne bloque jamais
}
process.exit(0);
