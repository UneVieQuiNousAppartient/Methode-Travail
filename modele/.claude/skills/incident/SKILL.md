---
name: incident
description: Traiter un incident ou un bug — reproduire (message exact), isoler, expliquer la cause en une phrase avant de toucher au code, corriger au plus juste, prouver (échec avant, succès après), issue GitHub et registre des erreurs connues
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

**D'abord le registre** : `grep -n "<morceau du message exact>" docs/ERREURS-CONNUES.md`.
Si l'erreur y est, appliquer la solution notée (et corriger la ligne si elle
ne marche plus) avant tout nouveau diagnostic.

**La règle d'or** : on ne corrige pas un bug qu'on n'a pas compris. Pas de
changement « au hasard pour voir » : chaque correctif s'appuie sur une cause
observée.

## 1. Issue GitHub — tout de suite

Règle existante (`agent-workflow.md`, « Tout bug trouvé devient une Issue ») :
dès que le bug est **confirmé**, une issue avec titre précis, label `bug`,
portée vérifiée par `grep` sur tout le dépôt (un bug vu dans 1 fichier en
touchait 6 le 25 août). Chercher d'abord un doublon. Lien de l'issue donné à
Camille.

## 2. Reproduire — et lire le message EXACT

- Étapes exactes, environnement (production, staging, local), langue, mobile.
- Recopier le message d'erreur **exact** (pas une paraphrase) : c'est lui qu'on
  cherche dans le registre, dans le code et dans les journaux.
- Production : journaux de l'hébergeur et de la base (connecteurs en lecture
  seule ; *exemple Vercel + Supabase* : `get_runtime_errors` puis
  `get_runtime_logs`, `get_advisors`).
- Écrire **d'abord** un test qui échoue (outil de test de la Fiche projet,
  ligne **Tests ciblés**) — c'est la preuve de reproduction et le futur test
  de non-régression.

## 3. Isoler, puis expliquer la cause en une phrase

- **Isoler** : quel fichier, quelle ligne, quelle entrée déclenche le bug ?
  Réduire au plus petit cas qui échoue. Noter le commit fautif si trouvé
  (`git log -S`, `git bisect`).
- **Expliquer la cause en une phrase, avant de toucher au code** — et l'écrire
  dans l'issue. Cause racine, pas le symptôme : « instable » n'est pas une
  cause. Si la phrase ne vient pas, le diagnostic n'est pas fini.
  *Exemples (Ben's)* : « un espace collé à la fin du secret de paiement fait
  refuser l'identifiant de l'établissement » ; « la politique RLS bloquait
  `INSERT … RETURNING`, donc les avis étaient perdus » ; « les tests de nuit
  attendaient un réseau inactif que le captcha n'atteint jamais ».

## 4. Corriger

- **Corriger au plus juste** : la cause, rien de plus. Ne pas élargir le
  correctif ni « nettoyer » autre chose en passant (ce qui mérite d'être
  nettoyé devient une issue).
- Hors du périmètre approuvé ou non trivial : **demander à Camille avant**
  (même règle) ; sinon correction minimale.
- Production en panne : proposer d'abord le retour arrière (déploiement
  précédent), corriger ensuite.
- Données touchées : aucune requête d'écriture en production sans Camille ;
  migration = appliquée par Camille seulement.

## 5. Prouver — échec avant, succès après

Le test de l'étape 2 **échouait avant** le correctif et **passe après** : les
deux sorties figurent dans le compte rendu. Pour une règle de calcul, ce test
suit la skill `tester-dabord`. Rien n'est affaibli ni ignoré. Commande
**Vérification** de la Fiche projet (`CLAUDE.md`). 2 fichiers ou plus touchés → `qa-agent`
(`model: "opus"`) avant le commit, puis relecture de son diff de tests.

## 6. Clore

Commit qui référence l'issue (`fix(...): ... (#123)`), PR brouillon, entrée
au suivi si non trivial, `docs/ETAT-ACTUEL.md` si l'incident y figurait.
**La cause va dans `docs/ERREURS-CONNUES.md`** (message exact, cause en une
phrase, solution ; règle `suivi-taches.md`) dès que le diagnostic a coûté ou
que l'erreur avait déjà été vue.
Si l'erreur peut se reproduire et qu'un motif la détecte (contenu inventé,
secret, domaine en dur…), en faire **une règle de `scripts/check-rules.mjs`**
(`.claude/rules/regles-metier.md`) ; sinon, un rappel dans le fichier de
l'agent qui risque de la refaire.

## Agents et modèles
Recherche de journaux ou de motifs sur beaucoup de fichiers :
`model: "haiku"`. Correction : l'agent du domaine (`data-agent`, `ux-agent`,
`ai-agent`…) en `model: "opus"`. Petit incident : l'agent principal seul.

## Rapport
Cause (la phrase de l'étape 3), correctif, preuve (échec avant, succès après),
lien de l'issue, numéro ajouté à `ERREURS-CONNUES.md`, ce qui reste, et **coût réel**.
