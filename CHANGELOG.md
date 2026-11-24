# Historique du modèle

Version courante : fichier `VERSION`. Chaque projet note la version reçue dans `docs/ETAT-ACTUEL.md`
(« Méthode : version X ») ; un écart avec ce fichier dit ce qui reste à redescendre.
Numérotation : majeure = changement qui demande de refaire l'installation ; mineure = ajout ;
correctif = précision de texte.

## 1.7.0 — 2026-11-24 — Contrôles mécaniques, parcours `tache`, mise à jour en une commande (apports de VieSolution, nov. 2026)

Report dans `modele/` de tout ce qui est **commun** dans les améliorations de méthode de VieSolution-CSF depuis le
31 oct. 2026 (écart `df3ff89..main` sur `.claude`, `scripts`, `.githooks`, `docs/methode`, `CLAUDE.md`, `.github` ;
classement de `docs/methode/COMMUN.md`). Principe repris de la 1.1.0 : **aucun chemin propre à un projet dans un
script** — les contrôles lisent la Fiche projet de `CLAUDE.md` (« Dossiers de code », « Routes publiques », et la
nouvelle clé facultative « Chemins sensibles ») par `scripts/lib-controles.mjs`. Chaque script arrive avec son test.

### Ajouté (commun, copié tel quel dans un projet)

| Élément | Origine dans VieSolution-CSF | Ce qu'il fait |
|---|---|---|
| Skill `tache` + `references/maquettes.md` | `.claude/skills/tache/`, 6-15 nov. 2026 | Le même parcours en 8 étapes pour chaque demande (origine, comprendre, normes, skills, plan et coût, faire, montrer, vérifier, livrer), avec la ligne de suivi des étapes et la maquette en images par défaut. |
| `.claude/skills/REGISTRE.md` | même chemin, 6 nov. 2026 | Quelle skill sert à quoi, d'où elle vient, quel agent la précharge, quoi faire si elle manque. |
| Verrou `qa-agent` : `scripts/hook-qa-trace.mjs`, `scripts/check-qa-trace.mjs` | mêmes chemins, 14 nov. 2026 (suivi 14l) | À la fin d'un `qa-agent` « VERDICT QA : OK », note l'empreinte des fichiers ; le hook Git refuse un commit de 2 fichiers ou plus (ou 1 sensible) qui n'a pas été vérifié tel quel. |
| `scripts/hook-garde-git.mjs` | même chemin, 14 nov. 2026 | Refuse à Claude `--no-verify`, `git commit -n`, un `core.hooksPath` détourné et toute écriture de la trace `qa-agent`. |
| `scripts/check-taille-diff.mjs` | même chemin, 14 nov. 2026 | « Moins de code » : avertit quand un fichier déjà long grossit, ou quand beaucoup de code est ajouté sans rien retirer ; donne les lignes réelles d'une livraison. |
| `scripts/hook-rappel-tache.mjs` | même chemin, 6 nov. 2026 | Rappelle à chaque message le parcours `tache` (≈ 130 jetons). |
| `scripts/hook-rappel-skills.mjs` | même chemin, 14 nov. 2026 | À la première modification d'un dossier de code : rappel si aucune skill n'est chargée, et au plus 3 tâches semblables déjà faites (au suivi). |
| `scripts/check-livraison-pr.mjs` | même chemin, 14 nov. 2026 | En CI, refuse une PR qui touche le code sans entrée au suivi ni `docs/ETAT-ACTUEL.md` à jour ; avertit pour une page `maquette-*` restante, un nouvel écran ou > 800 lignes sans `IMPLEMENTATION-PLAN.md`. |
| `scripts/check-skills-agents.mjs` | même chemin, 6 nov. 2026 | Signale une skill demandée par un agent mais introuvable (elle manque sinon sans aucun message). |
| `scripts/lib-controles.mjs` + `scripts/tests/controles.test.mjs` | mêmes chemins, 14 nov. 2026 | Cœur commun des contrôles, **généralisé** (chemins lus dans la Fiche projet ; un nom de fichier seul, ex. `middleware.ts`, vaut à toute profondeur ; fichiers de dépendances Python, PHP, Ruby, Go, Rust sensibles comme `package.json`) ; 16 tests (`node --test`), un cas bloqué et un cas qui passe par contrôle. |
| 5 skills copiées avec `SOURCE.md` : `architecture`, `tech-debt` (Anthropic), `frontend-design` (Anthropic), `web-design-guidelines`, `vercel-react-best-practices` (Vercel) | `.claude/skills/`, 5-11 nov. 2026 | Décisions d'architecture, dette des fichiers touchés, direction visuelle, revue d'interface et d'accessibilité, bonnes pratiques React. La note propre à VieSolution de chaque `SOURCE.md` est devenue une note générale. `vercel-react-best-practices` : projet React seulement. |
| `docs/methode/agent-workflow-details.md`, `budget-jetons-details.md`, `suivi-taches-details.md` | mêmes chemins, 14-15 nov. 2026 | Le détail et les raisons des règles, lus seulement au besoin ; **réécrits** sans les anecdotes de VieSolution (seuls quelques constats datés expliquent une règle). |

