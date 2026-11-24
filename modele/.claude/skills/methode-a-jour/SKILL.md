---
name: methode-a-jour
description: Mettre la méthode de travail d'un projet à jour depuis le dépôt modèle methode-travail — version du projet lue, procédures du CHANGELOG appliquées dans l'ordre, fichiers communs copiés, fichiers à adapter fusionnés à la main, rien de propre au projet écrasé, vérifié par verifier-methode et les tests
when_to_use: La personne qui valide dit « mets la méthode à jour », « passe le projet en 1.x », « redescends la méthode », ou docs/ETAT-ACTUEL.md porte une version de la méthode plus ancienne que le fichier VERSION de methode-travail
user-invocable: true
argument-hint: "[version cible, par défaut la dernière]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent, Skill
model: opus
effort: medium
---

# Mettre la méthode d'un projet à jour

Méthode 1.7.0. Demande de Camille (24 nov. 2026) : « je ne veux plus recommencer ces étapes, il faut que ce soit
commun ». Cette skill remplace le long message à réécrire à chaque mise à jour d'un projet (Ben's, KHI, Vie Solution
Web…). Elle suit la skill `tache` (plan, accord, `qa-agent`, PR) ; elle n'en est que le contenu.

## 1. Préparer (≈ 10 k)
- Le dépôt `methode-travail` doit être dans la session (outil `add_repo`, lecture seule, puis clone à côté du projet).
  Il ne reçoit **rien** depuis cette skill.
- Version du projet : ligne « Méthode : version X » de `docs/ETAT-ACTUEL.md`. Version cible : `VERSION` du modèle.
- `node scripts/comparer-methode.mjs <chemin de methode-travail>` (si le script manque, le copier d'abord depuis
  `modele/scripts/`) : liste des fichiers absents, communs différents, à adapter, propres au projet.
- Lire dans `CHANGELOG.md` du modèle **chaque version entre les deux**, section « Passer de … à … » : c'est la
  procédure à suivre ; les versions qui ne touchent que `kits/` n'ont rien à redescendre.

## 2. Plan (attendre le « oui »)
Tableau en trois colonnes : **copié tel quel** (absents, communs identiques ailleurs) · **fusionné à la main** (à
adapter : `CLAUDE.md`, `settings.json`, agents, règles, `check-rules.mjs`, CI) · **laissé de côté** (avec la raison :
pile différente, déjà mieux dans le projet → à remonter avec `remonter-methode`). Coût estimé (≈ 100-250 k selon
l'écart) et lignes estimées.
- **Communs différents** : relire le diff. Si le projet a **amélioré** le fichier, ne pas l'écraser : le noter pour
  `remonter-methode`. Sinon, reprendre la version du modèle.
- **Jamais écraser** un agent, une skill ou une règle propre au projet ; un doublon de nom se signale.

## 3. Appliquer
- Copier les fichiers absents et les communs retenus (un `cp` par fichier, pas de copie en bloc de `modele/`).
- Fusionner les fichiers à adapter : ajouter les sections et clés nouvelles du gabarit, garder le contenu du projet
  (Fiche projet : remplir les clés nouvelles, « — » si sans objet).
- Listes propres au projet (ex. `scripts/architecture-existant.json`, `couleurs-autorisees.json`) : les remplir selon
  la procédure du CHANGELOG — les infractions **existantes** se tolèrent avec l'accord de la personne qui valide, les
  nouvelles se refusent.
- Mettre « Méthode : version <cible> » dans `docs/ETAT-ACTUEL.md`.

## 4. Vérifier et livrer
- `node scripts/verifier-methode.mjs` (aucun ✖), `node --test scripts/tests/controles.test.mjs`, la commande
  **Vérification** de la Fiche projet, `node scripts/check-rules.mjs`.
- `qa-agent` (Opus) sur le diff ; entrée au suivi (« Méthode passée de X à Y » + « Non fait dans ce round ») ;
  PR en brouillon. La personne qui valide fusionne.
- Les nouveaux hooks, agents et skills ne se chargent qu'**à la session suivante** : le dire.
- Rapport en mots simples : ce qui a été repris, laissé de côté (et pourquoi), à remonter, coût réel.
