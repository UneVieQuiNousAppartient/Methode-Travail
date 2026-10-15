---
name: deploiement
description: Préparer et vérifier une mise en ligne — build, variables Vercel, migrations (appliquées en production par Camille seulement), vérifications après mise en ligne
when_to_use: Une PR est prête à partir en production (ou en staging), après livrer ; ou après une mise en ligne pour vérifier qu'elle tient
user-invocable: true
argument-hint: "[staging|production]"
allowed-tools: Read, Grep, Glob, Bash, Agent
model: opus
effort: medium
---

# Déploiement

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Prépare et vérifie ; **ne pousse ni ne fusionne rien sans l'accord explicite
de Camille**, et **n'applique jamais une migration en production** : c'est
Camille seule qui le fait.

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier.**
Connecteurs utiles : Supabase et Vercel (les seuls à activer pour VieSolution).

## 1. Avant — le build

```bash
git status -sb && git log --oneline -5
npm run typecheck && npm run lint && npx vitest run
npm run build
npm audit --omit=dev   # ce que la CI exige : 0 vulnérabilité
```
Un rouge arrête tout. `livrer` doit avoir été fait (suivi + `ETAT-ACTUEL.md`).

## 2. Variables d'environnement Vercel

- Lister les variables que le diff utilise :
  `git diff origin/main... | grep -o "process.env.[A-Z_]*" | sort -u`.
- Les comparer aux variables du projet Vercel (connecteur Vercel, noms
  seulement — **jamais afficher une valeur**) pour l'environnement visé.
- Une variable manquante = liste à donner à Camille, avec l'environnement
  (Production / Preview).

## 3. Migrations

- Nouvelles migrations du diff : `git diff --name-only origin/main... -- supabase/migrations/`.
- Pour chacune : ce qu'elle fait, si elle est réversible, ses politiques RLS.
- Donner à Camille la liste ordonnée **à appliquer par elle** en production,
  et l'ordre code / migration (migration d'abord si le code en dépend).
- Vérifier ensuite (lecture seule) avec le connecteur Supabase :
  `list_migrations`, `get_advisors` (sécurité et performance).

## 4. Mise en ligne

Proposer, ne pas exécuter sans accord : fusion de la PR vers `main` (ou
`push-staging.bat` / `push-prod.bat` s'ils existent dans le projet, qui passent par `scripts/push-common.bat`).

## 5. Après — vérifications

- Déploiement Vercel : état « Ready », journal de build sans erreur.
- `get_runtime_errors` puis `get_runtime_logs` sur les 15 minutes qui suivent.
- Pages clés en HTTP 200 (accueil, `/diagnostic`, `/estimateurs`, pages du
  diff) ; un parcours critique cliqué (formulaire de contact ou diagnostic).
- Courriels, cron : rien d'anormal dans les journaux.
- En cas de problème : skill `incident` ; retour arrière proposé à Camille
  (« promote » du déploiement précédent sur Vercel).

## Agents et modèles
Contrôles mécaniques (liste de variables, codes HTTP) : `model: "haiku"`.
`qa-agent` déjà passé dans `livrer` ; ne pas le relancer sans changement.

## Rapport
Ce qui part, ce que Camille doit faire (variables, migrations, dans l'ordre),
état après mise en ligne avec preuves, et **coût réel**.
