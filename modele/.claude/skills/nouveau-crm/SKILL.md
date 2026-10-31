---
name: nouveau-crm
description: Démarrer un CRM, un admin ou un espace client à partir du kit CRM du dépôt methode-travail (kits/crm) — briques choisies avec l'utilisatrice, installées dans l'ordre (base et accès, puis admin, puis fonctions), adaptées et vérifiées une à une
when_to_use: Un projet a besoin d'un admin, d'une gestion de clients ou de demandes (leads), de comptes avec rôles, de double authentification, d'un espace client, ou l'utilisatrice dit « comme le CRM d'un autre projet » / « reprends le kit CRM »
user-invocable: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
disallowed-tools: []
model: opus
effort: high
---

# Nouveau CRM à partir du kit

> Chemins et commandes : **Fiche projet** de `CLAUDE.md` (Pile, Dossiers de code, Vérification, Tests
> ciblés, Déploiement). Le kit vit dans le dépôt `methode-travail`, dossier `kits/crm/` : **ajouter
> `methode-travail` à la session** pour le lire (une session cloud ne voit que les dépôts qu'on lui ajoute).

Le kit regroupe ce qu'un CRM a déjà coûté à construire sur des projets clients : authentification et rôles, double
authentification avec « se souvenir de cet appareil 30 jours », admin (coquille, confirmations, fiche en page,
rafraîchissement après chaque modification), outillage de tests et harnais de simulation de l'admin réel.
Il ne remplace pas la conception : pour un gros projet, la skill `nouveau-projet` passe d'abord (BRIEF, PRD…),
et ce kit sert à l'étape de construction.

## 0. Lire avant de proposer

1. `kits/crm/README.md` (ordre, prérequis, pile visée), puis `kits/crm/CATALOGUE.md` (toutes les briques,
   « code » ou « fiche »), puis `kits/crm/LECONS.md` (ce qui a déjà coûté cher).
2. Le projet : `CLAUDE.md` (Fiche projet), le schéma de la base s'il existe, l'authentification en place.
   **Ne jamais écraser** un fichier du projet : fusionner, ou signaler le doublon.
3. Pile du projet : Next.js App Router + Supabase en **JavaScript** → `auth/`, `admin/`, `tests/` ; en
   **TypeScript strict** → `kits/crm/ts/` d'abord (lot 1 : site public, formulaires, courriels ; lot 2 : socle
   de l'admin d'équipe, sans écrans ; poste d'appel depuis 1.6.0 : file du jour, 5 résultats en une transaction,
   scripts vides « à recevoir », brouillon de courriel après l'appel, sans écrans ; mode d'emploi `ts/BRIQUE.md`), puis les briques JS **à traduire** pour ce
   qui n'existe pas encore en TS (écrans, clés d'API, automatisations). Autre pile : le
   dire tout de suite ; le code ne se copie pas tel quel ; les **fiches**, les **leçons** et les **règles
   d'écran** (`admin/PATTERNS.md`) restent valables.

## 1. Choisir les briques avec l'utilisatrice

Présenter, **en français simple**, la liste des briques utiles au projet (pas tout le catalogue), en trois
groupes, avec ce que chacune apporte en une ligne et son coût estimé (`budget-jetons.md`) :
- **socle** (presque toujours) : accès de l'équipe et rôles, journal d'activité, double authentification,
  coquille d'admin, confirmations, outillage de tests ; **site public** : adresse du site, IP fiable,
  anti-abus, Turnstile, CSP, consentement jamais précoché, envoi de courriels, désabonnement (LCAP), garde du
  secret cron (`ts/` en TypeScript ; en JavaScript : fiches du catalogue) ; **socle admin TS** (lot 2, L0-L12) :
  rôles et refus par défaut, entrée de l'équipe, double vérification, appareils de confiance, codes de secours,
  verrou de compte, journal des actions, journal d'accès Loi 25, accès et effacement, conservation limitée,
  archivage, santé + battement ;
- **selon le besoin** : « se souvenir de cet appareil », clés d'API, espaces clients (rôles + règles de la
  base), fiche en page, assistant ;
- **fonctions** (fiches à réécrire pour le métier) : leads, tâches, Kanban, CSV, « Aujourd'hui »,
  relances automatiques, consentement anti-pourriel, articles, vie privée.

Poser les questions qui changent le code (une à la fois si possible) :
- Qui entre dans l'admin, avec quels rôles ? Qui a le droit de supprimer définitivement ? (Kit TS : rôles par
  défaut `admin` > `gestionnaire` > `employe`, paramétrables par `createRoles` / `defineAccessMatrix`, refus par
  défaut ; la matrice d'exemple est `[à adapter]`. **Poser cette question au démarrage**, avant toute migration :
  le `check` des rôles de `0103` en dépend.)
- Une seule personne entre dans l'admin, sans comptes ? Voir la fiche « Admin d'un seul propriétaire » de
  `ts/BRIQUE.md` (et ses limites) avant de choisir.
