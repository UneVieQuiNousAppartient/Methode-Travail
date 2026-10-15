# Méthode de travail — modèle commun

La méthode de travail de Camille avec Claude Code, extraite de VieSolution-CSF le 15 octobre 2026 après son
premier passage complet (chaîne de documents « plans d'action », A3). À copier dans chaque projet : Ben's,
trading, WFG, projets clients.

Pourquoi un dépôt à copier : une session Claude Code dans le cloud ne voit que le dépôt de son projet. Les
règles, agents et skills doivent donc vivre dans le `.claude/` de chaque dépôt.

## Ce que le modèle apporte

| Élément | Où (dans `modele/`) | À quoi ça sert |
|---|---|---|
| Budget de jetons | `.claude/rules/budget-jetons.md` | Paliers (petit ≤ 200 k, moyen ≤ 1 M, gros = accord), coût estimé puis réel, grille Opus / Sonnet / Haiku, arrêt à la limite d'usage |
| Workflow | `.claude/rules/agent-workflow.md` | Plan avant action, déclencheur objectif, `qa-agent` avant tout commit de 2+ fichiers, bugs → issues |
| Suivi | `.claude/rules/suivi-taches.md` | `ETAT-ACTUEL.md` lu en premier, suivi jamais lu en entier, entrée obligatoire à chaque livraison |
| Réglages | `.claude/settings.json` | Agents en Opus par défaut, hook de démarrage ; liste de plugins à couper selon le projet |
| Démarrage | `scripts/session-start.sh` | En cloud : dépendances, navigateur de test, état du projet affiché |
| Chaîne de documents | skill `nouveau-projet` + 5 agents de conception | BRIEF → PRD + APP-FLOW → SCHEMA → TRD → UI-GUIDE (+ maquettes Claude Design) → IMPLEMENTATION-PLAN → revue `qa-agent` |
| Agents de code | `orchestrateur`, `data-agent`, `ux-agent`, `ai-agent`, `qa-agent`, `prompt-agent` | Socle commun ; une section « Propre au projet » à remplir |
| 12 skills | `.claude/skills/` | `nouveau-projet`, `livrer`, `point-projet`, `qa-feature`, `nouvelle-page`, `audit-seo`, `deploiement`, `incident`, `client-onboarding`, `diagnostic-ai`, `email-automation`, `recommendation-engine` |
| Gabarits | `CLAUDE.md`, `docs/ETAT-ACTUEL.md`, `docs/projets/_modele/BRIEF.md`, `.github/PULL_REQUEST_TEMPLATE.md` | Points de départ à remplir |
| Exemples | `exemples/` (hors `modele/`) | CI qui saute build et tests sur les PR de documentation ; Dependabot groupé |

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
   - `CLAUDE.md` : description, pile, et surtout **« Commandes de vérification »** (lues par `qa-agent`, `livrer`, `qa-feature`) ;
   - `.claude/settings.json` : plugins inutiles au projet coupés (`"<nom>@synced": false`) ;
   - `scripts/session-start.sh` : étape 1 selon la pile (npm, pip…), étape 2 seulement si Playwright ;
   - section « Propre au projet » de `orchestrateur`, `data-agent`, `ux-agent`, `ai-agent` ;
   - liste « Propres au projet » de `agent-workflow.md` ;
   - `scripts/check-suivi.js` : la liste `CHEMINS_CODE` (dossiers de code du projet), utilisée par `livrer` et `point-projet`.
4. Remplir `docs/ETAT-ACTUEL.md` (copié à l'étape 2) et créer `SUIVI-TACHES.md` avec sa première entrée :
   l'installation de la méthode.
5. Passer `qa-agent` (JSON valide, frontmatter des agents et skills lisible, `bash -n` du script), puis
   commit sur une branche et PR brouillon.

Les nouveaux agents et skills ne se chargent qu'**à la session suivante**.

**Ben's (Les Jus Naturels Ben's)** a déjà son système (skill `jusbens-dev`, orchestrateur et 12 agents) : y
ajouter les règles, la chaîne de documents et les skills communes, sans remplacer ses agents métier.

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

## Tenir le modèle à jour

Une amélioration de la méthode faite dans un projet (règle, agent, skill) se reporte ici par une PR, puis se
redescend dans les autres projets à leur prochaine session de travail. Source du classement commun / propre :
`docs/methode/COMMUN.md` dans VieSolution-CSF.

## Limites connues

- La skill `nouveau-projet` est reconstruite d'après la fiche de VieSolution : le texte d'origine de
  `creer-docs-projet` reste à y recoller.
- Huit skills citent VieSolution en exemple (chemins, pages, issues) ; chacune le signale en tête. À remplacer
  par les éléments du projet à l'installation.
- Des agents propres à VieSolution sont cités comme exemples sans être fournis : `conformite-agent` (garde-fou
  AMF des contenus IA), `automation-dev-agent` et `email-automation-agent` (courriels automatisés). Les créer
  dans le projet seulement s'il en a besoin.
- `livrer` et `deploiement` proposent les scripts `push-staging.bat` / `push-prod.bat` de VieSolution s'ils
  existent ; sinon, commit et PR habituels.
- `budget-jetons.md` renvoie à des constats datés de VieSolution : ils expliquent la règle, ils ne s'appliquent
  pas tels quels.
