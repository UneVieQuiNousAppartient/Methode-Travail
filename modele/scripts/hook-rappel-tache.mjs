#!/usr/bin/env node
// Hook UserPromptSubmit (.claude/settings.json) : rappelle à chaque message le parcours unique (skill `tache`).
// Méthode 1.7.0, repris de VieSolution-CSF (scripts/hook-rappel-tache.mjs, 6 nov. 2026, suivi 13b ; complété le
// 14 nov.). Pourquoi : la skill `tache` n'était qu'une consigne de CLAUDE.md, lue en début de session puis noyée dans
// le contexte (Camille : « toutes les tâches suivent un processus ? »). Ce rappel court (≈ 50 jetons par message depuis la 1.7.1)
// remet le parcours sous les yeux de l'agent au moment où il reçoit une demande.
// Il ne bloque rien : une simple question n'a pas besoin du parcours, l'agent en juge.
//
// Sortie standard = texte ajouté au contexte du message. N'échoue jamais.
// Méthode 1.7.1 : raccourci à ≈ 50 jetons (le texte s'ajoute à CHAQUE message et reste dans l'historique ; doc
// d'Anthropic : garder ce rappel très court). Le détail est dans la skill `tache`, chargée quand elle sert.
const rappel =
    "Rappel : demande de changement ou idée → skill `tache` (rien codé sans « oui » ; skills chargées d'abord ; " +
    "`qa-agent` avant un commit de 2+ fichiers). Simple question : pas besoin.";

// Une sortie fermée (EPIPE) arrive en événement asynchrone, hors du try : on l'ignore aussi. Seul le code 2
// bloquerait un message dans Claude Code ; ce script sort toujours en 0.
process.stdout.on("error", () => {});
try {
    process.stdout.write(`${rappel}\n`);
} catch {
    // rien : un rappel manqué ne doit jamais bloquer un message
}