### Ajouté (nouveau, pour ne plus recommencer ces étapes)

Demande de Camille (24 nov. 2026) : « je ne veux plus recommencer ces étapes, il faut que ce soit commun ».
- **`scripts/comparer-methode.mjs`** (+ test) : dans un projet, `node scripts/comparer-methode.mjs <methode-travail>`
  dit, pour chaque fichier du modèle, s'il est identique, absent, commun mais différent, ou à adapter, et liste les
  fichiers propres au projet ; donne la version du modèle et celle du projet.
- **Skill `methode-a-jour`** : « mets la méthode à jour » dans un projet — lit sa version, applique dans l'ordre les
  sections « Passer de … à … » de ce CHANGELOG, ne remplace rien de propre au projet, vérifie, PR en brouillon.
- **Skill `remonter-methode`** : la démarche de cette version-ci, écrite une fois pour toutes — « remonte ça dans la
  méthode » depuis un projet.

### Commun à adapter (forme commune, contenu du projet)

- **`scripts/check-rules.mjs`** (VieSolution, 4-6 nov. 2026) : le moteur passe aux règles l'index de la ligne et le
  fichier entier, accepte un fichier comme entrée de « Dossiers de code » et l'option `--seulement <ids>` (tests) ; 4 règles reprises — `date-sans-fuseau` (toujours active), `fichier-trop-long`,
  `acces-base-hors-domaine`, `couleur-hors-palette` — qui analysent les « Dossiers de code ». Leurs listes sont deux
  gabarits **vides** : `scripts/architecture-existant.json` (dossiers où la base peut être lue, infractions déjà là,
  `lignes_max`) et `scripts/couleurs-autorisees.json` (palette). Fichier absent ou liste vide : règle inactive ;
  fichier illisible : `check-rules` échoue. `composant-de-base-en-double` reste un exemple en commentaire.
