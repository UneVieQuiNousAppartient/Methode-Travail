#!/usr/bin/env node
// Hook UserPromptSubmit (.claude/settings.json) : rappelle à chaque message le parcours unique (skill `tache`).
// Méthode 1.7.0, repris de VieSolution-CSF (scripts/hook-rappel-tache.mjs, 6 nov. 2026, suivi 13b ; complété le
// 14 nov.). Pourquoi : la skill `tache` n'était qu'une consigne de CLAUDE.md, lue en début de session puis noyée dans
// le contexte (Camille : « toutes les tâches suivent un processus ? »). Ce rappel court (≈ 130 jetons par message)
// remet le parcours sous les yeux de l'agent au moment où il reçoit une demande.
// Il ne bloque rien : une simple question n'a pas besoin du parcours, l'agent en juge.
//
// Sortie standard = texte ajouté au contexte du message. N'échoue jamais.
const rappel =
    "Rappel méthode : une demande de changement, une idée ou une suggestion passe par la skill `tache` " +
    "(étape 0 : d'où vient la tâche ; rien n'est codé sans le « oui » de la personne qui valide ; skills choisies au " +
    "registre et chargées ; rendu validé avant et après ; `qa-agent` avant tout commit de 2 fichiers ou plus, " +
    "contrôlé par le hook). Nouvel écran : maquette en images (page d'essai maquette-* capturée, puis supprimée) ; " +
    "> 500 k ou nouvel écran : BRIEF + IMPLEMENTATION-PLAN d'abord. Une simple question n'en a pas besoin.";

// Une sortie fermée (EPIPE) arrive en événement asynchrone, hors du try : on l'ignore aussi. Seul le code 2
// bloquerait un message dans Claude Code ; ce script sort toujours en 0.
process.stdout.on("error", () => {});
try {
    process.stdout.write(`${rappel}\n`);
} catch {
    // rien : un rappel manqué ne doit jamais bloquer un message
}
