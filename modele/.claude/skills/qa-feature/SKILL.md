---
name: qa-feature
description: Vérifier une fonctionnalité contre les critères d'acceptation de son IMPLEMENTATION-PLAN — cochés un à un, tests ciblés, qa-agent en Opus, aucun test affaibli
when_to_use: Une phase d'IMPLEMENTATION-PLAN.md est codée et doit être vérifiée avant livrer ; ou Camille demande « est-ce que ça marche vraiment ? » sur une fonctionnalité précise
user-invocable: true
argument-hint: "<slug-du-projet> <numéro-de-phase>"
allowed-tools: Read, Grep, Glob, Bash, Agent
model: opus
effort: medium
---

# QA d'une fonctionnalité

Vérifie **ce qui a été promis**, critère par critère — pas « les tests
passent ». Existe parce qu'un `qa-agent` a déjà rapporté « QA validée, 4/4 »
après avoir affaibli un test en silence (25 août, `agent-workflow.md`).

Lire `docs/ETAT-ACTUEL.md`, puis la phase visée de
`docs/projets/<slug>/IMPLEMENTATION-PLAN.md`. **Jamais `SUIVI-TACHES.md` en
entier.**

## 1. Lister les critères

Recopier les critères d'acceptation de la phase dans un tableau :

| # | Critère | Preuve attendue | Statut |
|---|---|---|---|

Un critère vague (« rapide », « clair ») est signalé comme tel, pas coché.

## 2. Contrôles de base

Commandes de la **Fiche projet** (`CLAUDE.md`) :
- **Tests ciblés** sur les fichiers de test de la phase (unitaires, puis e2e) ;
- les étapes rapides de **Vérification** (typecheck, lint) si la fiche les détaille.

*Exemple (VieSolution)* : `npx vitest run <fichier>.test.ts`,
`npx playwright test e2e/<fichier>.spec.ts`.

Lancer **seulement** les tests liés à la phase ; la commande Vérification
complète est le travail de la CI et de `livrer`.

Si la phase touche une règle de calcul critique (argent, quantités, droits
d'accès, dates de facturation) : vérifier qu'elle suit la skill
**`tester-dabord`** — fonction pure, test à côté qui couvre bornes et cas
« méchant », preuve que le test échoue quand on casse la règle, test de
parité si la règle existe côté client et côté serveur. Un manque = critère ❌.

## 3. Cocher un à un

Pour chaque critère, une preuve observée : sortie de test, code HTTP, capture,
requête. Statuts : ✅ prouvé · ❌ échoue · ⚠️ non vérifiable ici (dire
pourquoi : clé absente, service externe…). Jamais ✅ sans preuve.

## 4. `qa-agent` — regard indépendant

Appel `Agent(subagent_type: "qa-agent", model: "opus")` avec : le tableau
des critères, `git diff` de la phase, et la consigne « Plan approuvé : tu
exécutes, tu ne dispatches personne. Ne modifie aucun test pour le faire
passer ; si un test échoue, rapporte la cause. Rapporte ton usage de jetons. »

## 5. Relire les tests touchés — obligatoire

```bash
git diff --stat -- '*test*' '*spec*' e2e/ tests/
git diff -- '*test*' '*spec*' e2e/ tests/
```
Refuser tout affaiblissement : `skip`, `only`, `todo`, `expect(true)`,
assertion supprimée ou remplacée par une simple existence d'élément,
`try/catch` qui avale l'erreur, `test.fail` sans numéro d'issue.

## 6. Une révision au plus

Les ❌ sont corrigés **une fois** (par l'agent qui a codé la phase, modèle
nommé), puis re-vérifiés. Ce qui reste ❌ ou ⚠️ va dans « Non fait dans ce
round » et, si c'est un bug, en issue GitHub. Pas de boucle.

## Rapport

Tableau final des critères, tests lancés et résultats, réserves de
`qa-agent`, et **coût réel** (usages des agents + estimation de la session).
