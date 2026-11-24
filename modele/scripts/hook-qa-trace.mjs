#!/usr/bin/env node
// Hooks Claude Code SubagentStart + SubagentStop (.claude/settings.json, matcher qa-agent) — méthode 1.7.0, repris de
// VieSolution-CSF (scripts/hook-qa-trace.mjs, 14 nov. 2026, suivi 14l). Verrou mécanique de qa-agent :
// - Au départ de qa-agent : instantané des empreintes Git des fichiers modifiés (.git/qa-debut.json).
// - À sa fin, avec « VERDICT QA : OK » ET aucun fichier (hors .md) changé depuis le départ : la trace
//   .git/qa-verifie.json reçoit ces empreintes. Le hook pre-commit (scripts/check-qa-trace.mjs) refuse ensuite un
//   commit dont un fichier n'a pas cette empreinte. Un fichier modifié pendant la revue invalide le verdict (revue
//   qa-agent du 14 nov. 2026 : la trace couvrait sinon du code jamais relu).
// C'est Claude Code qui lance ce script, pas l'agent principal ; vérifié le 14 nov. 2026 (Claude Code 2.1.325) :
// l'entrée porte hook_event_name, agent_type et agent_transcript_path. N'échoue jamais (code 0).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changesEntre, verdictQa } from "./lib-controles.mjs";

const git = (args, cwd, input) => execFileSync("git", args, { cwd, encoding: "utf8", input });

/** { chemin: empreinte | "supprime" } de tout ce qui diffère de HEAD (index, copie de travail, non suivis). */
function instantane(racine) {
    const chemins = git(["status", "--porcelain", "-uall", "-z", "--no-renames"], racine)
        .split("\0").filter(Boolean).map((l) => l.slice(3));
    const presents = chemins.filter((p) => existsSync(join(racine, p)));
    // Un seul appel pour toutes les empreintes (mêmes filtres que l'index : fins de ligne comprises).
    const empreintes = presents.length ? git(["hash-object", "--stdin-paths"], racine, presents.join("\n")).trim().split("\n") : [];
    const fichiers = Object.fromEntries(chemins.map((p) => [p, "supprime"]));
    presents.forEach((p, n) => { fichiers[p] = empreintes[n]; });
    return fichiers;
}

/** Texte du dernier message de l'agent qui porte un verdict : blocs texte et rapport remis (SubagentHandback). */
function dernierRapport(chemin) {
    for (const l of readFileSync(chemin, "utf8").trim().split("\n").reverse()) {
        let j;
        try { j = JSON.parse(l); } catch { continue; }
        if (j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
        const texte = j.message.content
            .map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? b.input?.message ?? "" : ""))
            .join("\n");
        if (verdictQa(texte)) return texte;
    }
    return "";
}

const dire = (message) => process.stdout.write(JSON.stringify({ systemMessage: message }) + "\n");

try {
    const e = JSON.parse(readFileSync(0, "utf8"));
    if (e.agent_type !== "qa-agent") process.exit(0);
    const racine = git(["rev-parse", "--show-toplevel"], e.cwd).trim();
    const dossierGit = git(["rev-parse", "--absolute-git-dir"], racine).trim(); // absolu : juste aussi en worktree
    const debut = join(dossierGit, "qa-debut.json");

    if (e.hook_event_name === "SubagentStart") {
        writeFileSync(debut, JSON.stringify({ agent_id: e.agent_id, fichiers: instantane(racine) }));
        process.exit(0);
    }
    const verdict = e.agent_transcript_path ? verdictQa(dernierRapport(e.agent_transcript_path)) : null;
    if (verdict !== "OK") {
        dire(`qa-agent : verdict ${verdict ?? "absent"} — aucune trace écrite, le commit restera refusé.`);
        process.exit(0);
    }
    const avant = existsSync(debut) ? JSON.parse(readFileSync(debut, "utf8")) : null;
    const fichiers = instantane(racine);
    const bouges = avant?.agent_id === e.agent_id ? changesEntre(avant.fichiers, fichiers) : null;
    if (!bouges || bouges.length) {
        dire(bouges
            ? `qa-agent : VERDICT OK, mais ${bouges.length} fichier(s) ont changé pendant la revue (${bouges.slice(0, 3).join(", ")}) — aucune trace écrite : relancer qa-agent sans toucher au code pendant qu'il tourne.`
            : "qa-agent : VERDICT OK, mais l'état de départ manque — aucune trace écrite : relancer qa-agent.");
        process.exit(0);
    }
    writeFileSync(join(dossierGit, "qa-verifie.json"),
        JSON.stringify({ date: new Date().toISOString(), agent_id: e.agent_id, fichiers }, null, 2));
    dire(`qa-agent : VERDICT QA OK — trace écrite pour ${Object.keys(fichiers).length} fichier(s).`);
} catch (err) {
    dire(`qa-agent : trace non écrite (${err?.message ?? err}) — le commit restera refusé.`);
}
process.exit(0);
