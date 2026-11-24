# Maquettes — le détail de l'étape 4 de la skill `tache`

À lire quand la tâche crée un élément **nouveau ou visible** (page publique, bouton principal, nouvel écran). Méthode
1.7.0, repris de VieSolution-CSF (`.claude/skills/tache/references/maquettes.md`, 15 nov. 2026).

- **Maquette en images par défaut** (décision de Camille, 14 nov. 2026 : « Des images c'est bon ») : une page
  d'essai codée `<routes publiques>/<…>/maquette-<nom>/` avec les vrais composants et les couleurs du guide, puis des
  captures téléphone (390 px) et ordinateur (1280 px) envoyées à la personne qui valide. La page d'essai est
  **supprimée** avant la PR (avertissement automatique au commit et en CI, `scripts/check-livraison-pr.mjs`).
- **Claude Design** (canevas de maquettes) ne sert que pour un **très gros écran nouveau**, ou si la personne qui
  valide veut retoucher elle-même : le lui **proposer** dans ces deux cas. Jamais un fichier HTML isolé.
- **Composants** : ceux de la bibliothèque du projet (ex. modèle shadcn/ui copié dans le dépôt) ; aucun outil qui
  ajoute des dépendances sans accord.
- **Skills** de l'agent de maquette, nommées dans la délégation : `frontend-design`, `web-design-guidelines` ; une
  skill de plugin (ex. `design:design-critique`) seulement en plus, si le plugin est actif — aucune étape ne dépend
  d'une skill de plugin (`agent-workflow.md`).
