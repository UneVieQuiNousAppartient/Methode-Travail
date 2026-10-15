# <Nom du projet>

<!-- Gabarit de la méthode de travail. Remplacer chaque <…>, supprimer les commentaires. Court : ce fichier est relu à chaque session. -->

**Statut** : <en développement / en production> · **Mis à jour** : <AAAA-MM-JJ>

## Ordre de lecture

1. Ce fichier → 2. **`docs/ETAT-ACTUEL.md`** (chantiers, décisions en attente, PR ouvertes) → 3. documents du
   projet (`docs/projets/<slug>/`).
- **Jamais `SUIVI-TACHES.md` en entier** (grep + lecture ciblée) — règle `.claude/rules/suivi-taches.md`.
- Budget et modèles : `.claude/rules/budget-jetons.md` — tout appel d'agent nomme son modèle (Opus pour le
  développement, Sonnet pour le contenu, Haiku pour les automatisations quotidiennes).
- Processus : `.claude/rules/agent-workflow.md` (plan avant action, `qa-agent` avant tout commit de 2+ fichiers).

## Le projet

<!-- 5 à 10 lignes : ce que c'est, pour qui, ce qui est en ligne, ce qui rapporte. -->

## Pile technique

<!-- Framework, base de données, hébergement, courriels, IA, i18n. -->

## Commandes de vérification

(Lues par `qa-agent` et les skills `livrer`, `qa-feature`.)
- `<typecheck>` · `<lint>` · `<tests unitaires>`
- e2e ciblé : `<commande>`
- `<build>` · `<audit des dépendances>`

## Conventions

<!-- Langue des textes, nommage, une fonctionnalité par commit, qui applique les migrations en production, conformité (ex. AMF, Loi 25). -->
