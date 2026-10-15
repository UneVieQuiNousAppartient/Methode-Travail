---
name: incident
description: Traiter un incident ou un bug — reproduire, diagnostiquer, corriger, test de non-régression, issue GitHub
when_to_use: Quelque chose est cassé (en production, en staging, ou signalé par Camille ou un client), ou un bug est trouvé en cours de route
user-invocable: true
argument-hint: "<description courte ou numéro d'issue>"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
model: opus
effort: medium
---

# Incident

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier** — pour un
antécédent : `grep -n "<mot-clé>" SUIVI-TACHES.md docs/suivi/*.md`.

## 1. Issue GitHub — tout de suite

Règle existante (`agent-workflow.md`, « Tout bug trouvé devient une Issue ») :
dès que le bug est **confirmé**, une issue avec titre précis, label `bug`,
portée vérifiée par `grep` sur tout le dépôt (un bug vu dans 1 fichier en
touchait 6 le 25 août). Chercher d'abord un doublon. Lien de l'issue donné à
Camille.

## 2. Reproduire

- Étapes exactes, environnement (production, staging, local), langue, mobile.
- Production : connecteur Vercel `get_runtime_errors` puis `get_runtime_logs` ;
  Supabase : journaux et `get_advisors` (lecture seule).
- Écrire **d'abord** un test qui échoue (vitest ou Playwright) — c'est la
  preuve de reproduction et le futur test de non-régression.

## 3. Diagnostiquer

Cause racine, pas le symptôme. « Instable » n'est pas une cause. Noter le
commit fautif si trouvé (`git log -S`, `git bisect`).

## 4. Corriger

- Hors du périmètre approuvé ou non trivial : **demander à Camille avant**
  (même règle) ; sinon correction minimale.
- Production en panne : proposer d'abord le retour arrière (déploiement
  précédent), corriger ensuite.
- Données touchées : aucune requête d'écriture en production sans Camille ;
  migration = appliquée par Camille seulement.

## 5. Non-régression

Le test de l'étape 2 passe ; rien n'est affaibli ni ignoré. `typecheck`,
`lint`, tests ciblés. 2 fichiers ou plus touchés → `qa-agent`
(`model: "opus"`) avant le commit, puis relecture de son diff de tests.

## 6. Clore

Commit qui référence l'issue (`fix(...): ... (#123)`), PR brouillon, entrée
au suivi si non trivial, `docs/ETAT-ACTUEL.md` si l'incident y figurait. Si
un agent risque de reproduire l'erreur, ajouter un rappel dans son fichier.

## Agents et modèles
Recherche de journaux ou de motifs sur beaucoup de fichiers :
`model: "haiku"`. Correction : l'agent du domaine (`data-agent`, `ux-agent`,
`ai-agent`…) en `model: "opus"`. Petit incident : l'agent principal seul.

## Rapport
Cause, correctif, preuve de non-régression, lien de l'issue, ce qui reste,
et **coût réel**.
