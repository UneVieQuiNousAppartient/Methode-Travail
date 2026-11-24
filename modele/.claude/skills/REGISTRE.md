# Registre des skills — qui sert à quoi, d'où elle vient, quoi faire si elle manque

Méthode 1.7.0, repris de VieSolution-CSF (`.claude/skills/REGISTRE.md`, créé le 6 nov. 2026 à la demande de Camille :
« que mes agents utilisent toujours les skills qu'on ajoute »). Règle d'emploi : `.claude/rules/agent-workflow.md`,
section « Skills et plugins » ; les six règles : `docs/methode/agent-workflow-details.md` § 5 — **à lire avant
d'ajouter une skill ou un plugin**. Chaque projet complète ce registre (skills propres, plugins utilisés) ;
`scripts/verifier-methode.mjs` signale une skill du dépôt absente d'ici.

## Trois sortes de skills

| Sorte | Où | Disponible | Pour |
|---|---|---|---|
| **1. Projet** | `.claude/skills/<nom>/` | toujours (poste, cloud, tous les agents) | tout ce qui est obligatoire |
| **2. Copiée** | `.claude/skills/<nom>/` + `SOURCE.md` | toujours | une skill externe utile **régulièrement** ; ne se modifie pas sur place (`node scripts/skills-check.mjs`) |
| **3. Plugin** | compte claude.ai (plugin activé) | seulement si le plugin est activé **et** pas désactivé par `.claude/settings.json` (`enabledPlugins`) | usage **ponctuel** |
| *(intégrée)* | Claude Code lui-même | selon la version de Claude Code | `simplify`, `code-review`, `claude-api`… |

**Constat qui fonde le registre** (test réel, VieSolution, 6 nov. 2026) : une skill déclarée dans `skills:` d'un agent
mais absente **manque sans aucun message d'erreur** — l'agent travaille sans. `scripts/check-skills-agents.mjs`
(lancé au démarrage de chaque session) le signale. Un sous-agent n'a accès qu'aux skills préchargées, sauf s'il a
l'outil `Skill`.

## Skills du modèle (sorte 1)

| Skill | Quand | Préchargée par |
|---|---|---|
| `tache` | **toute demande de changement** : le parcours complet, de la demande à la PR | — (agent principal) |
| `nouveau-projet` | nouveau projet ou grosse fonctionnalité, avant le code (chantier > 500 k ou nouvel écran : version courte) | — (agent principal) |
| `nouveau-crm` | CRM, admin, espace client : briques de `kits/crm/` du dépôt `methode-travail` | — (agent principal) |
| `nouvelle-page` | nouvelle route publique | — (nommée dans la délégation à `ux-agent`) |
| `tester-dabord` | règle de calcul critique (argent, quantités, accès, échéances) | — (nommée dans la délégation) |
| `incident` | bug, incident | — (agent principal) |
| `livrer` | fin de chantier | — (agent principal) |
| `deploiement` | mise en ligne | — (agent principal) |
| `qa-feature` | vérifier une phase contre ses critères | — |
| `point-projet` | état réel du projet | — |
| `audit-seo` | audit SEO | — |
| `client-onboarding` | nouveau client | — |
| `diagnostic-ai`, `email-automation`, `recommendation-engine` | concevoir ces fonctions chez un client (bâties sur un cas VieSolution, le disent en tête) | — |
| `methode-a-jour` | mettre la méthode d'un projet à jour depuis `methode-travail` | — (agent principal) |
| `remonter-methode` | remonter une amélioration de méthode d'un projet vers `methode-travail` | — (agent principal) |

## Skills copiées (sorte 2, avec `SOURCE.md`)

| Skill | Origine | Quand | Préchargée par |
|---|---|---|---|
| `frontend-design` | Anthropic, Apache 2.0 | direction visuelle, éviter le rendu générique — dans le cadre du guide d'interface | `ux-agent`, `ux-designer` |
| `web-design-guidelines` | Vercel, MIT | revue d'interface, accessibilité | `ux-agent` (pas `ux-designer` : il n'a ni WebFetch ni Bash) |
| `vercel-react-best-practices` | Vercel, MIT | écrire ou revoir du React / Next.js — **projet React seulement** (sinon supprimer le dossier et la retirer de `ux-agent`) | `ux-agent` |
| `architecture` | Anthropic, Apache 2.0 | décision d'architecture → ADR dans `docs/adr/` | — |
| `tech-debt` | Anthropic, Apache 2.0 | **à chaque tâche qui code**, limitée aux fichiers touchés, avant `qa-agent` (« Moins de code ») ; audit complet sur demande | — (agent principal ; nommée dans la délégation) |

## Skills intégrées employées par la méthode

| Skill | Quand | Si elle manque |
|---|---|---|
| `simplify` | **à chaque tâche qui code**, sur le diff, avant `qa-agent` | relecture du diff à la main (réutilisation, doublons, code non demandé) ; le dire |
| `code-review` | revue d'une PR | commande Vérification + relecture du diff |
| `claude-api` | toute fonction qui appelle Claude | `ai-agent` suit la documentation officielle |

## Propres au projet

<!-- À remplir : skills propres au projet, plugins préchargés par un agent (sorte 3 : agent, quoi faire si elle
manque), plugins d'usage ponctuel et leurs garde-fous, skills retirées et pourquoi. -->
