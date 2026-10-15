# Règles métier — un incident récurrent devient une règle mécanique

Constat (KHI Educ, septembre 2026) : quatre revues successives ont refusé le même lot pour des témoignages,
un courriel et des horaires inventés. Le rappel existait dans le fichier de l'agent ; il ne suffisait pas.
Ce qui a fini par tenir : une règle dans `scripts/check-rules.mjs`, lancée à chaque commit et en CI.

## La règle

Tout incident de **contenu** (fait inventé, coordonnée, prix, promesse, domaine en dur, mention réglementaire
manquante) ou de **sécurité** (secret en dur, appel non protégé, échappement oublié) qui s'est produit une
fois et peut se reproduire devient **une entrée du tableau `RULES` de `scripts/check-rules.mjs`** — pas un
rappel de plus dans un agent, une skill ou `CLAUDE.md`.

Chaque règle porte :
- `id` — court et stable ;
- `incident` — **le fait réel** qui l'a motivée (date, ce qui s'est passé). Pas d'incident, pas de règle :
  une règle sans histoire finit supprimée par la première personne qu'elle gêne ;
- `motif`, `dossiers` — ce qui est cherché, et où ;
- `message` — quoi faire à la place, lisible par l'agent qui a écrit la ligne.

## Où elle s'applique

- Hook Git `.githooks/pre-commit` (bloquant) — activé par `git config core.hooksPath .githooks`.
- Commande **Vérification** de la Fiche projet (`CLAUDE.md`), donc en CI.
- Exception ponctuelle : commentaire `regle-ok: <id>` sur la ligne, **avec la raison**. Une exception sans
  raison se refuse en revue (`revue-integration`).

Une faute qui ne se voit pas ligne par ligne mais à la **présence d'un fichier** (un `.env` suivi par Git)
a son propre script : `scripts/check-secrets-suivis.mjs`, branché au même hook et à la même Vérification.
L'explication d'une erreur déjà diagnostiquée va, elle, dans `docs/ERREURS-CONNUES.md` (`suivi-taches.md`) :
le registre explique, la règle empêche.

## Ce qui reste aux agents

Ce qu'un motif ne peut pas voir : un fait plausible mais jamais dit par le client, une régression
fonctionnelle, une faille de logique. C'est le rôle de `revue-integration`, `securite` et `qa-agent` — et
quand l'un d'eux trouve deux fois le même défaut, la question est : « peut-on en faire une règle ? ».
