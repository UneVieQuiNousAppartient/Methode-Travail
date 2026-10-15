# Suivi des tâches — le travail n'est pas fini tant qu'il n'est pas consigné

## Trois fichiers, trois rôles

- **`docs/ETAT-ACTUEL.md`** (≤ 40 lignes) : chantiers en cours, décisions qui attendent, rappels, prochaine
  entrée du suivi. **Premier fichier lu** par chaque session, après `CLAUDE.md`. On remplace, on n'empile pas.
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

## Honnêteté

- Jamais ✅ sur ce qui n'a pas été vérifié ; ce qui demande un test humain porte « **À tester par <nom>** ».
- Une entrée reconstruite après coup le dit en tête.
- Les décisions négatives (reporté, retiré, non fait) se consignent aussi, avec la raison.
- Aucun secret dans ces fichiers : ils sont versionnés.
