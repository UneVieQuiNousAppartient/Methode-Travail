# Erreurs connues — <Nom du projet>

<!-- Gabarit de la méthode de travail (règle .claude/rules/suivi-taches.md, « Registre des erreurs connues »).
Remplacer <…>, supprimer les deux lignes d'exemple une fois la première vraie erreur notée. -->

**Lu au début de chaque session**, après `docs/ETAT-ACTUEL.md` (par `grep` sur le message d'erreur si le
fichier devient long). But : ne jamais payer deux fois le diagnostic d'une même erreur.

Une ligne entre ici quand une erreur s'est **produite deux fois**, ou qu'elle a **coûté un vrai diagnostic**
(skill `incident`). Le message est recopié **exactement** (c'est ce qu'on cherche avec `grep`), la cause est
celle qui a été **prouvée**, pas supposée. Numérotation continue (E01, E02…) ; une erreur résolue pour de bon
reste dans la table, marquée « (obsolète : <raison>) », pour que son numéro ne soit jamais réutilisé.

Ce qu'un motif peut détecter devient **en plus** une règle de `scripts/check-rules.mjs`
(`.claude/rules/regles-metier.md`) : la table explique, la règle empêche. Colonne « Règle » : l'`id` de la
règle, sinon « — ».

| # | Erreur (message exact) | Cause | Solution | Règle |
|---|---|---|---|---|
| E01 | *Exemple (Ben's)* : `Invalid location id` au paiement | Un espace collé à la fin du secret copié dans l'hébergeur | `.trim()` sur la valeur lue ; recopier le secret sans espace | — |
| E02 | *Exemple (Ben's)* : `TS1002: Unterminated string` | Apostrophe d'un nom propre dans une chaîne entre apostrophes d'un fichier de traduction | Échapper l'apostrophe, ou guillemets doubles pour la chaîne | — |
