# Workflow de développement — détails

Complément de `.claude/rules/agent-workflow.md` (méthode 1.7.0). **La règle fait foi** ; ce document garde les
raisons, les constats et les tableaux de référence. Il n'est pas chargé automatiquement : on le lit quand on a
besoin d'un paragraphe (`grep -n "^## §" docs/methode/agent-workflow-details.md`). Principe repris de VieSolution-CSF
(15 nov. 2026) : les instructions chargées à chaque session restent courtes, le détail se lit à la demande.

## § 1. Pourquoi un déclencheur objectif

Le seuil « 2 fichiers ou plus, ou 1 fichier sensible » n'est pas un jugement de l'agent principal : un agent pressé
juge toujours que « ce n'est pas la peine ». Depuis la 1.7.0, il est en plus **vérifié par le hook Git** (§ 4) : la
liste des fichiers sensibles vient de la ligne « Chemins sensibles » de la Fiche projet, à laquelle s'ajoutent
toujours les contrôles eux-mêmes (`.githooks/`, `scripts/check-*`, `scripts/hook-*`, `scripts/lib-controles.mjs`,
`scripts/tests/`), `.claude/settings.json`, `.github/workflows/` et les fichiers de dépendances (`package.json`,
`pyproject.toml`, `requirements.txt`, `composer.json`, `Gemfile`, `go.mod`, `Cargo.toml`) — sinon on pourrait
affaiblir un contrôle en un commit d'un fichier (revue `qa-agent` de VieSolution, 14 nov. 2026). Les fichiers `.md`
ne comptent pas, **sauf `CLAUDE.md` quand sa Fiche change** une clé lue par les contrôles : la Fiche est lue au
dernier commit, à l'index et sur le disque, et la plus protectrice l'emporte (revue de la 1.7.0, 24 nov. 2026). Un
chemin s'écrit entre accents graves ; un nom de fichier seul (`middleware.ts`) vaut à toute profondeur.

## § 2. Réutiliser avant de construire

Constat de VieSolution (29 oct. 2026) : des fonctions déjà construites et testées dans un autre projet de Camille
(KHI Educ) ont été reconçues de zéro, plus faibles. D'où l'ordre : autre projet ou kit de `methode-travail` →
outil reconnu → neuf, avec la raison. Le dépôt `methode-travail` garde les briques communes dans `kits/` (catalogue :
`kits/crm/CATALOGUE.md`) ; la skill `nouveau-crm` les installe.

## § 3. Moins de code

Demande de Camille (14 nov. 2026) : « comment faire pour que Claude ne génère pas beaucoup de lignes de code ? »,
puis « à chaque fois que l'on code, ces deux skills sont utilisées ». Constat de VieSolution du 13 nov. : un chantier
à ≈ +1 670 / −380 lignes, un fichier de 422 lignes passé à 458, une ancienne variante laissée inutilisée.

S'applique à toute tâche qui code et atteint le déclencheur ; une tâche triviale en est dispensée, comme de `qa-agent`.
1. **Budget de lignes dans chaque plan** : « Lignes estimées : ≈ +N / −M » (lignes de code des « Dossiers de code »,
   hors tests et données). À la livraison : `node scripts/check-taille-diff.mjs origin/main` ; écart de plus de 50 %
   signalé ⚠, comme le coût.
2. **`simplify` puis `tech-debt`, avant `qa-agent`** — elles font partie de « Faire », pas de la vérification (la règle
   « une révision au plus » ne compte que la révision demandée par `qa-agent`).
   - `simplify` (skill intégrée de Claude Code) sur le diff de la tâche : réutilisation, doublons, code inutile ;
   - `tech-debt` (`.claude/skills/tech-debt/`) limitée aux **fichiers touchés** : code mort, variantes inutiles,
     fichiers trop longs ; ce qui dépasse la tâche va dans « Non fait » ou une issue. Par tâche, elle n'écrit aucun
     rapport de chantier (réservé à un audit complet demandé).
   La réponse le dit (« Skills : … simplify, tech-debt ») ; le prompt de `qa-agent` dit ce qu'elles ont trouvé.
