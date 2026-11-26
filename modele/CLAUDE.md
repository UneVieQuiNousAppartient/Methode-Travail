# <Nom du projet>

<!-- Gabarit de la méthode de travail. Remplacer chaque <…>, supprimer les commentaires. Court : ce fichier est relu à chaque session. -->

**Statut** : <en développement / en production> · **Mis à jour** : <AAAA-MM-JJ>

## Ordre de lecture

1. Ce fichier → 2. **`docs/ETAT-ACTUEL.md`** (chantiers, décisions en attente, PR ouvertes) →
   3. **`docs/ERREURS-CONNUES.md`** (erreurs déjà diagnostiquées ; par `grep` sur le message s'il est long) →
   4. documents du projet (`docs/projets/<slug>/`).
- **Toute demande de changement** : skill `tache` (parcours unique en 8 étapes) ; skills et agents qui les
  chargent : `.claude/skills/REGISTRE.md` ; où va le code : `docs/ARCHITECTURE.md` s'il existe.
- **Jamais `SUIVI-TACHES.md` en entier** (grep + lecture ciblée). Chaque livraison : entrée au suivi (avec « Non
  fait dans ce round » ; jamais ✅ sur du non vérifié ; aucun secret) et `docs/ETAT-ACTUEL.md` à jour, puis tout est
  **poussé** (skill `livrer`, contrôlé en CI). Avant de diagnostiquer une erreur : `grep` dans `docs/ERREURS-CONNUES.md`.
- Toujours lues : `.claude/rules/agent-workflow.md` (plan, accord, `qa-agent`) et `budget-jetons.md` (coût, modèle
  nommé). Chargées avec leurs fichiers : `suivi-taches.md`, `regles-metier.md`. Détails : `docs/methode/`, au besoin.

## Le projet

<!-- 5 à 10 lignes : ce que c'est, pour qui, ce qui est en ligne, ce qui rapporte. -->

## Fiche projet

<!-- Source unique des commandes et chemins du projet : lue par `qa-agent`, `securite`, `revue-integration`,
les skills (`livrer`, `qa-feature`, `incident`, `deploiement`, `point-projet`, `audit-seo`, `nouvelle-page`),
`scripts/check-suivi.js` et les contrôles mécaniques (`scripts/lib-controles.mjs` : « Dossiers de code »,
« Routes publiques », « Chemins sensibles ») et `scripts/verifier-methode.mjs` (qui refuse une
fiche restée à « <à remplir…> »). Une ligne par clé ; « — » quand c'est sans objet. Ne pas renommer les clés. -->

| Clé | Valeur |
|---|---|
| Pile | <à remplir : framework, base de données, hébergement, courriels, IA, i18n> |
| Dossiers de code | <à remplir : ex. `src/`, `supabase/`, `.claude/` — c'est `CHEMINS_CODE` du garde-fou du suivi> |
| Hors périmètre de Claude | <à remplir : dossiers réservés à un autre agent ou à une personne, sinon « — »> |
| Vérification | <à remplir : UNE commande, exactement ce que rejoue la CI (ex. `npm run verify`)> |
| Tests ciblés | <à remplir : commande pour un fichier de test unitaire ou e2e (ex. `npx vitest run <fichier>`)> |
| Serveur local | <à remplir : commande et adresse (ex. `npm run dev` → http://localhost:3000), sinon « — »> |
| Déploiement | <à remplir : comment le code part en ligne (ex. fusion sur `main` → déploiement automatique)> |
| Contrôle après déploiement | <à remplir : commande ou liste d'URL à contrôler (ex. `npm run smoke -- <url>`)> |
| Routes publiques | <à remplir : dossier des pages publiques (ex. `src/app/`), sinon « — »> |
| Chemins sensibles | <à remplir : dossiers ou fichiers dont un seul changement exige `qa-agent` (authentification, accès, base, paiement ; ex. `src/lib/auth/`, `supabase/`, `middleware.ts`), sinon « — »> |
| Sitemap et navigation | <à remplir : fichiers du sitemap, de la barre de navigation et du pied de page, sinon « — »> |
| Langues | <à remplir : ex. FR seul, ou FR / EN> |
| Valide les livraisons | <à remplir : la personne qui donne l'accord (plans, mises en ligne, migrations)> |

La commande **Vérification** est la seule qui fait foi avant un commit : si elle passe en local, la CI passe.
Elle inclut `node scripts/check-rules.mjs` (règles métier mécaniques, `.claude/rules/regles-metier.md`) et
`node scripts/check-secrets-suivis.mjs` (aucun `.env`, jeton ou clé privée suivi par Git).
<!-- Étapes qu'elle enchaîne, pour diagnostiquer un échec : <typecheck> · <lint> · <tests> · <build> · <audit> -->

Hooks Git (une fois par clone ; fait automatiquement par `scripts/session-start.sh` dans une session Claude) :
`git config core.hooksPath .githooks`. Ils bloquent un commit qui viole une règle (`check-rules`), suit un
secret (`check-secrets-suivis`) ou n'a pas été vérifié par `qa-agent` (`check-qa-trace`) ; ils avertissent
seulement pour le suivi et la taille du diff. Les tests des contrôles : `node --test scripts/tests/controles.test.mjs`.

## Conventions

<!-- Langue des textes, nommage, une fonctionnalité par commit, qui applique les migrations en production, conformité (ex. AMF, Loi 25). -->
