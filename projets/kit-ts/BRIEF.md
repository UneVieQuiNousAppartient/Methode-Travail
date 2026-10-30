# BRIEF — Kit TypeScript, lot 1 (site public, formulaires, courriels)

**Date :** 2026-10-30 · **Demandé par :** Camille (« prendre les meilleurs entre VieSolution, Web et KHI » ; « prépare
le lot 1 ») · **Taille :** petit chantier (BRIEF + IMPLEMENTATION-PLAN)

## 1. Problème
Chaque nouveau site client refait à la main la même base : adresse du site, anti-abus, Turnstile, CSP, consentement
Loi 25, envoi de courriels, désabonnement LCAP. Le kit CRM (`kits/crm/`) n'existe qu'en JavaScript et ne couvre pas
ces briques du site public. La comparaison du 30 oct. (`VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md`, PR #357)
a choisi, brique par brique, la meilleure version parmi VieSolution-CSF, KHI Educ et Vie Solution Web.

## 2. Publics
- **Public principal :** Claude (et Camille) au démarrage d'un projet client en TypeScript, via la skill `nouveau-crm`.
- **Autres publics :** les projets existants, qui reçoivent les corrections par PR.

## 3. Objectifs
1. Un dossier `kits/crm/ts/` qui reproduit l'arborescence d'un projet Next.js + TypeScript strict, avec les briques du
   lot 1 copiées de leur meilleure source, **chacune avec ses tests Vitest** et sa ligne d'origine.
2. Les tests du kit passent hors de tout projet (dossier temporaire, comme le kit JS).
3. `CATALOGUE.md` (colonne « TS »), `README.md`, `CHANGELOG.md` et la skill `nouveau-crm` savent que la variante TS existe.

## 4. Contraintes
- Réutiliser, pas réécrire : chaque fichier vient d'un des trois projets (chemin et commit d'origine notés).
- Rien de propre à un client (textes, coordonnées, domaines, prix) : paramètres ou variables d'environnement.
- Briques retenues (MEILLEURES-BRIQUES, lot 1) : adresse du site · IP fiable · anti-abus avec repli en mémoire et taille
  de corps + table des limites de KHI · Turnstile · CSP bloquante (observation → actif) · redirection interne sûre ·
  consentement jamais précoché · envoi Resend (Web) · désabonnement en un clic + règles LCAP · garde du secret cron ·
  règles `check-rules` génériques remontées au modèle.
- Jamais de `node_modules` dans le dépôt ; aucune migration appliquée (le kit fournit les fichiers SQL, c'est tout).
- Budget : palier moyen, ≈ 400-600 k jetons.

## 5. Hors périmètre
Lot 2 (admin, double vérification, journal, Loi 25 côté admin, archivage, santé) et lot 3 (clés d'API, connecteur,
automatisations, agenda, webhooks). Aucun changement dans les trois projets d'origine (les écarts de KHI sont suivis dans
KHIEDUC#96).

## 6. Sources
`VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md` (table, écarts, lots), `docs/methode/SOCLE-STANDARD.md` ;
`kits/crm/README.md`, `CATALOGUE.md`, `LECONS.md`, `auth/BRIQUE.md`, `tests/BRIQUE.md`.

## 7. Questions ouvertes
Aucune bloquante. À confirmer en relisant le plan : la version de Vitest et de TypeScript épinglées pour les tests du kit
(proposé : celles de VieSolution-CSF).