3. **Supprimer l'ancien fait partie de « terminé »**.
4. **Garde-fou** : `scripts/check-taille-diff.mjs` (pre-commit, avertissement) signale un fichier déjà trop long
   (`scripts/architecture-existant.json`, « fichiers_longs ») qui grossit, et un commit de plus de 600 lignes de code
   ajoutées pour moins de 100 retirées.

## § 4. Garde-fous mécaniques

Un rappel dans un agent s'oublie ; un script ne s'oublie pas. Les chemins propres au projet sont lus dans la Fiche
projet de `CLAUDE.md` (« Dossiers de code », « Routes publiques », « Chemins sensibles »), jamais écrits dans les scripts.

| Garde-fou | Où | Ce qu'il fait |
|---|---|---|
| Fichiers protégés | `scripts/hook-protect-files.mjs` (PreToolUse) | refuse l'écriture de `.env*`, des verrous, des artefacts |
| Correcteur de lint | `scripts/hook-lint-fix.mjs` (PostToolUse) | `eslint --fix` sur le fichier écrit ; jamais bloquant |
| Règles métier | `scripts/check-rules.mjs` (pre-commit + Vérification) | bloque un commit qui réintroduit un incident connu (`regles-metier.md`), dont les règles d'architecture (§ 6) |
| Fichiers secrets suivis | `scripts/check-secrets-suivis.mjs` (pre-commit + Vérification) | bloque si `.env`, `.npmrc` avec jeton, clé privée… est suivi par Git |
| Suivi | `scripts/check-suivi.js --hook` (pre-commit) | avertit si du code part sans entrée au suivi ; jamais bloquant |
| **Verrou `qa-agent`** | `scripts/hook-qa-trace.mjs` (SubagentStart + SubagentStop) + `scripts/check-qa-trace.mjs` (pre-commit) | au départ de `qa-agent`, instantané des fichiers ; à sa fin, avec « VERDICT QA : OK » et rien de modifié pendant la revue, empreintes notées dans `.git/qa-verifie.json` ; **refuse** un commit (2 fichiers hors `.md`, ou 1 sensible) dont un fichier n'a pas cette empreinte ; hors session Claude, avertit seulement |
| **Garde Git** | `scripts/hook-garde-git.mjs` (PreToolUse Bash) | refuse `--no-verify`, `git commit -n`, un `core.hooksPath` détourné et toute écriture de la trace par une commande |
| **Livraison d'une PR** | `scripts/check-livraison-pr.mjs` (CI, PR) | **refuse** une PR qui touche le code sans entrée au suivi (en-tête changé) ni `docs/ETAT-ACTUEL.md` ; avertit pour une page `maquette-*` restante (aussi au commit) et pour un nouvel écran ou > 800 lignes sans `IMPLEMENTATION-PLAN.md` |
| **Taille du code** | `scripts/check-taille-diff.mjs` (pre-commit) | § 3 ; jamais bloquant |
| **Rappel du parcours** | `scripts/hook-rappel-tache.mjs` (UserPromptSubmit) | rappelle à chaque message la skill `tache` (≈ 130 jetons) ; jamais bloquant |
| **Skills et tâches semblables** | `scripts/hook-rappel-skills.mjs` (PostToolUse) | à la première modification d'un dossier de code : rappel si aucune skill chargée, et au plus 3 entrées du suivi sur ce fichier ; jamais bloquant |
| **Skills des agents** | `scripts/check-skills-agents.mjs` (démarrage de session) | signale chaque skill du champ `skills:` d'un agent introuvable ; jamais bloquant |
| **Tests des contrôles** | `scripts/tests/controles.test.mjs` (`node --test`, CI) | un cas bloqué et un cas qui passe par contrôle |
| Méthode | `scripts/verifier-methode.mjs` | installation complète et à jour (§ 8 du script : contrôles 1.7.0) |
| **Comparaison au modèle** | `scripts/comparer-methode.mjs <methode-travail>` | dit quels fichiers du projet sont identiques, absents ou différents du modèle (skills `methode-a-jour`, `remonter-methode`) |

