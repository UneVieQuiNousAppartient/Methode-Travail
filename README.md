# Méthode de travail — modèle commun

La méthode de travail de Camille avec Claude Code, extraite de VieSolution-CSF le 15 octobre 2026 après son
premier passage complet (chaîne de documents « plans d'action », A3). À copier dans chaque projet : Ben's,
trading, WFG, projets clients.

Pourquoi un dépôt à copier : une session Claude Code dans le cloud ne voit que le dépôt de son projet. Les
règles, agents et skills doivent donc vivre dans le `.claude/` de chaque dépôt.

**Version : voir `VERSION`** (historique : `CHANGELOG.md`). Chaque projet note la version reçue dans son
`docs/ETAT-ACTUEL.md` (« Méthode : version X »).

## Ce que le modèle apporte

| Élément | Où (dans `modele/`) | À quoi ça sert |
|---|---|---|
| **Fiche projet** | `CLAUDE.md`, section « Fiche projet » | Source unique des commandes et chemins : pile, dossiers de code, **commande de vérification = ce que rejoue la CI**, déploiement, contrôle après déploiement, routes, langues, personne qui valide. Lue par les agents, les skills et les scripts |
| Budget de jetons | `.claude/rules/budget-jetons.md` | Paliers (petit ≤ 200 k, moyen ≤ 1 M, gros = accord), coût estimé puis réel, grille Opus / Sonnet / Haiku, arrêt à la limite d'usage |
| Workflow | `.claude/rules/agent-workflow.md` | Plan avant action, déclencheur objectif, `qa-agent` avant tout commit de 2+ fichiers, bugs → issues, convention `SOURCE.md`, tableau des garde-fous |
| Suivi | `.claude/rules/suivi-taches.md` | `ETAT-ACTUEL.md` lu en premier, suivi jamais lu en entier, entrée obligatoire à chaque livraison |
| Règles métier | `.claude/rules/regles-metier.md` + `scripts/check-rules.mjs` | Un incident de contenu ou de sécurité récurrent devient une règle mécanique (id, incident, motif, dossiers, message), pas un rappel dans un agent |
| Réglages | `.claude/settings.json` | Agents en Opus par défaut ; hooks SessionStart, PreToolUse, PostToolUse ; liste de plugins à couper selon le projet |
| Hooks Claude Code | `scripts/hook-protect-files.mjs`, `scripts/hook-lint-fix.mjs` | Refus d'écrire `.env*`, verrous, artefacts ; `eslint --fix` sur chaque fichier écrit (si ESLint est installé) |
| Registre des erreurs connues | `docs/ERREURS-CONNUES.md` + règle `suivi-taches.md` | Message exact, cause prouvée, solution ; lu après `ETAT-ACTUEL.md` : une erreur déjà diagnostiquée ne se rediagnostique pas |
| Fichiers secrets suivis | `scripts/check-secrets-suivis.mjs` | Refuse un `.env`, un `.npmrc` avec jeton, une clé privée suivis par Git, ou un `.env.example` avec une vraie valeur |
| Hook Git | `.githooks/pre-commit` | `check-suivi.js --hook` (avertit, ne bloque pas) + `check-secrets-suivis.mjs` et `check-rules.mjs` (bloquent) ; actif après `git config core.hooksPath .githooks` |
| Démarrage | `scripts/session-start.sh` | En cloud : dépendances, navigateur de test, état du projet affiché |
| Contrôle de la méthode | `scripts/verifier-methode.mjs` | Réglages, frontmatter, scripts, Fiche projet remplie, dossiers de code, `SOURCE.md`, hook Git actif, registre des erreurs présent |
| Veille des skills copiées | `scripts/skills-check.mjs` | Signale les skills dont la source a changé en amont ; ne met rien à jour |
| Chaîne de documents | skill `nouveau-projet` + 5 agents de conception | BRIEF → PRD + APP-FLOW → SCHEMA → TRD → UI-GUIDE (+ maquettes Claude Design) → IMPLEMENTATION-PLAN → revue `qa-agent` |
| Agents de code | `orchestrateur`, `data-agent`, `ux-agent`, `ai-agent`, `qa-agent`, `prompt-agent` | Socle commun ; une section « Propre au projet » à remplir |
| Agents de revue | `securite`, `revue-integration` | Lecture seule, Opus, verdict binaire ; ne croient jamais le résumé de l'auteur |
| 13 skills | `.claude/skills/` | `nouveau-projet`, `livrer`, `point-projet`, `qa-feature`, `tester-dabord`, `nouvelle-page`, `audit-seo`, `deploiement`, `incident`, `client-onboarding`, `diagnostic-ai`, `email-automation`, `recommendation-engine` |
| Tester d'abord | skill `tester-dabord` | Règle de calcul critique (argent, quantités, accès, dates) en fonction pure + test écrit avant ou avec le code ; test de parité client ↔ serveur |
| Gabarits | `CLAUDE.md`, `docs/ETAT-ACTUEL.md`, `docs/ERREURS-CONNUES.md`, `docs/projets/_modele/BRIEF.md`, `.github/PULL_REQUEST_TEMPLATE.md` | Points de départ à remplir |
| Exemples | `exemples/` (hors `modele/`) | CI qui saute build et tests sur les PR de documentation ; CI de préproduction avec tests de fumée sur l'URL déployée ; description de PR obligatoire ; gitleaks ; `CODEOWNERS` ; Dependabot groupé ; `check-ownership.mjs` |

### Plusieurs agents sur un même dépôt : `exemples/check-ownership.mjs`

Quand deux agents (ou un agent et une personne) se partagent le code, chacun a un périmètre, et le périmètre
est **appliqué par hook**, pas seulement écrit : le même script sert de hook Claude Code (PreToolUse, refuse
l'écriture hors périmètre) et de hook Git (`--staged`, refuse le commit). Le copier dans `scripts/`, adapter la
carte, remplir la ligne « Hors périmètre de Claude » de la Fiche projet, décommenter l'appel dans `.githooks/pre-commit`.

### Skills copiées d'un autre dépôt : `SOURCE.md`

Toute skill reprise d'un dépôt externe porte, à côté de son `SKILL.md`, un `SOURCE.md` d'une ligne ou deux :
**dépôt** (URL avec le commit : `https://github.com/<dépôt>/tree/<commit>/<chemin>`), **commit**, **licence**,
**date** de copie (AAAA-MM-JJ). Exemple :

> Copié depuis https://github.com/addyosmani/web-quality-skills/tree/afa8da9/skills/accessibility le 2026-09-19
> (licence MIT). Ne pas modifier : remplacer par une copie plus récente au besoin.

Une skill copiée ne se modifie pas sur place ; `skills-check.mjs` dit quand la source a bougé, on relit le
diff, puis on remplace. Une skill qui déclare `source:` dans son frontmatter sans `SOURCE.md` fait échouer
`verifier-methode.mjs`.

## CI : bonnes pratiques

Tirées de la CI de Ben's (15 oct. 2026) et de VieSolution ; exemples dans `exemples/`. Le quota de minutes
GitHub Actions est une ressource : une CI qui tourne pour rien finit par bloquer celle qui compte.
- **`timeout-minutes` sur chaque job** (5 pour un contrôle, 15 pour la qualité, 20 pour des tests de bout en
  bout) : sans lui, un job bloqué tourne 6 heures.
- **`concurrency` + `cancel-in-progress: true`** par branche : un nouveau push annule l'exécution précédente.
- **CI de production au push sur `main` seulement**, pas en double sur la PR vers `main` : la PR a déjà été
  vérifiée sur sa branche (`ci-staging-smoke.yml`), la production rejoue après fusion.
- **`cache: npm`** dans `actions/setup-node` (ou l'équivalent de la pile) et `npm ci`.
- **Le job qualité lance exactement la commande Vérification** de la Fiche projet — rien de plus, rien de moins.
- **Tests de fumée contre l'URL déployée**, pas seulement en local (`ci-staging-smoke.yml`) : URL de
  préproduction **stable** (variable du dépôt), attente bornée avant les tests, rapport Playwright en artefact.
- **Secrets vérifiés avant usage** (étape qui échoue avec un message clair s'il en manque un), jamais
  affichés ; **`permissions` minimales** (`contents: read` par défaut).
- **PR documentée** (`check-pr-notes.yml`), **chemins sensibles relus** (`CODEOWNERS`), **historique sans
  secret** (`secret-scan.yml`, gitleaks avec base de référence), PR de documentation qui sautent build et
  tests (`ci-changes.yml`), Dependabot groupé (`dependabot.yml`).
- **YAML validé avant commit** : `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <fichier>`.

## Installer dans un projet

Ouvrir une session Claude Code sur le dépôt du projet, avec `methode-travail` ajouté à la session, et écrire :

> Installe la méthode depuis `methode-travail`.

La session doit alors, dans cet ordre :
1. **Inventorier** ce que le projet a déjà (`CLAUDE.md`, `.claude/`, agents, skills, CI) et présenter un plan de
   fusion avec son coût estimé (≈ 50-100 k). **Ne jamais écraser** un agent, une skill ou une règle existante :
   fusionner, ou garder les deux et signaler le doublon.
2. Copier le contenu de `modele/` à la racine du projet **seulement pour les fichiers absents**. Pour un
   fichier déjà présent (`CLAUDE.md`, `.claude/settings.json`, modèle de PR, agent ou skill du même nom) :
   fusionner à la main — ajouter les sections manquantes du gabarit, garder le contenu du projet.
3. **Adapter** :
   - `CLAUDE.md` : description, et surtout la **Fiche projet** (tableau à remplir ; « — » si sans objet).
     La ligne **Vérification** est UNE commande, exactement ce que rejoue la CI, qui inclut
     `node scripts/check-rules.mjs` (ex. un script `verify` dans `package.json`). Les anciennes
     « Commandes de vérification » du projet s'y fusionnent ;
   - `.claude/settings.json` : plugins inutiles au projet coupés (`"<nom>@synced": false`) ; hooks
     PreToolUse / PostToolUse fusionnés avec ceux du projet s'il en a ;
   - `scripts/session-start.sh` : étape 1 selon la pile (npm, pip…), étape 2 seulement si Playwright ;
   - `scripts/hook-protect-files.mjs` : fichiers protégés propres au projet ; `scripts/hook-lint-fix.mjs` :
     autre correcteur si la pile n'est pas JavaScript ;
   - `scripts/check-rules.mjs` : les incidents déjà vécus par le projet deviennent des règles (voir les
     exemples commentés) ; `scripts/check-secrets-suivis.mjs` : ajouté à la commande Vérification ;
   - `docs/ERREURS-CONNUES.md` : y reporter les erreurs déjà notées ailleurs dans le projet (mémoire,
     suivi), supprimer les deux lignes d'exemple ;
   - section « Propre au projet » de `orchestrateur`, `data-agent`, `ux-agent`, `ai-agent` ;
   - liste « Propres au projet » de `agent-workflow.md` ;
   - plusieurs agents sur le dépôt : `exemples/check-ownership.mjs` (voir plus haut).
4. Remplir `docs/ETAT-ACTUEL.md` (copié à l'étape 2), **avec la ligne « Méthode : version X »** (contenu de
   `VERSION`), et créer `SUIVI-TACHES.md` avec sa première entrée : l'installation de la méthode.
5. **Activer et vérifier** :
   - `git config core.hooksPath .githooks` (hook Git ; à refaire sur chaque clone, le dire dans `CLAUDE.md`) ;
   - `node scripts/verifier-methode.mjs` — doit finir sans ✖ (Fiche projet remplie, hooks présents,
     frontmatter lisible, scripts valides, dossiers de code existants) ;
   - `node scripts/check-rules.mjs` — vert, ou les violations trouvées deviennent des issues ;
   - passer `qa-agent`, puis commit sur une branche et PR brouillon.

Dans ce dépôt-ci, le gabarit se contrôle avec `node modele/scripts/verifier-methode.mjs --gabarit` (une
Fiche projet non remplie y est attendue).

Les nouveaux agents et skills ne se chargent qu'**à la session suivante**.

**Ben's (Les Jus Naturels Ben's)** a déjà son système (skill `jusbens-dev`, orchestrateur et 12 agents) : y
ajouter les règles, la chaîne de documents et les skills communes, sans remplacer ses agents métier. Sa skill
`tester-dabord` a le même nom que celle du modèle (qui en est tirée) : garder la sienne, propre au projet, et
signaler le doublon ; sa table « Erreurs connues » de `MEMORY.md` peut devenir son `docs/ERREURS-CONNUES.md`.

## Leçons du premier passage (VieSolution, 15 oct. 2026)

- **Agents de conception à court de tours** : dire dans le prompt quand écrire le fichier (« vers le tour 10 »)
  et donner les chemins de départ ; un agent arrêté se **reprend**, il ne se relance pas.
- **Vérifier les affirmations des agents** : un faux risque de sécurité (une migration lue sans la suivante) et
  un vrai trou Loi 25 ont été distingués en vérifiant dans le code avant de les répéter.
- **La revue croisée `qa-agent` des documents vaut son coût** : elle a trouvé 5 incohérences bloquantes entre
  SCHEMA, TRD et MAQUETTES avant toute ligne de code.
- **Les estimations de construction sont hautes** (un `qa-agent` Opus par phase) : faire coder les petits
  correctifs par l'agent principal, et recaler sur le coût réel du premier bloc.
- **Coût réel de la chaîne complète** : ≈ 1 M jetons pour 8 documents + Design System + 7 maquettes.

## Leçons de KHIEDUC (15 oct. 2026)

KHI Educ (Next.js, Supabase, deux agents sur deux branches) avait des garde-fous **mécaniques** que le modèle
n'avait pas ; ils sont repris dans la 1.1.0.
- **Une règle écrite ne suffit pas, une règle appliquée tient** : quatre revues ont refusé le même lot pour
  des contenus inventés tant que le rappel était dans un agent ; `check-rules.mjs` en pre-commit et en CI a
  arrêté la récidive.
- **Une seule commande de vérification, celle de la CI** (`npm run verify`) : plus de liste de commandes que
  chaque skill recopie et qui dérive.
- **Les périmètres se codent** (`check-ownership.mjs`, hook Claude Code + hook Git) au lieu de se rappeler.
- **Les revues ne croient pas l'auteur** : `revue-integration` et `securite` vérifient chaque affirmation
  dans le code, verdict binaire.
- **Les skills copiées gardent leur origine** (`SOURCE.md`) et se remplacent, elles ne se modifient pas.

## Leçons de Ben's (15 oct. 2026)

Les Jus Naturels Ben's (boutique en ligne, paiement réel, propriétaire non technique) avait des habitudes
que le modèle n'écrivait pas ; elles sont reprises dans la 1.2.0.
- **Une erreur diagnostiquée s'écrit** : sa table « Erreurs connues — NE JAMAIS RÉPÉTER » (15 lignes, message
  exact, cause, solution) évitait de repayer les mêmes diagnostics → `docs/ERREURS-CONNUES.md`.
- **Quand le site encaisse, chaque calcul a son test** — et un test de parité compare le total affiché au
  total facturé sur 5 000 paniers aléatoires → skill `tester-dabord`.
- **La cause en une phrase avant le correctif** : pas de changement « pour voir » → skill `incident`.
- **L'accord se proportionne au risque** : argent, paiement, accès, schéma, données de clients = accord avant
  le code ; le reste = annoncer puis faire. Et les questions se posent en français simple → `agent-workflow.md`.
- **Le mot explicite** (« fusionne », « mets en production ») et la fonction serveur **testée en direct**,
  pas seulement poussée → `livrer`.
- **La CI se protège elle-même** : délais, annulation des exécutions dépassées, tests de fumée sur le site
  déployé, secrets et fichiers sensibles refusés → `exemples/`, `check-secrets-suivis.mjs`.

## Tenir le modèle à jour

Une amélioration de la méthode faite dans un projet (règle, agent, skill, script) se reporte ici par une PR
— avec une entrée dans `CHANGELOG.md` et la version augmentée dans `VERSION` —, puis se redescend dans les
autres projets à leur prochaine session de travail ; la ligne « Méthode : version X » de leur
`docs/ETAT-ACTUEL.md` dit où chacun en est. Source du classement commun / propre :
`docs/methode/COMMUN.md` dans VieSolution-CSF.

## Limites connues

- La skill `nouveau-projet` est reconstruite d'après la fiche de VieSolution : le texte d'origine de
  `creer-docs-projet` reste à y recoller.
- Quatre skills restent bâties sur un cas VieSolution (`client-onboarding`, `diagnostic-ai`, `email-automation`,
  `recommendation-engine`) et le signalent en tête ; les neuf autres (livraison, contrôle, conception)
  passent, elles, par la Fiche projet.
- Des agents propres à VieSolution sont cités comme exemples sans être fournis : `conformite-agent` (garde-fou
  AMF des contenus IA), `automation-dev-agent` et `email-automation-agent` (courriels automatisés), `i18n-agent` (traductions, cité
  par `tech-lead` et `nouveau-projet`). Les créer
  dans le projet seulement s'il en a besoin.
- `hook-lint-fix.mjs` ne connaît qu'ESLint ; une autre pile ajoute son correcteur dans `CORRECTEURS`.
- `check-rules.mjs` n'a que deux règles génériques actives (secret en dur, marqueur de conflit) : sa valeur
  vient des règles que chaque projet y ajoute à partir de ses propres incidents.
- `check-secrets-suivis.mjs` ne voit que l'état courant de l'index Git : un secret déjà poussé reste dans
  l'historique (le révoquer ; `exemples/secret-scan.yml` parcourt l'historique). Sa liste de fichiers et de
  motifs est générique ; un projet ajoute ses propres fichiers sensibles. Il refuse **tout** `.env.*` suivi qui
  n'est pas un gabarit, y compris `.env.development` ou `.env.test` que certains projets (Vite) versionnent avec des
  valeurs publiques : les déclarer dans `AUTORISES`, avec la raison.
- `docs/ERREURS-CONNUES.md` ne vaut que s'il est tenu : rien ne vérifie mécaniquement qu'une erreur
  diagnostiquée y a été notée (c'est `incident` et `livrer` qui le demandent).
- La skill `tester-dabord` est indépendante de l'outil de test (Vitest, Jest, pytest…) : la commande vient de
  la Fiche projet. Le test de parité suppose que les deux fonctions (client, serveur) sont importables par le
  même outil de test.
- Les exemples de CI (`exemples/`) supposent GitHub Actions, Node et Playwright ; la commande de déploiement
  de `ci-staging-smoke.yml` est à brancher (Vercel en commentaire).
- Le hook Git n'est actif qu'après `git config core.hooksPath .githooks`, à refaire sur chaque clone ;
  `verifier-methode.mjs` le signale. La CI reste le filet : la commande Vérification doit y tourner.
- `scripts/check-suivi.js` est un module ES en `.js` : il demande Node ≥ 22.12 (détection automatique) ou
  `"type": "module"` dans le `package.json` du projet.
- `budget-jetons.md` renvoie à des constats datés de VieSolution : ils expliquent la règle, ils ne s'appliquent
  pas tels quels.
