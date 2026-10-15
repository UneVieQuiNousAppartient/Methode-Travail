---
name: livrer
description: Rituel de fin de chantier — vérifications, qa-agent, mise à jour du suivi, puis proposition de mise en ligne
when_to_use: Un chantier est terminé et Camille veut le clore proprement, ou avant toute mise en production
user-invocable: true
allowed-tools: Read, Edit, Bash, Grep, Agent
disallowed-tools: []
model: opus
effort: high
---

# Livrer

Ferme un chantier dans les règles. Existe parce que les trois dernières étapes —
`qa-agent`, mise à jour du suivi, mise en ligne — sont exactement celles qu'on
saute quand le code « a l'air fini ». C'est ce qui a produit une semaine de
travail non commité, et un suivi qui annonçait une date vieille de neuf jours.

## Règles absolues — valables à chaque étape

- **Aucune fusion ni mise en production sans le mot explicite** de la personne
  qui valide (Fiche projet) : « fusionne », « mets en production ». Un « ça a
  l'air bien », un silence ou un accord donné pour autre chose ne compte pas.
- **Rien qui modifie des données de clients** (commandes, comptes, paiements,
  stock réel, envois de courriels) sans son accord, y compris « pour tester ».
- **Pas d'identifiant de modèle d'IA** (nom ou numéro de version de modèle) dans
  les messages de commit, les titres et descriptions de PR ni le code — les
  lignes d'attribution imposées par l'outil restent celles qu'il fixe.
- **Après un push** : PR en **brouillon**, puis la **surveiller** (CI,
  commentaires) jusqu'à ce qu'elle soit verte ou que le problème soit rapporté.
- **Fonction serveur** (fonction edge, *serverless*, tâche planifiée) :
  **redéployée ET testée en direct** par un appel réel **non destructeur**
  (lecture, requête refusée attendue, mode test) — pas seulement le code poussé.
- **Ne jamais dire « c'est fait » sans preuve** : chaque affirmation du compte
  rendu s'appuie sur une sortie observée ; un test rouge se dit, il ne se tait pas.

## Étapes, dans l'ordre, sans en sauter

### 1. Les contrôles que la CI exécutera de toute façon

La commande **Vérification** de la Fiche projet (`CLAUDE.md`) — une seule, exactement
ce que rejoue la CI, règles métier (`scripts/check-rules.mjs`) comprises.
*Exemple (VieSolution)* : `npm run typecheck && npm run lint && npx vitest run`.

Un seul rouge arrête tout. Ne jamais annoncer « c'est livré » avec un test qui
échoue — le dire et s'arrêter là. Fiche projet non remplie : la remplir d'abord
(avec la personne qui valide), pas deviner la commande.

Puis relire son propre diff avec une question : « qu'est-ce qui ferait échouer
la CI, ou la production ? ». Selon le type de changement :
- **règle de calcul** (argent, quantités, accès, dates) : test selon la skill
  `tester-dabord`, parité verte si la règle existe des deux côtés ;
- **migration** : fichier versionné, appliqué, et enregistré là où l'outil de
  migration du projet le note ;
- **fonction serveur** : redéploiement et appel réel non destructeur (règles
  absolues ci-dessus) ;
- **fichier YAML** (CI) : validé par un analyseur
  (`python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <fichier>`).

### 2. Vérification dans le navigateur, si le changement est visible

Si le chantier touche une page, un composant ou une route : démarrer le serveur
local (ligne **Serveur local** de la Fiche projet), ouvrir les écrans concernés,
cliquer les parcours modifiés, vérifier la console et les journaux. Contrôler
aussi la vue mobile 375 px.

Ne jamais demander à Camille de vérifier à sa place ce qui peut être vérifié ici.

### 3. `qa-agent` — obligatoire, jamais optionnel

C'est la règle de `.claude/rules/agent-workflow.md` (étape 5). Appel `Agent`
avec **`model: "opus"`** (jamais d'héritage du modèle de la session — voir
`.claude/rules/budget-jetons.md`). Lui déléguer un
regard indépendant sur le diff : `git diff` complet, ce que le chantier
prétendait faire, et la question « est-ce que ça le fait vraiment ? ».

Deux précautions apprises le 13 août :
- lui dire explicitement que **le plan est approuvé et qu'il exécute** — sinon il
  s'arrête pour demander une validation à quelqu'un qui ne l'entendra pas ;
- **repasser ses conclusions soi-même**. Un agent peut s'arrêter avant la fin de
  ses vérifications sans le signaler.

### 4. Mise à jour de `SUIVI-TACHES.md` et de `docs/ETAT-ACTUEL.md`

**Résumé du diff d'abord** (`git diff --stat` + 5 lignes en français : ce qui
change pour Camille ou le visiteur) — il sert à l'entrée du suivi, au message
de commit et au compte rendu.

`docs/ETAT-ACTUEL.md` (≤ 40 lignes) : retirer le chantier livré ou le passer
à l'étape suivante, mettre à jour les PR ouvertes, les décisions qui attendent
Camille et la prochaine entrée libre du suivi. **On remplace, on n'empile pas.**

Ne jamais lire `SUIVI-TACHES.md` en entier : `grep -n "^## " SUIVI-TACHES.md
| tail` pour trouver la dernière entrée, puis lecture ciblée.

Selon `.claude/rules/suivi-taches.md` : nouvelle section au format existant
(contexte, ce qui a été fait, vérification technique, **« Non fait dans ce
round »**), en-tête « Dernière mise à jour » rafraîchi, et statuts des tâches
déjà listées corrigés si le chantier les fait avancer.

La rubrique « Non fait » n'est pas décorative : c'est elle qui empêche la
prochaine session de croire un chantier terminé alors qu'il ne l'est pas.

```bash
node scripts/check-suivi.js; echo "code=$?"
```

### 5. Commit

Un commit par lot cohérent, message en français (`type(portée): résumé`),
après `qa-agent` si 2 fichiers ou plus (verrou de `agent-workflow.md`).
Le hook `.githooks/pre-commit` (actif si `git config core.hooksPath .githooks`)
rejoue `check-suivi.js` en avertissement et `check-rules.mjs` en blocage : un
refus du hook se corrige, il ne se contourne pas (`--no-verify` seulement avec
l'accord de la personne qui valide, raison dans le message de commit).
Pousser la branche de travail et ouvrir/mettre à jour la PR (brouillon) ;
**ne rien fusionner**. Puis surveiller la CI de la PR : un échec se diagnostique
(skill `incident`), il ne s'ignore pas.

### 6. Proposer la mise en ligne — sans la faire

Résumer ce qui part, puis **demander**. Ne jamais pousser en production sans
accord explicite de la personne qui valide (Fiche projet), même quand tout est
vert — et ce mot explicite (« fusionne », « mets en production ») vaut pour ce
lot-là seulement.

```bash
git status --short
git diff --stat
```

Mode de mise en ligne : ligne **Déploiement** de la Fiche projet (souvent :
fusion de la PR, puis skill `deploiement`). *Exemple (VieSolution)* : scripts
Windows `push-staging.bat` / `push-prod.bat`, qui passent par
`scripts/push-common.bat` et rejouent les vérifications et `check-suivi.js`.

## Compte rendu attendu

Ce qui a été livré, ce qui a été vérifié **et comment**, ce qui reste ouvert,
et le **coût réel** : somme des usages rapportés par les agents + estimation de
la session principale, comparé au « Coût estimé » du plan.
Si une étape a été sautée, le dire explicitement plutôt que de laisser croire
qu'elle a eu lieu.
