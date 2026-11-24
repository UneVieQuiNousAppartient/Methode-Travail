---
name: remonter-methode
description: Remonter dans le dépôt modèle methode-travail les améliorations de méthode faites dans un projet (règles, agents, skills, hooks, scripts de contrôle, CI) — tri commun / à adapter / propre au projet, chemins généralisés par la Fiche projet, chaque script avec son test, nouvelle version au CHANGELOG avec sa procédure de mise à jour, PR en brouillon dans methode-travail
when_to_use: La personne qui valide dit « remonte ça dans la méthode », « reporte dans methode-travail », « publie une nouvelle version de la méthode », ou une amélioration de .claude/, scripts/, .githooks/ ou de la CI d'un projet servirait à tous ses projets
user-invocable: true
argument-hint: "[depuis quand, ou quels éléments]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent, Skill
model: opus
effort: high
---

# Remonter une amélioration de méthode vers `methode-travail`

Méthode 1.7.0. Demande de Camille (24 nov. 2026) : « je ne veux plus recommencer ces étapes, il faut que ce soit
commun ». Cette skill est la démarche de la version 1.7.0 (report des améliorations de VieSolution-CSF), écrite une
fois pour toutes. Le chemin inverse est la skill `methode-a-jour`.

## 1. Préparer (≈ 30-60 k)
- Ajouter `methode-travail` à la session (outil `add_repo`, accès en écriture : la PR se fait là) et le cloner à côté.
- Lire son `README.md` (où va chaque chose : `modele/` se copie dans les projets, `kits/` ne se copie pas en bloc,
  `exemples/` pour la CI), son `CHANGELOG.md` et `VERSION`.
- Écart à reporter : version du projet (« Méthode : version X » de `docs/ETAT-ACTUEL.md`), date de la dernière
  version du modèle, puis `git log --since=<date> --stat -- .claude scripts .githooks .github docs/methode CLAUDE.md`
  dans le projet ; et `node scripts/comparer-methode.mjs <methode-travail>` (fichiers « communs différents » et
  « propres au projet » = candidats).
- Classement du projet s'il existe (ex. `docs/methode/COMMUN.md`) : commun / commun à adapter / propre.

## 2. Plan (attendre le « oui »)
Pour chaque élément : **commun** (copié dans `modele/`), **à adapter** (forme commune, contenu à remplir par projet),
**laissé de côté** (propre au projet : métier, réglementation, agents métier, listes du projet) avec la raison ; où il
va dans `methode-travail` ; coût estimé et lignes estimées. Ce qui servirait au-delà de la méthode (kits, gabarits) va
dans « Prochaines étapes », sans être fait.

## 3. Reporter — les règles du modèle
- **Aucun chemin propre au projet dans un script** : les lire dans la Fiche projet de `CLAUDE.md`
  (`scripts/lib-controles.mjs` : `lireConfig`) ; une clé nouvelle de la fiche est **facultative** (sinon tous les
  projets cassent) et s'ajoute à `CLES_FICHE` de `verifier-methode.mjs`.
- **Un script ou un hook arrive avec son test** (`modele/scripts/tests/`), avec un cas bloqué et un cas qui passe ;
  vérifier que le test **échoue** quand on casse la règle (une mutation, puis on remet).
- Listes propres au projet : un gabarit **vide** qui laisse la règle inactive, jamais la liste du projet source.
- Retirer les anecdotes datées du projet source des règles (elles vont, généralisées, dans
  `modele/docs/methode/*-details.md`) ; garder la ligne d'origine (projet, fichier, date) en tête de chaque fichier.
- Skill copiée d'ailleurs : avec son `SOURCE.md` ; la note propre au projet source devient une note générale.
- `modele/scripts/verifier-methode.mjs` contrôle chaque nouvel élément ; `node modele/scripts/verifier-methode.mjs
  --gabarit` (depuis `modele/`) sans ✖, et tous les tests au vert.

## 4. Version et livraison
- `VERSION` : mineure pour un ajout, majeure si l'installation est à refaire.
- `CHANGELOG.md` : pour chaque élément, d'où il vient (fichier et date dans le projet source), ce qu'il fait en une
  phrase ; puis la section **« Passer de <version> à <nouvelle> »** — la procédure que suivra `methode-a-jour`.
- `README.md` : tableau « Ce que le modèle apporte » et leçons du projet source.
- Revue indépendante (agent en lecture seule, Opus) du diff, une révision au plus ; PR **en brouillon** dans
  `methode-travail`. Rien n'est poussé dans le projet source. La personne qui valide fusionne.
