# Suivi des tâches — le travail n'est pas fini tant qu'il n'est pas consigné

Demande de Camille (12 août 2026) : un suivi non commité, ou dont l'en-tête ment sur sa fraîcheur, est pire qu'un
suivi absent. Raisons et exemples : `docs/methode/suivi-taches-details.md` (lu à la demande).

## Quatre fichiers, quatre rôles

- **`docs/ETAT-ACTUEL.md`** (≤ 40 lignes) : chantiers en cours, décisions qui attendent, rappels, prochaine
  entrée du suivi. **Premier fichier lu** par chaque session, après `CLAUDE.md`. On remplace, on n'empile pas.
- **`docs/ERREURS-CONNUES.md`** : registre des erreurs déjà diagnostiquées (voir plus bas). **Lu juste après
  `ETAT-ACTUEL.md`** — en entier tant qu'il est court, par `grep` sur le message d'erreur ensuite.
- **`SUIVI-TACHES.md`** : historique, une entrée par livraison. Se consulte par `grep` (numéro de section,
  mot-clé) puis lecture ciblée — **jamais en entier**, ni par l'agent principal, ni par un agent, ni par une skill.
- **`docs/projets/<slug>/`** : les documents d'un projet (chaîne `nouveau-projet`), qui remplacent la lecture
  de l'historique pour ce projet.

Quand le suivi dépasse ≈ 150 Ko, déplacer les sections terminées anciennes dans `docs/suivi/archive-<période>.md`,
telles quelles, en laissant une ligne d'index à leur place.

## La règle

Une tâche non triviale n'est pas livrée tant que :
1. **une entrée existe** dans `SUIVI-TACHES.md` — `## <num>. ✅ <titre> (<date>)` avec : **Contexte / demande**,
   **Ce qui a été fait**, **Vérification technique**, **Non fait dans ce round** (cette dernière rubrique empêche une
   session suivante de croire un chantier complet alors qu'il ne l'est pas) ;
2. **l'en-tête « Dernière mise à jour »** porte la date du jour et pointe vers la nouvelle section ;
3. **les statuts existants** sont corrigés (⏳ → 🔄 → ✅ → ⏸) plutôt que contredits par une nouvelle entrée ;
4. **`docs/ETAT-ACTUEL.md`** est mis à jour ;
5. le travail est **poussé** — il ne reste pas en local.

## Registre des erreurs connues — ne jamais payer deux fois le même diagnostic

`docs/ERREURS-CONNUES.md` est une table `| # | Erreur (message exact) | Cause | Solution | Règle |`, numérotée
E01, E02… (un numéro n'est jamais réutilisé ; une erreur disparue pour de bon est marquée « obsolète »).
- **Y entre** : toute erreur **reproduite** (vue une deuxième fois), et toute erreur **corrigée après un vrai
  diagnostic** (skill `incident`) — même si elle n'est apparue qu'une fois, dès que le diagnostic a coûté.
  Le message est recopié **exactement**, pour qu'un `grep` le retrouve ; la cause est celle qui a été prouvée.
- **N'y entre pas** : une faute de frappe corrigée en passant, une supposition non vérifiée.
- **Avant de diagnostiquer** une erreur : `grep -n "<morceau du message>" docs/ERREURS-CONNUES.md`. Si elle y
  est, appliquer la solution notée ; si la solution ne marche plus, corriger la ligne plutôt qu'en ajouter une.
- **Ce qui est mécanisable** (un motif dans le code le détecte) devient **en plus** une règle de
  `scripts/check-rules.mjs` (`regles-metier.md`), dont l'`id` va dans la colonne « Règle » : la table
  explique, la règle empêche.

## Honnêteté

- Jamais ✅ sur ce qui n'a pas été vérifié ; ce qui demande un test humain porte « **À tester par <nom>** ».
- Une entrée reconstruite après coup le dit en tête.
- Les décisions négatives (reporté, retiré, non fait) se consignent aussi, avec la raison.
- Aucun secret dans ces fichiers : ils sont versionnés.

## Garde-fous mécaniques

- `scripts/check-suivi.js` (hook `pre-commit`, mode `--hook`) **avertit** sans bloquer si du code (« Dossiers de
  code » de la Fiche projet) part sans entrée au suivi, ou si l'en-tête n'a pas la date du jour.
- `scripts/check-livraison-pr.mjs` (CI, sur chaque PR) **refuse** une PR qui touche le code sans entrée au suivi
  (en-tête « Dernière mise à jour » changé par rapport à la base) ni `docs/ETAT-ACTUEL.md` mis à jour. Bloqué à la
  PR, pas au commit : les commits intermédiaires sans suivi sont normaux, la PR est le moment de la livraison.
