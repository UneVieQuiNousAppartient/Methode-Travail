#!/usr/bin/env node
// Hook Claude Code PreToolUse (Bash), .claude/settings.json — méthode 1.7.0, repris tel quel de VieSolution-CSF
// (scripts/hook-garde-git.mjs, 14 nov. 2026, suivi 14l).
// Un blocage ne se contourne jamais (agent-workflow.md) : refuse les commandes qui sautent les hooks Git
// (--no-verify et ses abréviations, commit -n, core.hooksPath changé, retiré ou forcé par variable), qui écrivent les
// fichiers de trace qa-agent (.git/qa-verifie.json, .git/qa-debut.json) ou qui lancent à la main le script des hooks
// de qa-agent (scripts/hook-qa-trace.mjs : seul Claude Code le lance, à la fin d'un vrai qa-agent).
// Les textes entre guillemets sont mis de côté AVANT le découpage en segments (; & | retours à la ligne) : un message
// de commit sur plusieurs lignes, ou qui contient ; ou |, ne coupe plus la commande (2e revue qa-agent du 14 nov.).
// Limite connue : une ligne de heredoc NON entre guillemets qui ressemble à une commande interdite est refusée.
// N'échoue jamais : entrée illisible = laisse passer.
import { readFileSync } from "node:fs";

const TRACE = /qa-(verifie|debut)/;
const ECRIVAINS = /^(cp|mv|rm|touch|tee|truncate|dd|install|ln|python3?|perl|ruby)$/;
const LANCEURS = /^(node|bun|deno|sh|bash|zsh)$/;
const OPTIONS_A_VALEUR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path"]);

/** Raison du refus d'un segment, ou null. `brut` : textes remis ; `mots` : textes remplacés par "". */
function raisonRefus(brut, sansTexte) {
    const mots = sansTexte.trim().split(/\s+/).filter(Boolean);
    const i = mots.findIndex((m) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(m) && !/^(env|sudo|command|exec|time|nohup)$/.test(m));
    const affectations = mots.slice(0, Math.max(i, 0));
    const cmd = (mots[i] ?? "").replace(/^\\/, "").split("/").pop();
    const args = mots.slice(i + 1);

    if (/hook-qa-trace/.test(brut) && (LANCEURS.test(cmd) || /hook-qa-trace/.test(mots[i] ?? ""))) {
        return "le script des hooks de qa-agent ne se lance pas à la main : lancer un vrai qa-agent";
    }
    if (TRACE.test(brut)) {
        const ecrit = />\s*\S*qa-(verifie|debut)/.test(brut) || ECRIVAINS.test(cmd)
            || (cmd === "sed" && args.some((a) => /^-[a-zA-Z]*i/.test(a)))
            || (LANCEURS.test(cmd) && /write|append|rename|unlink|rmSync|copyFile|open\(/.test(brut));
        if (ecrit) return "les fichiers de trace qa-agent ne s'écrivent que par les hooks de qa-agent";
    }
    if (cmd !== "git") return null;
    if (affectations.some((a) => /^GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)/.test(a))) {
        return "la configuration Git ne se force pas par variable";
    }
    if (args.some((a) => /^--no-v(e(r(i(fy?)?)?)?)?$/.test(a))) return "--no-verify saute les contrôles du commit";
    // sous-commande : premier argument qui n'est ni une option ni la valeur d'une option (-C <dossier>, -c <x=y>…)
    let k = 0;
    while (k < args.length && args[k].startsWith("-")) k += OPTIONS_A_VALEUR.has(args[k]) ? 2 : 1;
    const avant = args.slice(0, k);
    const sous = args[k];
    const reste = args.slice(k + 1);
    if (avant.some((a) => /hooksPath/i.test(a)) || /core\.hooksPath=/i.test(sansTexte)) return "core.hooksPath ne se change pas";
    if (sous === "commit" && reste.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) return "git commit -n saute les contrôles du commit";
    if (sous === "config" && (/hooksPath/i.test(sansTexte) || reste.includes("--remove-section"))) {
        const positionnels = reste.filter((a) => !a.startsWith("-")).join(" ");
        const dangereux = reste.some((a) => /^--(unset|unset-all|replace-all|add|remove-section|rename-section|edit)$/.test(a));
        const permis = ["core.hooksPath", "get core.hooksPath", "core.hooksPath .githooks", "set core.hooksPath .githooks"];
        if (dangereux || !permis.includes(positionnels)) return "core.hooksPath doit rester sur .githooks";
    }
    return null;
}

/** Met de côté les textes entre guillemets, découpe en segments, puis analyse chaque segment. */
function raisonCommande(commande) {
    const textes = [];
    const neutre = String(commande).replace(/'[^']*'|"(\\[\s\S]|[^"\\])*"/g, (t) => `\u0000${textes.push(t) - 1}\u0000`);
    for (const segment of neutre.split(/&&|\|\||[;&|\n]/)) {
        const brut = segment.replace(/\u0000(\d+)\u0000/g, (_, n) => textes[Number(n)]);
        const raison = raisonRefus(brut, segment.replace(/\u0000\d+\u0000/g, '""'));
        if (raison) return raison;
    }
    return null;
}

try {
    const raison = raisonCommande(JSON.parse(readFileSync(0, "utf8")).tool_input?.command ?? "");
    if (raison) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: `Refusé : ${raison}. Un blocage ne se contourne pas : corriger la cause (souvent, lancer qa-agent) ou demander à la personne qui valide (Fiche projet).`,
            },
        }) + "\n");
    }
} catch {
    // laisse passer
}
process.exit(0);