- **Règles** `agent-workflow.md` (déclencheur vérifié par le hook, seuil des documents, réutiliser avant de
  construire, moins de code, skills et plugins), `budget-jetons.md` (lignes estimées, grille par agent, Sonnet
  possible pour l'exécution d'interface, grep de l'issue avant un plan), `suivi-taches.md` (contrôle de la PR) :
  allégées, le détail dans `docs/methode/`.
- **`CLAUDE.md`** : skill `tache` et registre dans l'ordre de lecture ; clé facultative **« Chemins sensibles »** ;
  paragraphe des hooks Git.
- **`.claude/settings.json`** : hooks `PreToolUse` Bash (garde Git), `PostToolUse` (rappel des skills),
  `UserPromptSubmit` (rappel du parcours), `SubagentStart` / `SubagentStop` sur `qa-agent` (verrou).
- **`.githooks/pre-commit`** : `check-taille-diff` et maquettes (avertissent), verrou `qa-agent` (bloque) ; plus de
  « contournement ponctuel ».
- **`scripts/session-start.sh`** : active le hook Git à chaque session Claude (il ne tournait pas en cloud) et lance
  `check-skills-agents`.
- **Agents** : `qa-agent` (outil `Skill`, 45 tours, partie « Moins de code », dernière ligne `VERDICT QA : OK/KO`),
  `ux-agent` (skills préchargées, rappels de maquette, « Revue obligatoire » en quatre preuves ; reste en Opus,
  Sonnet au choix du projet), `ux-designer` (précharge `frontend-design`), `securite` (40 tours) ; skill
  `nouvelle-page` (maquette en images).
- **`scripts/verifier-methode.mjs`** : clé « Chemins sensibles » ; partie 8 « Contrôles mécaniques » (scripts
  présents, hooks branchés, listes lisibles, verdict de `qa-agent`, registre à jour, skill `tache`, tests au vert) ;
  `node --check` des tests.
- **`exemples/`** : `ci-changes.yml` gagne un job `methode` qui tourne toujours (tests des contrôles, contrôle de
  livraison de la PR) ; `ci-staging-smoke.yml` garde le navigateur de Playwright en cache.

### Corrigé après la revue indépendante (Opus, lecture seule, 24 nov. 2026)

- **Contournement du verrou par `CLAUDE.md`** (bloquant, nouveau avec la généralisation) : la liste sensible venant de
  la Fiche, retirer une ligne de `CLAUDE.md` (un `.md`, jamais compté) suffisait à laisser passer un fichier sensible.
  Désormais `check-qa-trace.mjs` réunit la Fiche du dernier commit, de l'index et du disque, et un commit qui change
  une clé lue par les contrôles (« Dossiers de code », « Routes publiques », « Chemins sensibles ») exige `qa-agent`
  sur `CLAUDE.md`. Test ajouté ; mutation (Fiche lue sur le disque seulement) vue en échec.
- `middleware.ts` écrit seul dans la Fiche ne protégeait pas `src/middleware.ts` → un nom de fichier seul vaut à
  toute profondeur (test et mutation).
- Une valeur de « Routes publiques » ou « Chemins sensibles » sans accents graves était ignorée en silence →
  `verifier-methode.mjs` la refuse (✖).
- Le test des règles d'architecture lançait aussi les règles propres au projet → `check-rules.mjs --seulement`.
- `dossiers_domaine` sans `/` final normalisé ; `.claude/` (repli par défaut des dossiers de code) exclu du comptage
  « moins de code » et des règles d'architecture.

### Laissé de côté (propre à VieSolution)

AMF, estimateurs, ABF (`scripts/abf-parite/`), Loi 25 propre au produit, règles `etape-dossier-directe` et
« Camille est un homme », agents métier (`conformite-agent`, `diagnostic-agent`, `email-automation-agent`,
`automation-dev-agent`, `learning-paths-agent`, `suivi-agent`, `vente-agent`, `crm-sync-agent`,
`conversation-agent`, `marketing-agent`, `planification-agent`), règles `ai-integration.md` et
`anti-egress-performance.md`, contenu de `couleurs-autorisees.json` et `architecture-existant.json`, plugins
d'usage ponctuel du registre (Deep Refactor, Dashboard Design), lien du projet Claude Design, cache Playwright de
`ci-production.yml` (même changement que l'exemple de préproduction). `react-purity-rules.md` (commun à adapter pour
React) n'a pas changé depuis le 31 oct. : non repris dans ce lot.

### Vérifié

- `node --test modele/scripts/tests/controles.test.mjs` : 16 tests au vert ; quatre mutations (fichier sensible non
  compté, tolérance d'architecture ignorée, Fiche lue sur le disque seulement, nom de fichier seul ignoré) vues en
  échec, puis remises.
- `kits/crm/ts` (non modifié) : `npm run verify` dans une copie `mktemp -d`, 41 fichiers, 793 tests au vert.
- `node modele/scripts/verifier-methode.mjs --gabarit` (depuis `modele/`) : 0 ✖ ; 3 ⚠ attendus (dossiers de code
  absents du gabarit ; `frontend-design/SOURCE.md` sans dépôt ni commit, copiée d'un plugin installé).
- YAML des deux exemples validé.

### Pas encore vérifié

- Le verrou `qa-agent` n'a pas tourné dans une vraie session sur un **autre** projet que VieSolution (il dépend des
  champs `agent_type` et `agent_transcript_path` des hooks de Claude Code, vérifiés le 14 nov. 2026, version 2.1.325).
- Les 4 règles d'architecture n'ont pas été lancées sur Ben's, KHI ni Vie Solution Web : leur premier passage
  remplira les listes de tolérance.

### Passer de 1.2.0 (ou 1.3.0 à 1.6.0) à 1.7.0

Les versions 1.3.0 à 1.6.0 n'ont touché que `kits/`, sauf la 1.4.0 qui a ajouté 4 règles à `check-rules.mjs`
(`consentement-precoche`, `stockage-direct`, `police-google`, `temoignages-demo`) : un projet en 1.2.0 les reprend
au passage (étape 4). Avec la skill `methode-a-jour`, ou à la main :
1. **Ajouter `methode-travail` à la session**, le cloner à côté, copier `modele/scripts/comparer-methode.mjs` dans
   `scripts/` et lancer `node scripts/comparer-methode.mjs <methode-travail>` : c'est la liste de travail.
2. **Copier tels quels** (s'ils sont absents) : `scripts/lib-controles.mjs`, `hook-qa-trace.mjs`,
   `check-qa-trace.mjs`, `hook-garde-git.mjs`, `check-taille-diff.mjs`, `hook-rappel-tache.mjs`,
   `hook-rappel-skills.mjs`, `check-livraison-pr.mjs`, `check-skills-agents.mjs`, `comparer-methode.mjs`,
   `scripts/tests/controles.test.mjs` ; **`scripts/verifier-methode.mjs`** (remplacé par celui du modèle : il contrôle
   la 1.7.0) ; `.claude/skills/tache/`, `methode-a-jour/`, `remonter-methode/` ; les 5 skills
   copiées avec leur `SOURCE.md` (retirer `vercel-react-best-practices` hors React) ; `docs/methode/*-details.md`
   (fusionner si le projet en a déjà).
3. **Fusionner** (garder le contenu du projet, ajouter ce qui manque) :
   - `.claude/settings.json` : les 5 hooks (Bash → `hook-garde-git`, PostToolUse → `hook-rappel-skills`,
     `UserPromptSubmit`, `SubagentStart` et `SubagentStop` avec `"matcher": "qa-agent"`) ;
   - `.githooks/pre-commit` : blocs `check-taille-diff`, `check-qa-trace`, `check-livraison-pr --maquettes` ;
   - `scripts/session-start.sh` : étape 0 (`git config core.hooksPath .githooks`) et étape 4 (`check-skills-agents`) ;
     un projet qui a d'autres hooks Git (husky…) les appelle depuis `.githooks/pre-commit` ;
   - `CLAUDE.md` : ligne `tache` / registre dans l'ordre de lecture, clé **« Chemins sensibles »** remplie, chaque
     chemin entre accents graves (authentification, accès, base, paiement ; « — » sinon), paragraphe des hooks Git ;
   - `.claude/agents/qa-agent.md` : la dernière ligne `VERDICT QA : OK/KO` est **obligatoire** (sans elle, le verrou
     refuse tous les commits), plus l'outil `Skill`, `maxTurns: 45` et la partie « Moins de code » ;
     `ux-agent.md`, `ux-designer.md`, `securite.md` : voir « Commun à adapter » ; skill `nouvelle-page` (étape 0 :
     maquette en images ; modèle de `ux-agent`) ;
   - `.claude/rules/agent-workflow.md`, `budget-jetons.md`, `suivi-taches.md` : nouvelles sections, en gardant les
     listes propres au projet (agents, constats) ; `.claude/skills/REGISTRE.md` : partir du gabarit, ajouter les
     skills et plugins du projet.
4. **`scripts/check-rules.mjs`** : reprendre du modèle l'import de `lib-controles.mjs`, le bloc « Règles
   d'architecture », l'appel `regle.motif(ligne, rel, i, lignes)`, `fichiers()` (fichier accepté), l'option
   `--seulement` (utilisée par les tests), l'arrêt sur liste illisible et les règles absentes du projet ; garder ses
   règles propres. Puis **remplir les listes** : copier les deux gabarits JSON, mettre `dossiers_domaine` (ex.
   `["src/lib/"]`) et la palette du guide d'interface ; lancer `node scripts/check-rules.mjs` ; les fichiers déjà en
   infraction vont dans `acces_base` / `fichiers_longs` (avec l'accord de la personne qui valide), les dates sans
   fuseau se corrigent ou portent `regle-ok: date-sans-fuseau` avec la raison. Une liste ne fait ensuite que rétrécir.
5. **CI** : ajouter le job `methode` d'`exemples/ci-changes.yml` (ou ses deux commandes dans le job qualité, avec
   `fetch-depth` suffisant pour comparer à la base).
6. **Vérifier** : `node scripts/verifier-methode.mjs` sans ✖, `node --test scripts/tests/controles.test.mjs`, la
   commande Vérification ; « Méthode : version 1.7.0 » dans `docs/ETAT-ACTUEL.md` ; `qa-agent` (le premier commit qui
   ajoute les hooks est lui-même soumis au verrou à la session suivante seulement) ; PR en brouillon.
7. **Session suivante** : les nouveaux hooks, agents et skills ne se chargent qu'alors.

Coût constaté de ce report : voir la PR de cette version. Coût attendu pour un projet : ≈ 100 à 200 k.

### Prochaines étapes (vers « un Lovable pour mes clients », non faites)

Vision de Camille : démarrer chaque nouveau projet client (CRM ou site web) depuis ce dépôt, sans recommencer.
1. **Démarrage automatique d'un projet client** — skill `nouveau-projet-client` + script `demarrer-projet.mjs` :
   crée le dépôt à partir de `modele/`, remplit la Fiche projet par questions simples (pile, domaine, personne qui
   valide), active les hooks, ouvre la première PR. ≈ 300-400 k.
2. **Gabarit de site** (`kits/site/`) : Next.js + TypeScript strict, pages publiques de base, SEO, sitemap, CSP,
   formulaires et courriels (briques du lot 1 de `kits/crm/ts/`), déploiement Vercel, tests de fumée. ≈ 600-800 k.
3. **Kit CRM TypeScript, écrans** : routes et écrans de l'admin (liste, fiche, poste d'appel) sur les briques des lots
   1, 2 et 1.6.0, avec la simulation de l'admin réel. ≈ 800 k-1,2 M (palier gros, accord).
4. **Passage des projets en 1.7.0** avec `methode-a-jour` : Ben's, KHI Educ, Vie Solution Web, VieSolution (qui
   reprend `lib-controles` généralisé et `comparer-methode`). ≈ 100-200 k chacun.
5. **Mise à jour sans session dédiée** : une tâche planifiée qui compare chaque projet au modèle chaque semaine et
   propose une PR quand la version a bougé. ≈ 150 k.

## 1.6.0 — 2026-10-31 — Kit CRM TS, poste d'appel

Brique « Poste d'appel » en TypeScript strict, sans écrans ni routes, portée d'un projet client en production et
rendue générique ; chaque fichier garde sa ligne d'origine.
- **`kits/crm/ts/src/lib/appels/`** : `regles.ts` (configuration `ConfigAppels` — étapes, étapes qui ne reculent
  jamais, plan des 5 résultats, fuseau, jours ouvrables et fériés, heure du suivi — avec un exemple `[à adapter]`
  et sa vérification ; plan d'un résultat = aperçu = écriture ; file du jour, bilan, prochain jour ouvrable ;
  emplacements de scripts **vides** par étape d'appel, « Script à recevoir », non affichés tant qu'ils ne sont pas
  relus) ; `server.ts` (file, bilan, aperçu sans écriture, confirmation par RPC ; contrôle d'accès injecté) ;
  `courriel.ts` (brouillon après l'appel : règles de rédaction génériques, coordonnées masquées, refus sans
  conversation, sans accord de vive voix, désabonné ou adresse effacée ; modèle injecté ; rien n'est envoyé) ;
  migration `0112_call_result.sql` (`record_call_result`, une transaction, `security definer`, `service_role`
  seulement, listes `[à adapter]`, vérifications et retour arrière), fournie, jamais appliquée.
- **Documents** : `ts/BRIQUE.md` (section « Poste d'appel » : fichiers, ordre après 0110, règles pour les routes
  (f)-(h), conformité : scripts relus par un humain avant usage, aucune promesse, consentement de vive voix noté) ;
  `CATALOGUE.md` (ligne « Poste d'appel », famille 3) ; README du kit (contenu de `ts/`, migration 0112 dans l'ordre
  d'installation).
- Aucun texte de script dans le kit : les scripts sont ceux du client, recopiés puis relus.
- Après la revue `qa-agent` (une révision) : passage automatique « nouveau → contacté » quand la personne est
  jointe rendu explicite (`ConfigAppels.avanceeQuandJoint`, utilisé par l'aperçu comme par le SQL) ; lead archivé
  refusé (404, comme introuvable) par le serveur et par `record_call_result` ; auteur normalisé une seule fois
  (même valeur écrite et lue par le bilan) ; skill `nouveau-crm` (poste d'appel, migration 0112).
- **Vérifié** : `npm run verify` (tsc strict + Vitest) dans une copie `mktemp -d`, 41 fichiers, 793 tests au vert
  (719 + 74) ; règles cassées une fois dans la copie et vues en échec : garde « ne recule jamais » (TS et SQL),
  refus sans conversation, refus sans accord, périmètre du serveur, script non relu, avancée « joint », lead
  archivé (serveur et SQL), auteur normalisé ; `qa-agent` (vert, puis une révision).
- **Pas encore vérifié** : `0112` jamais jouée sur une base (la parité avec la configuration est seulement lue dans
  le texte du SQL) ; aucune route ni écran écrits avec la brique ; client IA réel jamais branché sur
  `redigerCourrielAppel` ; pas de `securite` sur ce lot.

## 1.5.0 — 2026-10-30 — Kit CRM TS, lot 2

Socle de l'admin d'équipe en TypeScript strict, sans écrans ; plan : `projets/kit-ts/IMPLEMENTATION-PLAN-LOT2.md`.
Chaque fichier garde sa ligne d'origine.
- **`kits/crm/ts/`** : faux Supabase pour Vitest (L0) ; rôles `admin` > `gestionnaire` > `employe` paramétrables
  et matrice d'accès à refus par défaut (L1) ; mot de passe partagé interdit en ligne (L2) ; point d'entrée de
  l'équipe (L3) ; double vérification TOTP de Supabase (L4) ; appareils de confiance 30 jours (L5) ; codes de
  secours (L6, 10 codes à usage unique, session d'une heure qui oblige à réinscrire un facteur) ; verrou de compte
  (L7) ; journal des actions (L8) ; journal d'accès Loi 25 (L9) ; accès, effacement avec empreinte et conservation
  limitée (L10) ; archivage (L11) ; santé + battement du tick (L12) ; migrations `0103` à `0111` ; variables du
  lot 2 dans `.env.exemple`.
- **Documents** : `ts/BRIQUE.md` (lots 1 et 2, ordre des migrations, préalable « inscriptions fermées », règles
  pour les routes que le projet écrira, pièges, écarts connus, fiche « admin d'un seul propriétaire ») ;
  `CATALOGUE.md` (colonne TS, nouvelles lignes) ; README du kit (ordre d'installation TS) ; skill `nouveau-crm`
  (socle admin TS, question des rôles au démarrage, `securite` avant la mise en ligne d'un admin, règle E15).
- Noms des projets sources retirés des documents du kit et de la skill : la provenance reste sur la ligne
  d'origine de chaque fichier.
- **Vérifié** : `npm run verify` (tsc strict + Vitest) dans une copie `mktemp -d`, 719 tests au vert ; règles
  cassées une fois (mutations vues en échec) ; `qa-agent` ; `securite` sur le lot 2a, puis corrections.
- **Pas encore vérifié** : aucun SQL `0103`-`0111` joué sur une base neuve ; aucune brique installée dans un projet
  réel ; codes de secours = conception neuve (pas de source en production) ; le verrou de compte est à brancher
  par le projet (routes non fournies).

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