Constat qui a motivé le verrou (VieSolution, 14 nov. 2026) : la règle « `qa-agent` avant tout commit de 2 fichiers »
était écrite depuis août, et pourtant sautée ; et le hook Git ne tournait pas du tout dans les sessions cloud
(`core.hooksPath` jamais réglé) — d'où l'étape 0 de `scripts/session-start.sh`.

## § 5. Skills et plugins

Faits vérifiés par VieSolution le 6 nov. 2026 sur de vrais lancements d'agents :
- un sous-agent ne voit **que** les skills préchargées par son champ `skills:`, plus celles qu'il charge lui-même
  s'il a l'outil `Skill` ;
- une skill déclarée mais absente **manque sans aucune erreur** (d'où `check-skills-agents.mjs`) ;
- l'agent principal voit le nom et la description de toutes les skills : **la description est le levier** (ce
  qu'elle fait + quand, avec les mots de la personne qui demande).

Règles :
1. **Préchargement (`skills:`)** : seulement les 1 à 3 skills dont l'agent a besoin **à chaque** lancement (coût à
   chaque appel), de préférence une skill du dépôt.
2. **Au besoin** : les agents de développement ont l'outil `Skill` ; le prompt de délégation **nomme** la skill.
3. **Aucune étape obligatoire ne dépend d'une skill de plugin.** Une skill de plugin devenue nécessaire à chaque fois
   est **copiée** dans `.claude/skills/` avec son `SOURCE.md` (dépôt, commit, licence, date).
4. **Ajouter une skill ou un plugin** = 4 gestes dans le même commit : choisir sa sorte ; l'inscrire au
   `REGISTRE.md` ; l'ajouter au `skills:` de l'agent qui en a besoin à chaque fois, ou à rien ; vérifier qu'elle se
   charge (`node scripts/check-skills-agents.mjs`).
5. **Aucune skill adaptée** : chercher dans le catalogue et proposer ; l'installation est le clic de la personne
   qui valide. Sans skill, on suit les règles du projet et on le dit.
6. **Ordre de priorité** : règles du projet (`.claude/rules/`, `CLAUDE.md`) > skill `tache` > skills externes. Une
   adaptation d'une skill copiée va dans son `SOURCE.md` (« Note <projet> »), pas dans la skill.

## § 6. Règles d'architecture de `check-rules`

Reprises de VieSolution (6 nov. 2026, après un audit : 152 fichiers lisaient la base hors du domaine, 79 fichiers de
plus de 400 lignes, 206 couleurs en dur). Elles ne gênent pas l'existant : les infractions déjà là sont **listées et
tolérées**, la liste ne fait que rétrécir ; seules les **nouvelles** sont refusées.

| Règle | Liste | Active quand |
|---|---|---|
| `fichier-trop-long` | `architecture-existant.json` : `fichiers_longs`, `lignes_max` (400) | le fichier JSON existe |
| `acces-base-hors-domaine` | `architecture-existant.json` : `dossiers_domaine`, `acces_base` | `dossiers_domaine` n'est pas vide |
| `couleur-hors-palette` | `couleurs-autorisees.json` : `couleurs` | la palette n'est pas vide |
| `date-sans-fuseau` | — | toujours (un serveur tourne en UTC) |

Remplir les listes à l'installation : lancer `node scripts/check-rules.mjs`, recopier les fichiers signalés dans les
listes de tolérance (avec l'accord de la personne qui valide), puis ne plus jamais en ajouter.

## § 7. Succès

- Aucun plan sans reformulation, « Coût estimé » et « Lignes estimées » (sauf tâche triviale).
- Aucun agent lancé sans plan approuvé (sauf tâche triviale).
- `simplify` puis `tech-debt` avant `qa-agent` sur toute tâche qui code.
- Aucun rapport d'agent accepté sans relecture du diff réel, tests compris.
- Aucun commit de 2 fichiers ou plus (ou 1 sensible) sans vrai `qa-agent` — vérifié par le hook, pas par un jugement.
