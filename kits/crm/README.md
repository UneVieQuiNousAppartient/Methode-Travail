# Kit CRM

Pour démarrer un CRM, un admin ou un espace client **sans repartir de zéro** : le code, les règles d'écran et
les leçons tirés de **KHI Educ** (CRM d'un service de tutorat, sept.-oct. 2026), nettoyés de tout ce qui lui
est propre. À utiliser avec la skill **`nouveau-crm`** du modèle (`modele/.claude/skills/nouveau-crm/`).

## Ce qu'il contient

| Fichier ou dossier | Rôle |
|---|---|
| `CATALOGUE.md` | **La carte** : toutes les briques (accès, admin, fonctions CRM, courriels, contenu, vie privée, IA, tests), « code » (fourni ici) ou « fiche » (décrite, à réécrire pour le métier) |
| `LECONS.md` | Ce qui a déjà coûté cher, avec la cause prouvée et ce qui l'évite |
| `auth/` | **Code** — liste blanche de l'équipe, rôles par route, espaces par rôle, double authentification, « se souvenir de cet appareil 30 jours », journal d'activité, clés d'API : `lib/`, routes `app/v1/`, migrations `supabase/migrations/`, tests ; mode d'emploi dans `auth/BRIQUE.md` |
| `admin/` | **Code** — coquille (barre latérale + barre du haut alignées), `apiFetch`, cartes de confirmation, fiche en page, tableaux et graphiques, écrans de double authentification, squelette d'écran admin ; règles d'écran dans `admin/PATTERNS.md`, mode d'emploi dans `admin/BRIQUE.md` |
| `tests/` | **Code** — faux Supabase en mémoire, loaders, lanceur de tests, harnais de simulation de l'admin réel (Playwright) ; mode d'emploi dans `tests/BRIQUE.md` |
| `ts/` | **Code TypeScript strict** (lot 1, site public) — adresse du site, IP fiable, anti-abus (base + repli mémoire), Turnstile, CSP (observation → actif), redirection interne sûre, consentement jamais précoché, envoi Resend, désabonnement LCAP en un clic, garde du secret cron ; migrations `01xx`, tests Vitest ; chaque brique prise sur la meilleure de trois sources (VieSolution-CSF, KHI Educ, Vie Solution Web) ; mode d'emploi dans `ts/BRIQUE.md` |
| `package.json` | Pour faire tourner les tests du kit JS dans ce dépôt (dossier temporaire, voir plus bas) — pas à copier tel quel (`ts/` a le sien) |

Chaque dossier de code reproduit l'arborescence d'un projet : un fichier `kits/crm/auth/lib/mfa.js` se copie
en `lib/mfa.js`. Les imports utilisent l'alias `@/` (racine du projet). Chaque fichier commence par sa ligne
d'origine « Kit CRM (methode-travail) — origine : KHI Educ, … ».

## Pile visée

Next.js (App Router), Supabase (Postgres, Auth, RLS), Vercel, Tailwind, `sonner`, `lucide-react`,
`recharts` ; courriels Resend.
- **JavaScript** : `auth/`, `admin/`, `tests/`.
- **TypeScript strict** : `ts/` (lot 1 : site public, formulaires, courriels ; lots 2 et 3 à venir — admin,
  journal, Loi 25 côté admin, puis clés d'API, automatisations, agenda). Pour ce qui n'existe pas encore en TS,
  traduire la brique JS ou la fiche. Une autre pile garde les **fiches**, les **leçons** et
`admin/PATTERNS.md` ; le code est alors un modèle à traduire, pas à copier.

## Ordre d'installation

0. Projet TypeScript : `ts/` **avant toute route publique** — migrations `0101`, `0102` (accord, appliquées par
   Camille), puis `src/lib/`, puis les routes `api/desabonnement`, `api/csp-rapport` et `next.config` (CSP en
   observation) ; voir `ts/BRIQUE.md`.
1. `auth/` — migrations, puis `lib/`, puis routes (`/v1/auth/role`, `/v1/admin/me`) ; adapter la matrice des
   rôles (`lib/roles.js`).
2. `tests/` — le faux Supabase et les loaders avant la première route métier.
3. `admin/` — jetons de couleur `brand-*`, coquille, `apiFetch`, confirmations, squelette.
4. Options : « se souvenir de cet appareil », clés d'API, espaces clients.
5. Fonctions métier, une par une, d'après `CATALOGUE.md`.

Le détail (questions à poser, accords, vérifications) est dans la skill `nouveau-crm`.

## Vérifier le kit lui-même

Les tests du kit tournent hors de tout projet. Jamais de `node_modules` dans ce dépôt : copier dans un dossier
temporaire, installer, lancer (le détail est dans `auth/BRIQUE.md` et `tests/BRIQUE.md`). Kit TS :
`npm run verify` (tsc strict + Vitest) dans une copie `mktemp -d`, commande exacte dans `ts/BRIQUE.md` ; les
essais de mutation se font uniquement dans cette copie (incident E15 de VieSolution-CSF).

## Tenir le kit à jour

Une brique corrigée ou améliorée dans un projet remonte ici par une PR (entrée dans `CHANGELOG.md`). Une
brique « fiche » réécrite proprement peut devenir une brique « code ». Ce qui reste propre à un client (textes,
prix, coordonnées, témoignages, politiques) n'entre jamais dans le kit.
