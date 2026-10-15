---
name: nouveau-projet
description: Chaîne de documents d'un projet — BRIEF → PRD + APP-FLOW → SCHEMA → TRD → UI-GUIDE → IMPLEMENTATION-PLAN, avec validation de Camille entre chaque étape, puis qa-agent et ETAT-ACTUEL.md. Avant tout code.
when_to_use: Nouveau projet (client ou VieSolution) ou grosse fonctionnalité, avant d'écrire du code. Petit chantier — seulement BRIEF.md + IMPLEMENTATION-PLAN.md
user-invocable: true
argument-hint: "<slug-du-projet> [petit]"
allowed-tools: Read, Write, Grep, Glob, Bash, Agent
model: opus
effort: medium
---

# Nouveau projet — la chaîne de documents

> **Note de reprise (15 oct. 2026).** Cette skill est la `creer-docs-projet` de
> Camille, renommée. Son texte d'origine n'était disponible ni dans la fiche
> du chantier ni dans le dépôt lors de l'écriture : les étapes ci-dessous sont
> **reconstruites d'après la fiche** `docs/chantiers/2026-10-15-systeme-travail.md` de VieSolution-CSF
> (A2, A2 bis n°1). **Camille : remplace la section « Les 12 étapes » par ton
> texte tel quel** ; les trois précisions (a), (b), (c) restent valables.

## Les trois précisions (fiche du 15 oct.)

- **(a) Arrêt à chaque étape.** Après chaque document, l'agent principal
  présente à Camille un **résumé de 10 lignes** et le **coût réel** de
  l'étape, puis **s'arrête**. Le message suivant de Camille est la validation
  (ou les corrections). Aucune étape suivante sans ce message.
- **(b) Consigne à chaque agent.** Chaque prompt de délégation contient :
  « Plan approuvé par Camille : tu exécutes, tu ne demandes pas d'accord, tu
  ne dispatches personne. » et **nomme le `model`** de l'appel.
- **(c) Étape 11 : `qa-agent`** vérifie la cohérence, les trous et les
  critères d'acceptation **entre les 6 documents**.

## Les 12 étapes

Dossier : `docs/projets/<slug>/` (slug court, minuscules, tirets).
Lire d'abord `docs/ETAT-ACTUEL.md` ; **jamais `SUIVI-TACHES.md` en entier**.

| # | Étape | Qui | Modèle | Coût indicatif |
|---|---|---|---|---|
| 1 | Créer `docs/projets/<slug>/`, copier `docs/projets/_modele/BRIEF.md` | agent principal | — | < 10 k |
| 2 | Rédiger `BRIEF.md` (1 page) à partir des sources données par Camille | agent principal | session | 30-80 k |
| 3 | `PRD.md` (fonctionnalités + critères d'acceptation) | `product-manager` | opus | 80-200 k |
| 4 | `APP-FLOW.md` (écrans, parcours, états) — même appel que 3 | `product-manager` | opus | (inclus) |
| 5 | `SCHEMA.md` (tables, RLS, Loi 25, migrations prévues) | `data-architect` | opus | 60-150 k |
| 6 | `TRD.md` (5 couches : interface, orchestration, modèle, outils, mémoire) | `solution-architect` | opus | 100-250 k |
| 7 | `UI-GUIDE.md` + `MAQUETTES.md` (jetons, shadcn/ui, ton, a11y) | `ux-designer` | opus | 80-200 k |
| 8 | Design System et maquettes publiés sur Claude Design, commentés par Camille | agent principal | session | 50-250 k |
| 9 | `IMPLEMENTATION-PLAN.md` (phases, fichiers, tests, coût et modèle par phase) | `tech-lead` | opus | 100-250 k |
| 10 | `README.md` du projet : sommaire des documents, décisions prises, questions ouvertes | agent principal | session | < 20 k |
| 11 | Revue croisée des 6 documents (précision c) | `qa-agent` | opus | 60-150 k |
| 12 | `docs/ETAT-ACTUEL.md` mis à jour (projet, étape, prochaine action) | agent principal | session | < 10 k |

Chaque étape 2 à 11 se termine par la précision (a) : résumé, coût, arrêt.

**Petit chantier** (argument `petit`) : étapes 1, 2, 9 (le `tech-lead` part
du seul brief et écrit lui-même les critères d'acceptation), 11 (sur 2
documents), 12. Ne pas payer 6 documents pour un petit chantier.

## Prompt type d'une délégation

```
Plan approuvé par Camille : tu exécutes, tu ne demandes pas d'accord, tu ne
dispatches personne. Projet : docs/projets/<slug>/. Documents validés : <liste>.
Écris <DOCUMENT>.md selon ton fichier d'agent. Ne lis jamais SUIVI-TACHES.md
en entier. Rapport final : 10 lignes + ton usage de jetons.
```
Appel : `Agent(subagent_type: "<agent>", model: "<modèle du tableau>")`.

## Étape 11 — consigne à `qa-agent`

Lire les 6 documents et rapporter, sans rien modifier :
- chaque fonctionnalité « Doit » du PRD a ses critères d'acceptation, un
  écran dans APP-FLOW, ses données dans SCHEMA, sa phase dans
  IMPLEMENTATION-PLAN ;
- aucune table, route ou composant cité dans un document et absent des autres
  sans raison ;
- contradictions (chiffres, noms, périmètre), trous (RLS manquante, état
  d'erreur absent, coût IA non chiffré), questions ouvertes non tranchées ;
- conformité : AMF et Loi 25 traitées dans PRD, SCHEMA et TRD.

Les écarts vont dans `README.md` du projet (« À trancher ») pour Camille —
**une révision au plus**, pas de boucle.

## Ensuite

Le code commence seulement après la validation de l'étape 12 :
`orchestrateur` répartit les phases d'`IMPLEMENTATION-PLAN.md` entre
`data-agent`, `ux-agent`, `ai-agent`, `i18n-agent` ; chaque phase finit par la
skill `qa-feature`, puis `livrer`.

## Fin

Terminer par le **coût réel cumulé** de la chaîne (somme des usages des
agents + estimation de la session), comparé aux coûts indicatifs.
