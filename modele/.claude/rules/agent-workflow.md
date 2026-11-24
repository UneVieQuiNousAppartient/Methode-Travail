# Workflow de développement — plan avant action, agents spécialisés, vérification en clôture

Règle courte, chargée à chaque session ; texte complet, raisons et tableaux : `docs/methode/agent-workflow-details.md`
(lu à la demande). Le parcours qui enchaîne ces règles, de la demande à la PR : skill **`tache`**.

## Quand le processus complet s'applique (déclencheur objectif)

- **2 fichiers ou plus** modifiés, **ou** 1 seul fichier touchant l'authentification, la sécurité, la
  conformité ou des données déjà en production (« Chemins sensibles » de la Fiche projet) → processus complet
  ci-dessous, sans exception ni jugement de l'agent principal.
- Sinon (une ligne, une coquille, un seul fichier hors catégories sensibles) : exécution directe.

**Verrou avant tout `git commit`** : si le déclencheur est atteint, un vrai `qa-agent` (appel `Agent`, pas une
auto-vérification) a tourné sur le diff et fini par `VERDICT QA : OK`. Ce verrou est **mécanique** : le hook Git
refuse le commit sans la trace écrite à la fin de `qa-agent` (détails § 4).

## Accord avant de coder, ou annonce puis exécution

Le plan est toujours dit ; ce qui change, c'est s'il faut **attendre** :
- **Plan, puis accord explicite avant la première ligne de code** — même pour une seule ligne — quand le
  changement touche l'**argent**, le **paiement**, l'**authentification** ou les accès, le **schéma de la base**
  (migration, RLS) ou des **données de clients**.
- **Processus complet** (déclencheur atteint, hors domaines ci-dessus) : plan et accord, étape 3.
- **Le reste** (une coquille, un texte, une couleur, un seul fichier sans enjeu) : **annoncer** en une ou deux
  lignes ce qui va changer, puis le faire sans attendre.
