# Budget de jetons — chaque chantier a un coût annoncé, puis un coût réel

Demande de Camille (14-15 oct. 2026), « on gaspille les tokens ». Constats et raisons :
`docs/methode/budget-jetons-details.md` (lu à la demande).

## Paliers

| Palier | Estimation | Qui fait quoi |
|---|---|---|
| **Petit** | ≤ 200 k | L'agent principal fait lui-même. Pas de sous-agent sauf `qa-agent` quand la règle `agent-workflow.md` l'exige. |
| **Moyen** | ≤ 1 M | Un agent à la fois, **au plus 2 en parallèle**. |
| **Gros** | > 1 M, **ou tout `Workflow`** | **Accord de Camille sur l'estimation** avant de lancer quoi que ce soit. |

- Chaque plan porte une ligne **« Coût estimé »** (et le palier) et **« Lignes estimées : ≈ +N / −M »**
  (lignes de code) ; la livraison donne le **coût réel** (usages rapportés par les agents + estimation de la
  session principale) et les lignes réelles (`node scripts/check-taille-diff.mjs origin/main`), avec ⚠ au-delà
  de 50 % d'écart (`agent-workflow.md`, « Moins de code »). Un dépassement se dit dès qu'il arrive, pas à la
  livraison (ligne du parcours, skill `tache`).
- L'accord de Camille prime sur tout mode de session (« ultracode » compris) :
  un mode qui autorise les `Workflow` ne vaut pas accord pour un gros chantier.

## Grille de modèles (celle de Camille, révisée le 15 oct. puis le 14 nov. 2026)

| Modèle | Pour |
|---|---|
| **Opus** — défaut | conception et développement : les 5 agents de conception, `prompt-agent`, `orchestrateur`, `data-agent`, `ai-agent`, `ux-agent`, `qa-agent`, `securite`, `revue-integration`, et les agents métier qui demandent du jugement (conformité, diagnostic, planification) |
| **Sonnet** | rédaction et traduction de contenu (articles, posts), **précisé à l'appel** ; au choix du projet, **exécution d'interface d'un plan ou d'une maquette déjà approuvés** (`ux-agent` en `sonnet` dans son fichier, avec la raison — VieSolution depuis le 14 nov. 2026 ; une tâche qui touche l'authentification, l'argent ou des données de clients repasse `model: opus` à l'appel) |
| **Haiku** | automatisations quotidiennes (cron), tri, classement, contrôles mécaniques : les agents d'automatisation du projet (relances, courriels planifiés, synchronisation CRM, traduction mécanique…) |
| **Fable** | rare, **sur accord de Camille** seulement |

Opus coûte plus cher par jeton que Sonnet : les **estimations** et **l'accord
de Camille au-delà de 1 M** restent la protection principale du budget.

- **Tout appel `Agent` nomme son `model`** — jamais d'héritage du modèle de la
  session. Filet de sécurité : `.claude/settings.json` fixe
  `CLAUDE_CODE_SUBAGENT_MODEL=opus` (priorité : appel > fichier de l'agent >
  cette variable > session) — un agent lancé sans modèle ne tombe jamais sur
  Fable.
- Aucun agent du dépôt ne passe en Fable, ni un agent Haiku en Opus, ni un agent
  Opus en Sonnet, sans raison écrite dans son fichier.

## Lectures

- Ordre de lecture d'une session : `CLAUDE.md` → `docs/ETAT-ACTUEL.md` →
  `docs/ERREURS-CONNUES.md` (par `grep` s'il est long) → documents du projet
  (`docs/projets/<slug>/`, fiche de chantier).
- **Jamais `SUIVI-TACHES.md` en entier** : `grep` sur le numéro de section ou un
  mot-clé, puis lecture ciblée. L'archive `docs/suivi/` se consulte de même.
- Pas de relecture d'un fichier déjà en contexte.
- **Avant tout plan qui touche une issue** : `grep -n "#<numéro>" SUIVI-TACHES.md docs/ETAT-ACTUEL.md` et
  lecture ciblée de l'entrée trouvée — une décision déjà tranchée ne se repropose pas.

## Vérification

Un passage de vérification, **une révision au plus**. Ce qui reste après va
dans la liste de Camille (« Non fait dans ce round », issue GitHub), pas dans
une boucle agent → correction → agent.

## Limite d'usage

À la **première** erreur de limite d'usage : arrêt net. L'état est écrit sur
disque (`docs/ETAT-ACTUEL.md`, ou la fiche du chantier), poussé dès que
possible, et Camille est prévenue. **Aucune relance automatique.** Tout long
travail écrit sa progression dans des fichiers au fil de l'eau, pour qu'une
coupure ne perde rien.

## Succès

- Aucun plan sans « Coût estimé », aucune livraison sans coût réel.
- Aucun appel `Agent` sans `model`.
- Aucun `Workflow` ni chantier > 1 M sans accord explicite de Camille.
