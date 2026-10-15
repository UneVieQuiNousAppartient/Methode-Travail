# Workflow de développement — plan avant action, agents spécialisés, vérification en clôture

## Quand le processus complet s'applique (déclencheur objectif)

- **2 fichiers ou plus** modifiés, **ou** 1 seul fichier touchant l'authentification, la sécurité, la
  conformité ou des données déjà en production → processus complet ci-dessous, sans exception.
- Sinon (une ligne, une coquille, un seul fichier hors catégories sensibles) : exécution directe.

**Verrou avant tout `git commit`** : si le déclencheur est atteint, un vrai `qa-agent` (appel `Agent`, pas une
auto-vérification) a tourné sur le diff.

## Accord avant de coder, ou annonce puis exécution

Le plan est toujours dit ; ce qui change, c'est s'il faut **attendre** :
- **Plan, puis accord explicite avant la première ligne de code** — même pour une seule ligne, même sous le
  déclencheur ci-dessus — quand le changement touche l'**argent** (prix, taxes, rabais, remboursements), le
  **paiement**, l'**authentification** ou les accès, le **schéma de la base** (migration, RLS) ou des
  **données de clients**.
- **Processus complet** (déclencheur atteint, hors domaines ci-dessus) : plan et accord, étape 3.
- **Le reste** (exécution directe : une coquille, un texte, une couleur, un seul fichier sans enjeu) :
  **annoncer** en une ou deux lignes ce qui va changer, puis le faire sans attendre.
- **Avant tout plan** : reformuler la demande **en une phrase**. Si elle est ambiguë, **poser la question** en
  français simple, sans jargon, plutôt que deviner — la personne qui valide n'est pas forcément technique
  (« Le rabais s'applique-t-il avant ou après les frais de livraison ? », pas « quel ordre d'opérations dans
  la fonction de calcul ? »). Lire le code concerné avant de proposer : une fonction existante fait peut-être
  déjà presque la chose.

## Processus

0. **Reformuler** la demande (objectif, périmètre vérifié dans le code, contraintes, ambiguïtés, critère de
   « terminé ») — en tête du plan.
1. **Décomposer** en sous-tâches, chacune avec son agent (`.claude/agents/`) et son **modèle**
   (`budget-jetons.md`). Ne jamais recoder ce qu'un agent ou une skill fait déjà — ni dans le projet, ni
   dans un dépôt public reconnu. Une skill **copiée d'un autre dépôt** porte un `SOURCE.md` à côté de son
   `SKILL.md` (dépôt, commit, licence, date de copie) et **ne se modifie pas sur place** : on la remplace
   par une copie plus récente, après relecture du diff (`node scripts/skills-check.mjs` signale celles qui
   ont changé en amont). On n'installe pas de bibliothèque de skills en vrac : chacune est lue avant
   d'entrer, et justifiée.
2. **Dépendances** : quoi doit finir avant quoi ; ce qui peut tourner en parallèle (au plus 2 agents).
3. **Présenter le plan** (reformulation + graphe + **coût estimé**) et **attendre l'accord**. Cette étape
   n'appartient qu'à l'agent principal : un sous-agent exécute un plan approuvé, ne redemande rien et ne
   dispatche personne — le prompt de délégation le dit explicitement.
4. **Exécuter** selon le graphe. Toute règle de calcul critique (argent, quantités, droits d'accès, dates de
   facturation) suit la skill **`tester-dabord`** : fonction pure + test écrit avant ou avec le code, test de
   parité si la règle existe des deux côtés (client et serveur).
5. **Terminer par `qa-agent`** — et, pour un lot qui touche l'authentification, les accès, le schéma ou
   une intégration externe, par `securite` avant la mise en ligne ; pour un lot écrit par un autre agent
   ou une autre personne, par `revue-integration` avant la fusion.

Pour un nouveau projet ou une grosse fonctionnalité, la skill `nouveau-projet` (BRIEF → PRD + APP-FLOW →
SCHEMA → TRD → UI-GUIDE → IMPLEMENTATION-PLAN) précède ce processus.

## Budget de tours (`maxTurns`)

Un agent qui s'arrête avant ses vérifications rend un travail que personne n'a contrôlé. Avant de déléguer :
- vérifier que `maxTurns` couvre exploration + modifications + vérifications ;
- dire dans le prompt **quand écrire** le livrable (ex. « écris le fichier vers le tour 12, puis complète ») ;
- donner les chemins de départ, pour éviter l'exploration large.
Un agent arrêté en route se **reprend** (même agent, message de suite), il ne se relance pas à froid.

## Ne jamais accepter un rapport sur parole

- L'agent principal **relit le diff réel**, en particulier les fichiers de test.
- Toute affirmation surprenante d'un agent (un risque de sécurité, un fait réglementaire, « ce code n'est
  appelé nulle part ») se **vérifie** avant d'être répétée à l'utilisateur ou écrite dans un document.

## Tout bug confirmé devient une issue, immédiatement

Bug réel (vérifié dans le code ou observé), même hors périmètre : issue GitHub tout de suite (titre précis,
portée vérifiée par grep sur tout le dépôt, label `bug`), lien donné à l'utilisateur. Ne jamais corriger un
bug trouvé en passant sans accord, sauf s'il est trivial et dans le périmètre approuvé. Si un agent risque de
reproduire le défaut, ajouter un rappel dans le fichier de cet agent.

## Agents du modèle

- **Reformulation** : `prompt-agent`.
- **Conception** (documents seulement, skill `nouveau-projet`) : `product-manager`, `data-architect`,
  `solution-architect`, `ux-designer`, `tech-lead`.
- **Développement** : `orchestrateur` (découpage), `data-agent`, `ux-agent`, `ai-agent`, `qa-agent` (toujours en dernier).
- **Revue** (lecture seule, Opus, verdict binaire) : `securite` (avant une mise en production sensible),
  `revue-integration` (avant de fusionner un lot qu'on n'a pas écrit).
- **Propres au projet** : à lister ici (agents métier, automatisations).

## Garde-fous mécaniques (la règle est appliquée, pas seulement écrite)

Un rappel dans un agent s'oublie ; un script ne s'oublie pas. Ce que le modèle installe :

| Garde-fou | Où | Ce qu'il fait |
|---|---|---|
| Fichiers protégés | `scripts/hook-protect-files.mjs` (PreToolUse) | refuse l'écriture de `.env*`, des verrous, des artefacts |
| Correcteur de lint | `scripts/hook-lint-fix.mjs` (PostToolUse) | `eslint --fix` sur le fichier écrit, erreurs restantes remontées ; jamais bloquant |
| Règles métier | `scripts/check-rules.mjs` (pre-commit + Vérification) | bloque un commit qui réintroduit un incident connu (`regles-metier.md`) |
| Fichiers secrets suivis | `scripts/check-secrets-suivis.mjs` (pre-commit + Vérification) | bloque si `.env`, `.env.local`, `.npmrc` avec jeton, clé privée… est suivi par Git |
| Suivi | `scripts/check-suivi.js --hook` (pre-commit) | avertit si du code part sans entrée au suivi ; jamais bloquant |
| Méthode | `scripts/verifier-methode.mjs` | Fiche projet remplie, hooks, frontmatter, scripts valides, registre des erreurs présent |

Hook Git actif seulement après `git config core.hooksPath .githooks` (une fois par clone). Un blocage n'est
jamais une erreur à contourner : c'est le signal de corriger, ou de demander.
