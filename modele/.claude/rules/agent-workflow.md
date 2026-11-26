# Workflow de développement — plan avant action, vérification en clôture

Règle courte, lue à chaque session. Parcours complet d'une demande : skill **`tache`**. Raisons, tableaux et texte
long : `docs/methode/agent-workflow-details.md` (lu à la demande, `grep -n "^## §"`).

## Déclencheur (objectif, pas un jugement)

- **2 fichiers ou plus**, ou **1 fichier sensible** (« Chemins sensibles » de la Fiche projet : authentification,
  sécurité, conformité, données en production) → processus complet, `qa-agent` en clôture.
- Sinon (une ligne, une coquille, un seul fichier sans enjeu) : annoncer en une ligne, puis faire.
- **Verrou mécanique** : le hook Git refuse le commit tant qu'un vrai `qa-agent` n'a pas fini par
  `VERDICT QA : OK` sur ces fichiers exacts (détails § 4). Un blocage se corrige, il ne se contourne jamais.

## Accord avant de coder

- **Accord explicite avant la première ligne**, même pour une ligne : argent, paiement, authentification ou accès,
  schéma de la base, données de clients. Processus complet : plan, puis accord.
- **Avant tout plan** : reformuler la demande en une phrase ; ambiguë → une question en français simple ; lire le
  code concerné (une fonction existante fait peut-être déjà la chose).
- **Nouveau projet ou grosse fonctionnalité** → skill `nouveau-projet` d'abord. **Plus de 500 k estimés ou nouvel écran** → `BRIEF.md` + `IMPLEMENTATION-PLAN.md` courts validés avant le code ;
  nouvel écran → maquette en images (page `maquette-*`, supprimée avant la PR).

## Le plan dit

La reformulation ; les sous-tâches, chacune avec son agent, son **modèle** et sa **skill** (`.claude/skills/REGISTRE.md`) ;
ce qui est réutilisé, **dans cet ordre** : autre projet ou `kits/` de `methode-travail`, puis outil reconnu, puis
du neuf en disant pourquoi — ne jamais recoder ce qu'un agent, une skill ou un dépôt reconnu fait déjà ; ce qui peut tourner en parallèle (au plus 2 agents) ; **« Coût estimé »** et **« Lignes estimées :
≈ +N / −M »**. Le plan et l'accord n'appartiennent qu'à l'agent principal : un sous-agent exécute, ne redemande rien,
ne dispatche personne, et son prompt le dit.

## Faire et vérifier

1. Règle de calcul critique (argent, quantités, accès, dates) : skill `tester-dabord`.
2. **Moins de code** : `simplify` puis `tech-debt` (fichiers touchés) avant `qa-agent`, jamais sautées ; l'ancien code remplacé est
   supprimé ; lignes réelles par `node scripts/check-taille-diff.mjs origin/main`, ⚠ au-delà de 50 % (détails § 3).
3. `qa-agent` toujours en dernier ; `securite` avant la mise en ligne d'un lot d'accès, de schéma ou d'intégration ;
   `revue-integration` avant de fusionner un lot écrit par un autre.
4. **Jamais un rapport sur parole** : relire le diff réel, surtout les tests ; vérifier toute affirmation surprenante.
5. **Bug confirmé** → issue GitHub tout de suite (label `bug`), pas de correction hors périmètre sans accord ; s'il
   est détectable par un motif → règle de `scripts/check-rules.mjs` plutôt qu'un rappel.

Avant de déléguer : `maxTurns` suffisant, chemins de départ donnés, moment où écrire le livrable dit ; un agent
arrêté se reprend, il ne se relance pas (détails § 8).

## Skills et agents

La délégation **nomme** la skill à appliquer ; aucune étape obligatoire ne dépend d'une skill de plugin ; règles du
projet > skill `tache` > skills externes (détails § 5). Agents du modèle et rôle de chacun : détails § 8 ; agents
propres au projet : à lister dans `docs/methode/agent-workflow-details.md` § 8.
