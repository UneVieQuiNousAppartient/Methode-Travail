# Historique du modèle

Version courante : fichier `VERSION`. Chaque projet note la version reçue dans `docs/ETAT-ACTUEL.md`
(« Méthode : version X ») ; un écart avec ce fichier dit ce qui reste à redescendre.
Numérotation : majeure = changement qui demande de refaire l'installation ; mineure = ajout ;
correctif = précision de texte.

## 1.4.0 — 30 oct. 2026 — Kit CRM TS, lot 1 (site public, formulaires, courriels)

Demande de Camille : « prendre les meilleurs entre VieSolution, Web et KHI », lot 1. Chaque brique est copiée de
sa meilleure source d'après la comparaison du 30 oct. (`VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md`),
avec sa ligne d'origine (projet, chemin, commit) ; plan : `projets/kit-ts/IMPLEMENTATION-PLAN.md`.
- **`kits/crm/ts/`** (nouveau) : mini-projet Next.js + TypeScript strict à copier à la racine d'un projet —
  adresse du site (KHI), IP fiable (CSF), anti-abus avec compteur en base, repli mémoire qui limite toujours et
  taille de corps (CSF) + table des limites (KHI), Turnstile (KHI + refus 503 de CSF + nom d'hôte facultatif),
  CSP bloquante avec mode observation par défaut (CSF + Web) et route de rapports, redirection interne sûre
  (CSF + cas de KHI), consentement jamais précoché (CSF, principe seul), envoi Resend (Web), désabonnement en un
  clic + règles LCAP (Web + KHI), garde du secret cron (CSF) ; migrations `0101_rate_limits.sql` et
  `0102_lcap_desabonnement.sql` (colonnes sur `leads`) ; `.env.exemple` ; mode d'emploi `ts/BRIQUE.md`
  (passage de la CSP en actif, tests de la source non repris et pourquoi).
- **`modele/scripts/check-rules.mjs`** : 4 règles génériques reprises de VieSolution — `consentement-precoche`,
  `stockage-direct`, `police-google`, `temoignages-demo`, chacune avec son incident.
- **`CATALOGUE.md`** : colonne « TS » (familles 1, 4, 5, 8) et 6 nouvelles lignes (IP, CSP, redirection,
  consentement, garde cron, tests TS). **README du kit** : `ts/`, pile JS / TS, ordre d'installation, vérification.
  **Skill `nouveau-crm`** : pile TS → `kits/crm/ts/`, socle « site public », ordre d'installation TS, `npm run
  verify` hors projet et règle E15 (mutations dans une copie `mktemp -d` seulement).
- **Écarts corrigés dans le kit** : n° 3 (panne de base = tout passait), n° 4 (IP lue à un seul endroit), n° 7
  (Turnstile : délai de 5 s, nom d'hôte). Secret des liens de désabonnement durci à 32 caractères (16 dans les
  sources). Kit JS non touché.
- **Vérifié** : `tsc --noEmit` strict + Vitest, 16 fichiers, 339 tests au vert dans un dossier `mktemp -d`
  (versions épinglées sur VieSolution-CSF ; `legacy-peer-deps` à cause d'un bogue de npm 10 avec Vitest 4) ;
  chaque brique vue en échec une fois, règle cassée dans une copie temporaire seulement ; les 4 règles
  `check-rules` vues bloquantes sur une copie, `check-rules` sans violation sur le modèle et sur `kits/crm/ts/` ;
  revues `qa-agent` à chaque phase et en fin de lot.
- **Pas encore vérifié** : les deux migrations n'ont jamais été jouées sur une base neuve ; aucune brique n'est
  encore installée dans un projet réel (routes jamais servies par un vrai `next build`) ; la CSP n'a pas été
  observée dans un navigateur ; la comparaison de jetons à temps constant n'est pas prouvable par un test de
  comportement (relue à la main).

## 1.3.0 — 21 oct. 2026 — Kit CRM (apports de KHI Educ)

Demande de Camille : « mettre cette façon de faire les CRM dans la méthode, surtout l'admin, les auths, les
fonctions, pour ne pas recommencer à zéro ». Généralisé depuis KHI Educ (Next.js, Supabase, Vercel).
- **`kits/crm/`** (nouveau, hors `modele/` : on y choisit des briques, on ne le copie pas en bloc) :
  - `CATALOGUE.md` — toutes les briques, par famille (accès, admin, fonctions CRM, courriels et
    automatisations, contenu, vie privée, IA, tests), « code » ou « fiche » ;
  - `LECONS.md` — 24 leçons (base, authentification, écrans, contenu, livraison), cause prouvée et parade ;
  - `auth/` — code : liste blanche, rôles par route, espaces par rôle, double authentification,
    « se souvenir de cet appareil 30 jours » (serveur + base), journal, clés d'API ; migrations et tests ;
  - `admin/` — code : coquille, `apiFetch`, confirmations, fiche en page, tableaux et graphiques, écrans de
    double authentification, squelette d'écran ; `PATTERNS.md` (règles d'écran) ;
  - `tests/` — code : faux Supabase en mémoire, loaders, lanceur, harnais de simulation de l'admin réel.
- **Skill `nouveau-crm`** (nouvelle, 14 skills) : choisir les briques avec l'utilisatrice, accord avant
  l'authentification et le schéma, installation dans l'ordre (accès, tests, admin, options, métier),
  vérification de chaque brique (tests cassés une fois, simulation, `securite`), retour au kit.
- **README** : ligne « Kit CRM » dans le tableau, leçons de KHI Educ (suite).
- **Vérifié** : 3 fichiers de tests de la brique auth au vert (87 contrôles) dans un dossier temporaire, et en
  échec quand on retire la vérification du compte dans `deviceAccepts` ; revue `qa` sans point bloquant.
- **Pas encore vérifié** : les 4 migrations n'ont jamais été jouées telles quelles sur une base neuve (leurs
  politiques sont contrôlées par le texte) ; le harnais de simulation n'a tourné que sur une page d'essai, pas
  sur un admin construit avec le kit — à faire au premier projet qui l'utilise.

## 1.2.0 — 15 oct. 2026 — Erreurs connues, tester d'abord, livraison sûre (apports de Ben's)

Généralisé depuis Les Jus Naturels Ben's (React, Supabase, paiement en ligne) : ses skills
`planifier-avant-coder`, `tester-dabord`, `verifier-avant-livrer`, `deboguer-methodiquement`, sa table
« Erreurs connues » (`MEMORY.md`, E01-E15) et sa CI. Rien de propre à Ben's hors exemples marqués.
- **Registre des erreurs connues** : gabarit `docs/ERREURS-CONNUES.md` (table `| # | Erreur (message exact) |
  Cause | Solution | Règle |`, E01…) ; règle dans `suivi-taches.md` (lu après `ETAT-ACTUEL.md`, toute erreur
  reproduite ou diagnostiquée y entre, ce qui est mécanisable devient en plus une règle de `check-rules.mjs`) ;
  ordre de lecture mis à jour dans `CLAUDE.md`, `budget-jetons.md`, `docs/ETAT-ACTUEL.md` ;
  `verifier-methode.mjs` exige le fichier.
- **Skill `tester-dabord`** (nouvelle, 13 skills) : règle de calcul critique (argent, quantités, droits
  d'accès, dates de facturation) dans une fonction pure + test à côté, écrit avant ou avec le code ; bornes et
  cas « méchant » ; un test qui n'échoue pas quand on casse la règle ne protège rien (vérifié une fois) ; test
  de parité quand la règle existe côté client et côté serveur. Citée par `qa-feature`, `incident`, `livrer`
  et `agent-workflow.md`.
- **`incident`** : démarche de débogage méthodique — registre consulté d'abord, message EXACT, isoler,
  **cause en une phrase avant de toucher au code**, correction au plus juste, preuve (échec avant, succès
  après), cause notée dans `ERREURS-CONNUES.md`.
- **`agent-workflow.md`** : section « Accord avant de coder, ou annonce puis exécution » — argent, paiement,
  authentification, schéma, données de clients : plan **et accord** avant la première ligne, même pour un
  seul fichier ; le reste sous le déclencheur : annoncer puis faire. Reformuler en une phrase ; question en
  français simple si c'est ambigu. (Le processus complet et son accord à l'étape 3 restent inchangés.)
- **`livrer`** : « Règles absolues » — aucune fusion ni mise en production sans le mot explicite (« fusionne »,
  « mets en production ») ; rien qui modifie des données de clients sans accord ; pas d'identifiant de modèle
  d'IA dans commits, PR et code ; PR brouillon puis surveillance après un push ; fonction serveur redéployée
  **et** testée en direct (appel non destructeur). Relecture du diff par type de changement.
- **`scripts/check-secrets-suivis.mjs`** (nouveau, branché dans `.githooks/pre-commit`, bloquant, et à mettre
  dans la Vérification) : refuse un `.env`, `.env.local`, `.env.production`…, un `.npmrc` / `.yarnrc.yml` /
  `.pypirc` avec jeton en clair, une clé privée, suivis par Git ; refuse un `.env.example` qui contient une
  vraie valeur. Script à part : le format ligne par ligne de `check-rules.mjs` ne voit pas la présence d'un fichier.
- **Exemples de CI** (`exemples/`) : `ci-staging-smoke.yml` (qualité → déploiement d'aperçu → tests de fumée
  Playwright contre l'URL déployée), `check-pr-notes.yml` (description de PR obligatoire, alignée sur le
  modèle de PR), `secret-scan.yml` (gitleaks sur tout l'historique, base de référence facultative),
  `CODEOWNERS` (auth, paiement, migrations, CI). README : section « CI : bonnes pratiques ».

## 1.1.0 — 15 oct. 2026 — Garde-fous mécaniques et Fiche projet (apports de KHI Educ)

- **Fiche projet** dans `CLAUDE.md` : source unique des commandes et chemins (pile, dossiers de code,
  commande de vérification = ce que rejoue la CI, déploiement, contrôle après déploiement, routes, langues,
  personne qui valide). Remplace la section « Commandes de vérification ».
- Skills `livrer`, `qa-feature`, `incident`, `deploiement`, `point-projet`, `audit-seo`, `nouvelle-page` et
  agent `qa-agent` renvoient à la fiche ; les commandes et chemins de VieSolution n'y restent que marqués
  *Exemple*. Bandeau « à remplacer à l'installation » retiré de ces skills.
- Hooks Claude Code : `scripts/hook-protect-files.mjs` (PreToolUse, refuse `.env*`, verrous, artefacts) et
  `scripts/hook-lint-fix.mjs` (PostToolUse, `eslint --fix` s'il est installé), déclarés dans
  `.claude/settings.json`.
- `scripts/check-rules.mjs` (règles métier mécaniques, 2 règles génériques actives + 2 exemples commentés) et
  règle `.claude/rules/regles-metier.md`.
- Hook Git `.githooks/pre-commit` : `check-suivi.js --hook` (avertissement) + `check-rules.mjs` (bloquant) ;
  remplace, dans `livrer` et `deploiement`, la dépendance aux scripts `push-*.bat` de VieSolution (cités en
  exemple). `check-suivi.js` lit ses dossiers dans la Fiche projet et gagne le mode `--hook`.
- Agents `securite` et `revue-integration` (lecture seule, Opus, verdict binaire).
- Convention `SOURCE.md` pour les skills copiées d'un autre dépôt ; `scripts/skills-check.mjs` (veille).
- `scripts/verifier-methode.mjs` : contrôle de l'installation (étape 5 de l'installation, `point-projet`).
- `exemples/check-ownership.mjs` : un périmètre par agent, appliqué par hook.
- Versionnement : `VERSION`, ce fichier, ligne « Méthode : version X » dans `docs/ETAT-ACTUEL.md`.

## 1.0.0 — 15 oct. 2026 — Extraction de VieSolution-CSF

Première version : règles (budget de jetons, workflow, suivi), réglages et hook de démarrage, chaîne de
documents `nouveau-projet` et ses 5 agents de conception, 6 agents de code, 12 skills, gabarits, exemples de
CI et de Dependabot. Extraite de VieSolution-CSF après son premier passage complet.