- **Avant tout plan** : reformuler la demande **en une phrase** ; ambiguë → **poser la question** en français
  simple, sans jargon (la personne qui valide n'est pas forcément technique). Lire le code concerné avant de
  proposer : une fonction existante fait peut-être déjà presque la chose.
- **Seuil des documents** : chantier estimé à plus de 500 k ou **nouvel écran** → `BRIEF.md` +
  `IMPLEMENTATION-PLAN.md` courts (`tech-lead`, skill `nouveau-projet`) validés avant le code (avertissement
  automatique en CI). Nouvel écran : **maquette en images** (page d'essai `maquette-*`, supprimée avant la PR).

## Réutiliser avant de construire

Avant de proposer une nouvelle fonction, le plan dit d'où elle vient, dans cet ordre : 1. un autre projet de la
méthode ou un kit de `methode-travail` (`kits/`) qui l'a déjà ; 2. un outil ou une bibliothèque reconnue ; 3.
seulement ensuite, du neuf — en disant pourquoi 1 et 2 ne conviennent pas. Détails § 2.

## Moins de code

Toute tâche qui code et atteint le déclencheur (détails § 3) :
1. **« Lignes estimées : ≈ +N / −M »** dans le plan, à côté du « Coût estimé » ; à la livraison, lignes réelles par
   `node scripts/check-taille-diff.mjs origin/main` (`git add -N` pour les nouveaux fichiers) ; ⚠ au-delà de 50 %.
2. Skills **`simplify` puis `tech-debt`** (fichiers touchés seulement) **avant `qa-agent`**, jamais sautées ; le prompt
   de `qa-agent` dit ce qu'elles ont trouvé.
3. **Supprimer l'ancien fait partie de « terminé »** (après `grep` qui prouve qu'il n'est plus utilisé), ou le noter
   dans « Non fait ».

## Processus

0. **Reformuler** la demande (objectif, périmètre vérifié dans le code, contraintes, ambiguïtés, critère de
   « terminé ») — en tête du plan.
1. **Décomposer** en sous-tâches, chacune avec son agent (`.claude/agents/`), son **modèle** (`budget-jetons.md`) et
   la **skill** à appliquer (`.claude/skills/REGISTRE.md`). Ne jamais recoder ce qu'un agent, une skill ou un dépôt
   public reconnu fait déjà. Une skill copiée porte un `SOURCE.md` et ne se modifie pas sur place.
2. **Dépendances** : quoi doit finir avant quoi ; ce qui peut tourner en parallèle (au plus 2 agents).
3. **Présenter le plan** (reformulation + graphe + coût estimé + lignes estimées) et **attendre l'accord**. Cette
   étape n'appartient qu'à l'agent principal : un sous-agent exécute un plan approuvé, ne redemande rien et ne
   dispatche personne — le prompt de délégation le dit explicitement.
4. **Exécuter** selon le graphe. Règle de calcul critique (argent, quantités, accès, dates) : skill
   **`tester-dabord`**.
5. **Terminer par `qa-agent`** — et `securite` avant la mise en ligne d'un lot qui touche l'authentification, les
   accès, le schéma ou une intégration externe ; `revue-integration` avant de fusionner un lot écrit par un autre.

Nouveau projet ou grosse fonctionnalité : la skill `nouveau-projet` précède ce processus.

## Budget de tours (`maxTurns`)

Vérifier avant de déléguer que `maxTurns` couvre exploration + modifications + vérifications ; dire dans le prompt
**quand écrire** le livrable ; donner les chemins de départ. Un agent arrêté se **reprend**, il ne se relance pas.

## Ne jamais accepter un rapport sur parole

L'agent principal **relit le diff réel**, en particulier les fichiers de test (un test affaibli qui « passe » est
pire qu'un échec). Toute affirmation surprenante d'un agent se **vérifie** avant d'être répétée.

## Tout bug confirmé devient une issue, immédiatement

Issue GitHub tout de suite (titre précis, portée vérifiée par grep, label `bug`), lien donné à la personne qui
valide. Pas de correction hors périmètre sans accord, sauf trivial et dans le périmètre approuvé. Si un motif peut
le détecter : une règle de `scripts/check-rules.mjs` (`regles-metier.md`) plutôt qu'un rappel dans un agent.

## Skills et plugins

Registre : `.claude/skills/REGISTRE.md` ; les six règles : détails § 5. La délégation **nomme** la skill à
appliquer ; **aucune étape obligatoire ne dépend d'une skill de plugin** (elle peut manquer sans message) ; les
règles du projet passent avant une skill externe. Ajouter une skill = 4 gestes dans le même commit (détails § 5).

## Agents du modèle

- **Reformulation** : `prompt-agent`.
- **Conception** (documents seulement, skill `nouveau-projet`) : `product-manager`, `data-architect`,
  `solution-architect`, `ux-designer`, `tech-lead`.
- **Développement** : `orchestrateur` (découpage), `data-agent`, `ux-agent`, `ai-agent`, `qa-agent` (toujours en dernier).
- **Revue** (lecture seule, Opus, verdict binaire) : `securite`, `revue-integration`.
- **Propres au projet** : à lister ici (agents métier, automatisations).

## Garde-fous mécaniques (la règle est appliquée, pas seulement écrite)

Tableau complet : détails § 4. Le hook Git est activé à chaque session Claude par `scripts/session-start.sh`
(ailleurs : `git config core.hooksPath .githooks`). Bloquent : `check-rules`, `check-secrets-suivis`, le verrou
`qa-agent` (commit), `check-livraison-pr` (PR qui touche le code sans suivi ni `ETAT-ACTUEL`, en CI). Sauter les
hooks (`--no-verify`…) est refusé par `hook-garde-git`. Un blocage n'est jamais une erreur à contourner : c'est le
signal de corriger, ou de demander.
