# Workflow de développement — plan avant action, agents spécialisés, vérification en clôture

## Quand le processus complet s'applique (déclencheur objectif)

- **2 fichiers ou plus** modifiés, **ou** 1 seul fichier touchant l'authentification, la sécurité, la
  conformité ou des données déjà en production → processus complet ci-dessous, sans exception.
- Sinon (une ligne, une coquille, un seul fichier hors catégories sensibles) : exécution directe.

**Verrou avant tout `git commit`** : si le déclencheur est atteint, un vrai `qa-agent` (appel `Agent`, pas une
auto-vérification) a tourné sur le diff.

## Processus

0. **Reformuler** la demande (objectif, périmètre vérifié dans le code, contraintes, ambiguïtés, critère de
   « terminé ») — en tête du plan.
1. **Décomposer** en sous-tâches, chacune avec son agent (`.claude/agents/`) et son **modèle**
   (`budget-jetons.md`). Ne jamais recoder ce qu'un agent ou une skill fait déjà.
2. **Dépendances** : quoi doit finir avant quoi ; ce qui peut tourner en parallèle (au plus 2 agents).
3. **Présenter le plan** (reformulation + graphe + **coût estimé**) et **attendre l'accord**. Cette étape
   n'appartient qu'à l'agent principal : un sous-agent exécute un plan approuvé, ne redemande rien et ne
   dispatche personne — le prompt de délégation le dit explicitement.
4. **Exécuter** selon le graphe.
5. **Terminer par `qa-agent`**.

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
- **Propres au projet** : à lister ici (agents métier, automatisations).
