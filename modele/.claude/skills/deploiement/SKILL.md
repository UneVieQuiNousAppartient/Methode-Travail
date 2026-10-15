---
name: deploiement
description: Préparer et vérifier une mise en ligne — commande de vérification, variables d'environnement, migrations (appliquées en production par la personne qui valide seulement), contrôle après mise en ligne
when_to_use: Une PR est prête à partir en production (ou en staging), après livrer ; ou après une mise en ligne pour vérifier qu'elle tient
user-invocable: true
argument-hint: "[staging|production]"
allowed-tools: Read, Grep, Glob, Bash, Agent
model: opus
effort: medium
---

# Déploiement

Commandes, mode de mise en ligne et contrôles : **Fiche projet** de `CLAUDE.md`
(lignes **Vérification**, **Déploiement**, **Contrôle après déploiement**,
**Valide les livraisons**). Les éléments marqués *Exemple* viennent de
VieSolution (Next.js, Vercel, Supabase).

Prépare et vérifie ; **ne pousse ni ne fusionne rien sans l'accord explicite
de la personne qui valide**, et **n'applique jamais une migration en
production** : c'est elle seule qui le fait.

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier.**
Connecteurs utiles : ceux de l'hébergeur et de la base, en lecture seule
(*exemple* : Vercel et Supabase).

## 1. Avant — la vérification

```bash
git status -sb && git log --oneline -5
<commande Vérification de la Fiche projet>
```
*Exemple (VieSolution)* : `npm run typecheck && npm run lint && npx vitest run`,
puis `npm run build` et `npm audit --omit=dev` (0 vulnérabilité exigée par la CI).

Un rouge arrête tout. `livrer` doit avoir été fait (suivi + `ETAT-ACTUEL.md`).

## 2. Variables d'environnement

- Lister les variables que le diff utilise (*exemple Node* :
  `git diff origin/main... | grep -o "process.env.[A-Z_]*" | sort -u`).
- Les comparer aux variables de l'hébergeur (connecteur, noms seulement —
  **jamais afficher une valeur**) pour l'environnement visé.
- Une variable manquante = liste à donner à la personne qui valide, avec
  l'environnement (production / préproduction).

## 3. Migrations

- Nouvelles migrations du diff : `git diff --name-only origin/main... -- <dossier des migrations>`
  (*exemple* : `supabase/migrations/`).
- Pour chacune : ce qu'elle fait, si elle est réversible, ses règles d'accès (RLS).
- Donner à la personne qui valide la liste ordonnée **à appliquer par elle**
  en production, et l'ordre code / migration (migration d'abord si le code en dépend).
- Vérifier ensuite (lecture seule) avec le connecteur de la base (*exemple
  Supabase* : `list_migrations`, `get_advisors`).
- Lot qui touche l'authentification, les accès ou le schéma : agent
  `securite` (`model: "opus"`) avant la mise en ligne.

## 4. Mise en ligne

Proposer, ne pas exécuter sans accord : selon la ligne **Déploiement** de la
Fiche projet (le plus souvent : fusion de la PR vers la branche de
production). Le hook `.githooks/pre-commit` a déjà rejoué `check-suivi.js` et
`check-rules.mjs` à chaque commit. *Exemple (VieSolution)* :
`push-staging.bat` / `push-prod.bat`, qui passent par `scripts/push-common.bat`.

## 5. Après — vérifications

- Déploiement terminé chez l'hébergeur, journal de build sans erreur.
- **Contrôle après déploiement** de la Fiche projet (commande ou liste d'URL).
- Erreurs d'exécution des 15 minutes qui suivent (*exemple Vercel* :
  `get_runtime_errors` puis `get_runtime_logs`).
- Pages clés en HTTP 200 (accueil, pages du diff) ; un parcours critique
  cliqué (formulaire de contact, inscription, paiement…).
- Courriels, tâches planifiées : rien d'anormal dans les journaux.
- En cas de problème : skill `incident` ; retour arrière proposé à la
  personne qui valide (redéploiement de la version précédente).

## Agents et modèles
Contrôles mécaniques (liste de variables, codes HTTP) : `model: "haiku"`.
`qa-agent` déjà passé dans `livrer` ; ne pas le relancer sans changement.

## Rapport
Ce qui part, ce que la personne qui valide doit faire (variables, migrations, dans l'ordre),
état après mise en ligne avec preuves, et **coût réel**.