- Combien de mois garder une demande sans activité (`RETENTION_MONTHS`, obligatoire) ?
- Y a-t-il des clients qui se connectent (espace client) ? Avec double authentification obligatoire ?
- « Se souvenir de cet appareil 30 jours » : pour qui, case cochée par défaut ou non ?
- Langues de l'admin ?

**Accord obligatoire avant la première ligne** (`agent-workflow.md`) : l'authentification, les accès et le
schéma de la base sont dans la liste « accord avant de coder ».

## 2. Installer dans l'ordre

Chaque brique a un `BRIQUE.md` : fichiers, tables, variables d'environnement, dépendances, adaptation,
vérification. Le suivre à la lettre. Ordre :

0. **Projet TypeScript : `kits/crm/ts/`** avant toute route publique — migrations **dans l'ordre `0101` →
   `0111`** (**0104 avant 0105** ; accord ; appliquées par la personne qui valide seulement), puis `0112` si le
   projet prend le poste d'appel (listes `[à adapter]` alignées sur sa `ConfigAppels`, routes selon les règles
   (f)-(h) de `ts/BRIQUE.md`, scripts du client relus par un humain avant usage) ; **préalable
   Supabase** avant d'ouvrir l'admin : inscriptions publiques **désactivées** et « Confirm email » **activé** ;
   puis `src/lib/`, puis les routes (`api/desabonnement`, `api/csp-rapport`), la CSP dans `next.config` (en
   **observation** d'abord) et les routes de l'admin écrites par le projet selon les règles (a)-(e) de
   `ts/BRIQUE.md` (page des codes de secours jamais en ligne sans le verrou), avant les briques JS équivalentes
   à traduire.

1. **Base et accès** (`kits/crm/auth/`) : migrations (skill de migration du projet, ou `apply_migration`
   avec l'accord de l'utilisatrice), `lib/authServer.js`, `lib/roles.js` (**matrice à réécrire** pour les
   routes du projet), `lib/mfa.js`, `lib/audit.js` ; puis routes `/v1/auth/role`, `/v1/admin/me`.
2. **Tests** (`kits/crm/tests/`) : faux Supabase et loaders **avant** d'écrire la première route métier ;
   les tests de la brique auth doivent passer dans le projet.
3. **Admin** (`kits/crm/admin/`) : jetons de couleur `brand-*` dans `tailwind.config.js`, classes globales,
   coquille avec la navigation du projet, `apiFetch`, `ConfirmProvider`, squelette `AdminClient.exemple.jsx`
   adapté ; écrans de double authentification.
4. **Options** : « se souvenir de cet appareil » (migration + routes `/v1/auth/mfa/*` + écrans), clés d'API,
   espaces clients (politiques restrictives sur **chaque** table lue par le navigateur).
5. **Fonctions métier** : une par une, d'après leur fiche du catalogue, chacune avec sa route, son test
   (`tester-dabord` pour toute règle d'accès, de date, de consentement ou d'argent), son écran et sa ligne
   dans le contrat d'API.

Nettoyage à chaque copie : la ligne d'origine « Kit CRM (methode-travail) » reste en tête du fichier ; tout
texte visible est réécrit pour le client (règle « rien que le client n'a pas dit ») ; aucune valeur d'un autre
projet (domaine, courriel, identifiant de projet Supabase, nom).

## 3. Vérifier chaque brique avant la suivante

- La commande **Vérification** de la Fiche projet passe.
- Kit TS : `npm run verify` du kit (tsc strict + Vitest) dans un dossier `mktemp -d` (commande dans
  `ts/BRIQUE.md`), puis les mêmes tests dans le projet. **Règle E15** : un essai de mutation (« casser la
  règle ») ne se fait **que** dans une copie `cp -a` sous `mktemp -d`, avec une garde sur `$PWD` ; jamais
  `rsync`, jamais `rm -rf` sur un chemin relatif, jamais dans un dépôt.
- Les tests de la brique passent **et échouent quand on casse la règle** (une fois, noté au suivi).
- Pour l'admin : le harnais de simulation (`kits/crm/tests/simulation/`) joue le démarrage (chaque appel une
  seule fois) et chaque action en échec, en refus et en réussite (confirmation, message de réussite et d'erreur,
  mise à jour des autres vues).
- Pour l'authentification et les règles de la base : agent `securite` **avant la mise en ligne de tout admin**
  (socle TS compris : rôles, MFA, codes de secours, verrou, effacement) ; test des
  règles d'accès dans une transaction annulée (`LECONS.md`, leçon 3).
- `qa-agent` en fin de lot, puis la skill `livrer`.

## 4. Rendre au kit ce qu'on a appris

Une amélioration générale faite dans le projet (correctif d'une brique, nouvelle leçon, nouvelle règle
d'écran) remonte dans `kits/crm/` par une PR sur `methode-travail`, avec une entrée dans `CHANGELOG.md`.
Une brique « fiche » réécrite proprement dans un projet peut devenir une brique « code ».

## Compte rendu

Briques installées (et celles écartées, avec la raison), adaptations faites, migrations appliquées, tests
(sortie + preuve de la règle cassée), simulation, revues, coût réel.
