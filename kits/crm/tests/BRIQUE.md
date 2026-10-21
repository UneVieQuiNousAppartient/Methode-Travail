# Brique « tests » — tests unitaires sans réseau et simulation de l'admin réel

Origine : KHI Educ (CRM Next.js 16 + Supabase), octobre 2026.

## À quoi ça sert

1. **Tests unitaires de routes Next.js sans Next ni base** : chaque `tests/unit/*.test.mjs` importe les
   vraies routes (`@/app/v1/...`) et la vraie logique (`@/lib/...`), avec un faux Supabase en mémoire à la
   place de `@/lib/supabaseAdmin`. Aucune bibliothèque de test : un fichier écrit des lignes `✓` / `✖` et
   sort avec un code ≠ 0 en cas d'échec.
2. **Simulation de l'admin réel** : build de production local ouvert dans Chromium, connexion Supabase Auth
   et API `/v1/**` interceptées par un faux serveur à état. On voit ce que voit l'utilisateur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tests/unit/fake-supabase.mjs` | `createFakeSupabase` (en mémoire, à état), `createScriptedSupabase` (réponses fixées), `installFakeSupabase`, `getSupabaseAdmin` |
| `tests/unit/alias-loader.mjs` | crochet Node : `@/…` → racine du projet (`.js` ou `/index.js`, comme Next) ; `next/server` et `next/cache` |
| `tests/unit/fake-supabase-loader.mjs` | crochet Node : `@/lib/supabaseAdmin` → `fake-supabase.mjs` |
| `scripts/run-unit-tests.mjs` | lance chaque test dans un processus séparé, résume (`PASS`/`FAIL`, nombre de `✓`) ; motif optionnel |
| `simulation/harness.mjs` | `openAdmin`, `makeStore`, `defaultRespond` (point d'extension), `toasts`, `duplicateGets`, `SELECTORS` |
| `simulation/common.mjs` | `stepper` (compte rendu par étape), `confirmIfShown` |
| `simulation/s0-demarrage.mjs` | scénario : ouverture, appels au chargement, GET en double, erreurs de page |
| `simulation/s7-double-auth.mjs` | scénario : double authentification avec / sans appareil de confiance |

`package.json` du kit : `npm test`, `npm run sim:demarrage`, `npm run sim:double-auth` ; `jsconfig.json` :
alias `@/*` pour Next et l'éditeur (les tests, eux, passent par `alias-loader.mjs`).

## Faux Supabase (`fake-supabase.mjs`)

**`createFakeSupabase(tables, { rpc, fail })`** — base en mémoire :
- couvre `select`, `insert`, `update`, `upsert` (`onConflict`, `ignoreDuplicates`), `delete` ; filtres `eq`,
  `neq`, `is`, `not(…, "is", …)`, `in`, `ilike` (motifs `%`/`_` et `\` d'échappement), `lt`, `lte`, `gt`, `gte`,
  `contains` ; `order`, `limit`, `range` (sans effet) ; `or()` ignoré ; `single`, `maybeSingle` ; `rpc` ;
  `.insert().select()` et `.delete().select()` renvoient les lignes ;
- trace : `db.reads`, `db.writes` (`{ op, table, rows | patch, ids }`), `db.rpcs`, `db.ilikes` ; aides
  `db.tables.<t>`, `db.row(t, id)`, `db.writesTo(t)` — pour prouver « refusé **avant toute écriture** » ;
- **`fail(query)`** → texte, `{ code, message }` (ex. `23505` doublon) ou `null` : simule une colonne absente,
  une contrainte, une panne, table par table (`query.table`, `query.op`) ;
- Auth : le test pose `db.auth = { getUser: async (jeton) => … }` (jetons de forme JWT avec `aal`, `session_id`).
- Ne fait pas : jointures imbriquées (`"*, lead:leads(*)"`), `count: "exact"`, RLS, contraintes, triggers.

**`createScriptedSupabase(results)`** — sans état, pour une fonction qui reçoit le client en paramètre ou une
forme que la base en mémoire ne produit pas : `results[table]` = réponse de `maybeSingle()`/`single()` ;
**`results["table[]"]`** = réponse d'une lecture de liste (`await` direct ; défaut `{ data: [], error: null }`) ;
`results["rpc:nom"]` ; chaque appel est noté dans `calls` (`{ table, ops: [["eq", "id", 1], …] }`).

## Loaders : ordre et usage

```js
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
register("./fake-supabase-loader.mjs", import.meta.url); // enregistré APRÈS = consulté AVANT
const { createFakeSupabase, installFakeSupabase } = await import("./fake-supabase.mjs");
const route = await import("@/app/v1/admin/me/route.js"); // import() dynamique, jamais d'import statique
```
Un test qui veut le vrai client (ex. faux serveur HTTP local) n'enregistre que `alias-loader.mjs`.

## Harnais de simulation

**Mode d'emploi**
```bash
npm i -D playwright-core                       # navigateur : chromium installé à part
NEXT_PUBLIC_SUPABASE_URL=https://fakeproj.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=fake npm run build
npx next start -p 3100 &
CHROMIUM_PATH=/chemin/vers/chromium node simulation/s0-demarrage.mjs capture.png
```
Variables : `SIM_BASE_URL` (défaut `http://localhost:3100`), `SIM_SUPABASE_URL` (défaut
`https://fakeproj.supabase.co`, **doit être l'URL du build**), `SIM_READY_SELECTOR`, `CHROMIUM_PATH`
(absent : navigateur de Playwright). Le témoin de session `sb-<projet>-auth-token` est posé d'après l'hôte.

**Ce qu'il a déjà trouvé** sur le CRM d'origine (tests unitaires tous verts) :
- **double chargement au démarrage** (mêmes GET deux fois : deux effets React) → `duplicateGets` dans `s0` ;
- **actions sans message** : écritures faites, aucun retour à l'écran (« message: AUCUN » dans `stepper`),
  y compris en échec simulé (`store.failWrites`) ;
- **sélection groupée qui survivait au changement de filtre** : des fiches cochées puis masquées restaient
  dans l'action groupée suivante.

**Point d'extension `respond()`** : `defaultRespond(store, method, path, search, body)` répond aux routes de
base (`/v1/auth/role`, `/v1/admin/me`, leads, tâches, double authentification) ; passer
`openAdmin({ respond })` et déléguer le reste. Rester **à état** (une écriture change `store`, la lecture
suivante la voit). Route oubliée : réponse neutre, visible dans `store.calls`.

**Écrire un scénario**
```js
import { openAdmin } from "./harness.mjs";
import { stepper, confirmIfShown } from "./common.mjs";
const { browser, page, store, errors } = await openAdmin();
const step = stepper(page, store);
await step("archiver un lead", async () => {
    await page.click('[data-testid="lead-archive-lead-1"]');
    return confirmIfShown(page);
});
store.failWrites = true;
await step("archiver en panne : un message doit le dire", async () => { /* … */ });
console.log("erreurs de page:", errors.join(" / ") || "aucune");
await browser.close();
```
Une ligne par étape : confirmation montrée ou non, écritures faites, nouveaux messages (`AUCUN` = défaut à
signaler), encarts `role=status|alert`. Les `data-testid` sont ceux du frontend du projet (`SELECTORS`).

## Comment vérifier la brique elle-même

Copier le **contenu** de `auth/` et de `tests/` (pas les dossiers eux-mêmes : `auth/lib/mfa.js` devient
`lib/mfa.js`, `tests/tests/unit/` devient `tests/unit/`) avec `package.json` et `jsconfig.json` à la racine d'un
dossier jetable, `npm install`, `npm test` : les trois tests de la brique auth passent (ils utilisent ce faux
Supabase et ces loaders). Les deux `BRIQUE.md` y tombent au même chemin : sans importance dans ce dossier.

## Pièges connus

- Importer un module du projet **avant** `register(...)` (import statique) : l'alias n'est pas résolu.
- Next 16 n'a pas de carte d'exports lisible par Node seul : `next/server.js` (avec l'extension) hors Next.
- `range()`/`order()` sans effet : ne pas tester la pagination ni le tri avec la base en mémoire.
- Le harnais intercepte `/v1/**` **dans le navigateur** : les composants serveur (RSC) qui lisent la base
  au rendu ne sont pas simulés ; viser les écrans clients.
- Build avec une autre URL Supabase que `SIM_SUPABASE_URL` → aucune interception, page bloquée sur la connexion.
