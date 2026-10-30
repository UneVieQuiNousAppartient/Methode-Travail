# IMPLEMENTATION-PLAN — Kit TypeScript, lot 1 (site public, formulaires, courriels)

**Date :** 2026-10-30 · **Auteur :** tech-lead (Opus) · **Entrée :** `projets/kit-ts/BRIEF.md` (validé par Camille) ·
**Source de la sélection :** `VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md` (table, écarts 3, 4 et 7, « Lot 1 »)

## 1. Résumé

1. Créer `kits/crm/ts/` : un mini-projet Next.js + TypeScript strict (`src/lib/...`, tests colocalisés `*.test.ts`,
   Vitest) qui se copie **tel quel** à la racine d'un projet client, à côté du kit JS (`auth/`, `admin/`, `tests/`).
2. Dix briques du lot 1, chacune copiée de sa meilleure source (VieSolution-CSF, KHI Educ, Vie Solution Web), avec ses
   tests repris, ce qui manque ajouté, et une ligne d'origine (projet + chemin + commit).
3. Les tests du kit TS tournent hors de tout projet, dans un dossier temporaire, versions épinglées sur VieSolution-CSF.
4. Mises à jour : `CATALOGUE.md` (colonne « TS »), `README.md` du kit, `CHANGELOG.md` et `VERSION` (1.4.0), skill
   `nouveau-crm`, et 4 règles génériques remontées dans `modele/scripts/check-rules.mjs`.
5. Aucun changement dans les trois projets d'origine ; aucune migration appliquée ; aucune mutation de code dans un dépôt.

**Coût total estimé : ≈ 585 k jetons — palier moyen (≤ 1 M)**, au plus 2 agents en parallèle, tous en **Opus**.

## 2. Règles d'exécution (valent pour toutes les phases)

- **Interdiction absolue : aucune mutation de code dans un dépôt** (incident **E15** de VieSolution-CSF, 29 et 30 oct.
  2026 : `rsync` absent, chaîne `cd <copie> && …` arrêtée avant le `cd`, puis `rm -rf src` joué **dans le dépôt**). Les
  essais de mutation (« casser la règle une fois », skill `tester-dabord`) se font **uniquement** dans une copie :
  `T=$(mktemp -d)` ; `cp -a /home/user/methode-travail/kits/crm/ts/. "$T"/` ; `test -d "$T/src" || exit 1` ;
  `cd "$T" && [ "$PWD" != "/home/user/methode-travail" ] || exit 1` avant toute modification. Jamais `rsync`, jamais
  `rm -rf` sur un chemin relatif, chemins absolus partout. Les trois dépôts sources sont en **lecture seule**.
- **Jamais de `node_modules`, `package-lock.json` ni `.next/` dans `methode-travail`** : `npm install` seulement dans
  `$T`. Vérifier en fin de phase : `git -C /home/user/methode-travail status --porcelain` ne montre que des fichiers
  prévus.
- **Ligne d'origine** en tête de chaque fichier copié (format du kit JS, étendu au commit) :
  `// Kit CRM TS (methode-travail) — origine : <Projet>, <chemin>, commit <sha court> (<date>) ; généralisé : <quoi>.`
  Le sha se lit par `git -C <dépôt source> log -1 --format=%h -- <chemin>`. Un fichier écrit pour le kit (rien à
  copier) porte `— origine : écrit pour le kit (<raison>)`. Fichiers SQL : même ligne en commentaire `--`.
- **Rien de propre à un client** : ni domaine, ni courriel, ni nom (« VieSolution », « KHI », « Camille », « Vie
  Solution Web »), ni identifiant Supabase, ni prix, ni date de décision d'un client, ni texte d'interface définitif.
  Ce qui varie devient **paramètre** ou **variable d'environnement** ; les textes visibles restent des exemples marqués
  `[à adapter]`. Les commentaires d'historique (« décision de Camille, 23 oct. ») sont remplacés par la règle seule et,
  si utile, « (origine : <projet>, <issue>) ».
- Une seule boucle : un passage de vérification, une révision au plus (`budget-jetons.md`). Ce qui reste va dans
  « Non fait ».
- Les sous-agents reçoivent : « plan approuvé par Camille, tu exécutes, tu ne dispatches personne », les chemins de
  départ (ce document, section de leur phase), et « écris les fichiers vers le tour 15, puis vérifie ». `maxTurns` ≥ 30.

## 3. Arborescence cible

```
kits/crm/ts/
├── BRIQUE.md                       mode d'emploi : fichiers, variables d'env, tables, installation, vérification
├── package.json                    tests du kit seulement (pas à copier tel quel dans un projet)
├── tsconfig.json                   strict, alias @/* → src/*
├── vitest.config.ts                environment node, alias @ → ./src, include src/**/*.test.ts
├── .env.exemple                    toutes les variables du lot 1, sans valeur
├── src/lib/
│   ├── site/site-url.ts (+ .test.ts)                    adresse du site
│   ├── api/request-ip.ts (+ .test.ts)                   IP fiable
│   ├── api/rate-limit-core.ts (+ .test.ts)              règles pures du compteur
│   ├── api/abuse-guard.ts (+ .test.ts)                  compteur en base + repli mémoire + taille de corps
│   ├── api/abuse-policies.ts (+ .test.ts)               table des limites (exemples génériques + LIMITS de KHI)
│   ├── api/turnstile.ts (+ .test.ts)                    Turnstile (KHI porté en TS + refus 503)
│   ├── security/csp-policy.mjs, csp-policy.d.mts        CSP lue par next.config
│   ├── security/csp.ts (+ .test.ts)                     CSP bloquante + observation → actif + résumé des rapports
│   ├── security/internal-redirect.ts (+ .test.ts)       redirection interne sûre
│   ├── security/trailing-backslash.ts (+ .test.ts)      dépendance de internal-redirect
│   ├── leads/consent.ts (+ .test.ts)                    consentement jamais précoché (règles pures)
│   ├── email/envoi.ts (+ .test.ts)                      envoi Resend (fetch, sans SDK)
│   ├── email/desabonnement.ts (+ .test.ts)              jeton HMAC, lien, en-têtes RFC 2369/8058, adresse masquée
│   ├── email/lcap.ts (+ .test.ts)                       consentement tacite 6 mois / 2 ans, pied obligatoire
│   ├── cron/auth.ts (+ .test.ts)                        garde du secret cron
│   └── supabase/server-admin.ts                         client service_role (serveur seulement)
├── src/app/api/desabonnement/route.ts (+ route.test.ts)  désabonnement en un clic (GET page + POST RFC 8058)
├── src/app/api/csp-rapport/route.ts (+ route.test.ts)    réception des rapports CSP (résumé sans paramètres d'URL)
├── next.config.exemple.mjs                               branchement CSP (en-tête par route, observation → actif)
└── supabase/migrations/
    ├── 0101_rate_limits.sql                              table rate_limit_hits + hit_rate_limit + purge (RLS fermée)
    └── 0102_lcap_desabonnement.sql                       colonnes de désabonnement sur leads (à adapter)
```

Numérotation SQL 01xx pour ne pas heurter `auth/supabase/migrations/0001-0004` du kit JS.

## 4. Briques : source, cible, généralisation, tests, dépendances

Abréviations : **CSF** = `/home/user/VieSolution-CSF`, **KHI** = `/home/user/khieduc`, **WEB** = `/home/user/viesolution---web`.

### B1. Adresse du site
- **Source :** KHI `lib/siteUrl.js` + `tests/unit/site-url.test.mjs` (principal) ; CSF `src/lib/seo.ts` lu pour la
  forme TS de `normalizeSiteUrl` (pas copié : métadonnées SEO propres au site). WEB `src/lib/site.ts` **écarté**
  (domaine en dur).
- **Cible :** `src/lib/site/site-url.ts` — `getSiteUrl`, `getPublicSiteUrl`, `absoluteUrl`, `siteUrlSource`.
- **Généraliser :** retirer l'exemple `khieduc-viesolution.vercel.app` du commentaire ; variables
  `NEXT_PUBLIC_SITE_URL` puis `VERCEL_PROJECT_PRODUCTION_URL` ; jamais `localhost` dans `getPublicSiteUrl` (lève ou
  renvoie `null` selon KHI, garder le comportement d'origine).
- **Tests :** port Vitest de `site-url.test.mjs` (`vi.stubEnv`) ; **à ajouter :** barre oblique finale, chemin sans `/`
  initial, `http://` refusé en production si KHI le fait (sinon noté dans « Non fait »).
- **npm :** aucune.

### B2. Adresse IP fiable
- **Source :** CSF `src/lib/api/request-ip.ts` + `request-ip.test.ts`.
- **Cible :** `src/lib/api/request-ip.ts`.
- **Généraliser :** rien de client ; garder le commentaire « condition de déploiement » (sûr derrière Vercel ;
  autre relais → adapter). Corrige l'écart n° 4 de MEILLEURES-BRIQUES dans le kit.
- **Tests :** repris tels quels ; **à ajouter :** `x-vercel-forwarded-for` prioritaire sur `x-forwarded-for` falsifié,
  liste à plusieurs adresses, en-têtes absents → `null`.
- **npm :** aucune (type `HeaderSource` structurel, pas d'import Next).

### B3. Anti-abus avec repli en mémoire + taille de corps + table des limites
- **Source :** CSF `src/lib/api/rate-limit-core.ts`, `abuse-guard.ts`, `abuse-policies.ts` + `rate-limit-core.test.ts`,
  `abuse-guard.test.ts`, `abuse-policies.test.ts`, `shared-abuse-guard.test.ts` ; CSF
  `supabase/migrations/20261027_rate_limits.sql` ; CSF `src/lib/supabase/server-admin.ts` (vérifier le chemin exact par
  Glob) ; KHI `lib/rateLimit.js` : **seulement** la table `LIMITS` (l. 14-37) et le message 429 bilingue.
- **Cible :** `src/lib/api/rate-limit-core.ts`, `abuse-guard.ts`, `abuse-policies.ts`, `src/lib/supabase/server-admin.ts`,
  `supabase/migrations/0101_rate_limits.sql`.
- **Généraliser :**
  - `abuse-guard.ts` l. 56 : chaîne de dérivation `'viesolution:rate-limit:v1'` → constante
    `RATE_LIMIT_KEY_LABEL = 'kit-crm:rate-limit:v1'` (changer de projet change les empreintes : documenté) ;
  - secret : `RATE_LIMIT_PEPPER` d'abord ; garder le repli `CRON_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` de CSF, noté
    dans `BRIQUE.md` ;
  - délai base 800 ms → constante exportée `SHARED_COUNTER_TIMEOUT_MS` ;
  - **retirer de ce lot** : verrou par compte (`account-lock`, l. 261 s.), verrou TOTP, quota par membre, plafond de
    notifications (`NOTIFY_*` de `rate-limit-core.ts`, l. 80-105, liés à `EMAIL_NOTIFICATION_TO`) → lot 2 ; garder
    `decideHit`, `isPurgeable`, `parseSharedHitResult`, `normalizeIpForRateLimit` ;
  - `requireHumanVerification` (l. 467 s.) **sort** de `abuse-guard.ts` et va dans B4 ;
  - `abuse-policies.ts` : les politiques propres à CSF (chat, MCP, espace, admin) sont remplacées par des politiques
    génériques issues des `LIMITS` de KHI : `formulaire_public`, `connexion`, `desabonnement` (600/h), `chat`,
    `oauth_autorisation` (10/15 min) — valeurs de KHI, chacune commentée « origine KHI `LIMITS.<clé>` » ;
  - SQL : renommer en `0101_rate_limits.sql`, retirer toute référence à une table CSF, RLS activée sans politique
    (service_role seul), `security definer` + `search_path` fixé (vérifier que la source le fait ; sinon l'ajouter et
    le noter).
- **Tests :** les 4 fichiers CSF repris (dépendances base simulées par `vi.mock('@/lib/supabase/server-admin')`) ;
  **à ajouter :** base qui ne répond pas en `SHARED_COUNTER_TIMEOUT_MS` → repli mémoire qui **limite** (pas `true`
  aveugle, écart n° 3) ; corps JSON au-delà de la taille max → 413 avant lecture complète ; chaque politique de
  `abuse-policies.ts` a `limit > 0` et `windowMs > 0` (test de table).
- **npm :** `@supabase/supabase-js`, `next` (pour `NextRequest`/`NextResponse`).
- **Agent :** `data-agent` (SQL + client base).

### B4. Turnstile
- **Source :** KHI `lib/turnstile.js` + `tests/unit/turnstile.test.mjs` (17 tests) ; CSF `src/lib/api/abuse-guard.ts`
  `requireHumanVerification` (l. 467-520 env.) pour le refus 503 si `TURNSTILE_ENFORCE=1` et clé absente (#292).
- **Cible :** `src/lib/api/turnstile.ts`.
- **Généraliser :** port JS → TS strict (types `TurnstileMode = 'off' | 'verify' | 'enforce'`, résultat de
  `siteverify`) ; `clientIp` importé de B2 (plus de `@/lib/rateLimit`) ; jeton de sonde `"khi-health-probe"` →
  `"kit-health-probe"` ; messages FR/EN gardés comme exemples `[à adapter]` ; `AbortSignal.timeout(5000)` gardé
  (constante `TURNSTILE_TIMEOUT_MS`). Écart n° 7 : **ajouter** le contrôle facultatif du nom d'hôte renvoyé
  (`TURNSTILE_EXPECTED_HOSTNAME`, absent = pas de contrôle) — écrit pour le kit, marqué comme tel.
- **Tests :** les 17 de KHI portés ; **à ajouter :** `enforce` + clé absente → 503 (CSF) ; nom d'hôte différent → 403
  quand la variable est posée ; délai dépassé → « faute de notre côté » (laisse passer en `verify`, journalisé).
- **npm :** `next`.

### B5. CSP bloquante, observation → actif, résumé des rapports
- **Source :** CSF `src/lib/security/csp-policy.mjs`, `csp-policy.d.mts`, `csp.ts`, `csp.test.ts`, et le branchement
  dans `next.config.mjs` (lecture) ; WEB `src/lib/csp.ts` (`enTeteCsp({ observation })`, `resumeRapport`,
  `CSP_RAPPORT`) + `tests/csp.test.mjs` ; route de rapport de WEB (`src/app/api/csp-rapport/route.ts`, vérifier par Glob).
- **Cible :** `src/lib/security/csp-policy.mjs`, `csp-policy.d.mts`, `csp.ts`, `src/app/api/csp-rapport/route.ts`,
  `next.config.exemple.mjs`.
- **Généraliser :** base = CSF (bloquante en production, origine Supabase **exacte** tirée de
  `NEXT_PUBLIC_SUPABASE_URL`, `unsafe-eval` seulement en dev hors Vercel, politique plus stricte par route sensible —
  liste des routes en paramètre) ; ajout WEB : `CSP_MODE=observation|actif` (défaut `observation` sur un nouveau projet,
  bascule documentée dans `BRIQUE.md`) → `Content-Security-Policy-Report-Only` vs `Content-Security-Policy` ;
  `resumeRapport` (sans paramètres d'URL) ; origines tierces (Turnstile, Resend n'en demande pas) en tableau
  `CSP_EXTRA_ORIGINS` ; **retirer** `RETOURS_CLAUDE` de WEB (propre à son connecteur, lot 3).
- **Tests :** CSF `csp.test.ts` + WEB `csp.test.mjs` portés et dédoublonnés ; **à ajouter :** `observation` → en-tête
  Report-Only ; `NEXT_PUBLIC_SUPABASE_URL` absent → aucune origine `*.supabase.co` ; `VERCEL=1` → jamais
  `unsafe-eval` ; rapport avec `?token=…` → résumé sans requête ; route rapport : corps trop gros → 413, débit limité
  (B3).
- **npm :** `next`.

### B6. Redirection interne sûre
- **Source :** CSF `src/lib/security/internal-redirect.ts`, `trailing-backslash.ts` + leurs tests ; KHI
  `lib/internalHref.js` + `tests/unit/internal-href.test.mjs` (cas de test seulement).
- **Cible :** `src/lib/security/internal-redirect.ts`, `trailing-backslash.ts`.
- **Généraliser :** l. 91, exemple `https://viesolution.ca/dashboard/...` → `https://exemple.test/admin/...` ; préfixes
  autorisés en paramètre si la source les fige.
- **Tests :** CSF repris ; **à ajouter :** les cas de `internal-href.test.mjs` absents côté CSF (`//evil`, `/\evil`,
  `%2F%2F`, `javascript:`, espaces de tête) — un `it.each` « parité KHI ».
- **npm :** aucune.

### B7. Consentement Loi 25 jamais précoché
- **Source :** CSF `src/lib/leads/contact-consent.ts` + `contact-consent.test.ts` ; règle `consentement-precoche` de
  CSF `scripts/check-rules.mjs` (l. 72-82).
- **Cible :** `src/lib/leads/consent.ts`.
- **Généraliser :** **seul le principe** est générique ; retirer `CONTACT_CONSENT_SPLIT_AT`, `CONTACT_CONSENT_SOURCES`,
  `isGuideOnlyLead` (propres à CSF). Garder, typés et purs : `consentFromForm(value: unknown): boolean` (seul `true`
  strict compte ; `'on'`, `1`, absent → `false`), `hasBeenContacted`, `mayFollowUp`, `mayMakeFirstContact` avec la
  liste des sources et la date de bascule **en paramètre** ; schéma d'exemple `z.literal(true)` en commentaire (zod non
  imposé). Libellés (`CONTACT_CONSENT_LABEL`) → exemples `[à adapter]`.
- **Tests :** cas CSF qui restent valables ; **à ajouter :** valeur par défaut d'un formulaire vide → `false` ; table
  de vérité de `consentFromForm`.
- **npm :** aucune.

### B8. Envoi de courriels (Resend)
- **Source :** WEB `src/lib/crm/envoi.ts` ; KHI `lib/email.js` pour `esc` (échappement HTML).
- **Cible :** `src/lib/email/envoi.ts` (`envoyerCourriel`, `resendConfigure`, `expediteurConfigure`, `esc`).
- **Généraliser :** variables `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (déjà génériques) ; résultat typé
  `{ ok: true, id } | { ok: false, permanent: boolean, raison }` gardé ; clé d'idempotence et pièces jointes gardées ;
  en-têtes `List-Unsubscribe` acceptés en paramètre (venus de B9) ; sans clé → aucun envoi, `{ ok:false, permanent:true,
  raison:'non_configure' }` (ou la forme WEB, sans l'inventer).
- **Tests :** WEB n'a pas de test dédié → **à écrire** (fetch simulé par `vi.fn`) : 200 → `ok` + id ; 422/403 →
  permanent ; 429/500/erreur réseau → temporaire ; clé absente → aucun appel ; clé d'idempotence transmise ; `esc`
  sur `<>&"'`.
- **npm :** aucune (fetch natif ; pas de SDK `resend`).
- **Agent :** `automation-dev-agent`.

### B9. Désabonnement en un clic + règles LCAP
- **Source :** WEB `src/lib/crm/jeton.ts`, `src/lib/crm/regles.ts` (parties LCAP : pied obligatoire, adresse postale,
  page de désabonnement, langue), `src/app/api/desabonnement/route.ts` + `tests/crm-regles.test.mjs`,
  `tests/desabonnement-page.test.mjs` ; KHI `lib/lcap.js` + `tests/unit/lcap.test.mjs` (consentement tacite 6 mois / 2
  ans, `addMonths` sans débordement) ; KHI `lib/unsubscribe.js` (`likeExact`, `optOutAddress` : toutes les fiches de la
  même adresse, `maskEmail`, `unsubscribeSecretSource`) + `tests/unit/unsubscribe-route.test.mjs` (cas seulement).
- **Cible :** `src/lib/email/desabonnement.ts` (jeton, lien `https` seulement, en-têtes RFC 2369 + 8058, `memeSecret`,
  `maskEmail`, `likeExact`), `src/lib/email/lcap.ts` (6 mois / 24 mois en constantes, `canSendCommercial`,
  `relanceSkipReason`, pied obligatoire : aucun envoi commercial sans adresse postale `LCAP_POSTAL_ADDRESS` ni lien),
  `src/app/api/desabonnement/route.ts`, `supabase/migrations/0102_lcap_desabonnement.sql`.
- **Généraliser :** route WEB : `@/lib/site` → B1 ; `@/lib/supabase/admin` → `server-admin` ; `desabonnerAdresse`
  (`@/lib/crm/fiche`, propre à WEB) → port de `optOutAddress` de KHI sur une table `leads` paramétrée
  (`LCAP_LEADS_TABLE`, défaut `leads`) ; `regles.ts` : **ne prendre que** les règles LCAP (étapes « Prospect »,
  relances J2/J5 et textes propres à WEB restent dehors) ; page HTML : nom d'entreprise et courriel de contact en
  paramètres (`SITE_NAME`, `CONTACT_EMAIL`), textes `[à adapter]` ; secret `UNSUBSCRIBE_SECRET` (≥ 32 caractères), repli
  `CRON_SECRET` comme KHI, documenté ; débit : politique `desabonnement` de B3. La note de WEB « lecture technique, pas
  un avis juridique » (l. 206) est gardée telle quelle. SQL : `email_opt_out_at timestamptz`, `email_opt_out_source
  text` sur `leads`, index sur `lower(email)` — fichier fourni, **jamais appliqué**.
- **Tests :** WEB `crm-regles` (partie LCAP) + `desabonnement-page` + KHI `lcap.test.mjs` portés ; **à ajouter :**
  jeton d'une autre adresse refusé, temps constant (`timingSafeEqual` sur longueurs différentes sans lever), lien
  `http://` refusé, POST RFC 8058 `List-Unsubscribe=One-Click` → 200 sans page, désabonnement appliqué à toutes les
  fiches de la même adresse (casse ignorée, `%`/`_` échappés), 31 janv. + 1 mois = 28/29 févr., secret trop court →
  aucun lien et aucun envoi commercial.
- **npm :** `next`, `@supabase/supabase-js`.
- **Agent :** `automation-dev-agent`.

### B10. Garde du secret cron
- **Source :** CSF `src/lib/cron/auth.ts` + `auth.test.ts`.
- **Cible :** `src/lib/cron/auth.ts`.
- **Généraliser :** rien de client ; garder `?token=` refusé, `Authorization: Bearer` seul, `timingSafeEqual`, secret
  absent → 503 (ou le code d'origine).
- **Tests :** repris ; **à ajouter :** secret de longueur différente sans exception ; secret avec espaces autour.
- **npm :** `next`.

### B11. Règles `check-rules` génériques remontées au modèle
Cible : `modele/scripts/check-rules.mjs` (tableau `RULES`, après `conflit-de-fusion`, bloc « Règles génériques
reprises de VieSolution »). Source : CSF `scripts/check-rules.mjs`.

| id | Reprise | Pourquoi générique | Adaptation |
|---|---|---|---|
| `consentement-precoche` | oui | Loi 25 : vaut pour tout client québécois ; motif sans nom propre | `dossiers: ["src"]`, `exclure` des routes API (`src/app/api/`) et des tests gardé |
| `stockage-direct` | oui | `localStorage` qui lève `SecurityError` : panne de n'importe quel site | chemin de l'enrobeur en commentaire « à adapter » (`src/lib/safe-storage.ts`) ; **exclure** à ajuster par projet |
| `police-google` | oui | build cassé par le téléchargement des polices : tout projet `next/font/google` | message : servir la police depuis le dépôt (`next/font/local`) |
| `temoignages-demo` | oui | faux avis affichés comme réels : contenu inventé (`regles-metier.md`) | motif `testimonials?.seed` gardé, `dossiers: ["src"]` |
| `politique-accents` | non | liste de mots et chemin propres à la politique de CSF | — |
| `chatbot-formulations` | non | vocabulaire AMF propre à l'éducation financière | citée en exemple commenté |
| `camille-au-feminin` | non | propre à une personne | — |

Chaque règle garde son champ `incident` (fait réel, préfixé « VieSolution, <date> : »), sans quoi elle ne tient pas
(`regles-metier.md`). Les exemples commentés `domaine-en-dur` et `coordonnee-inventee` restent.

## 5. Montage des tests du kit TS

`kits/crm/ts/package.json` (à côté du `package.json` du kit JS, jamais fusionné avec lui) :

```json
{
  "name": "kit-crm-ts",
  "private": true,
  "type": "module",
  "description": "Kit CRM TS (methode-travail) : briques du lot 1. Copier le contenu de ts/ à la racine d'un projet Next.js TS.",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "verify": "tsc --noEmit && vitest run" },
  "devDependencies": {
    "@supabase/supabase-js": "2.118.0",
    "@types/node": "24.10.1",
    "next": "16.4.3",
    "typescript": "5.9.3",
    "vitest": "4.1.12"
  }
}
```

Versions **exactes** (sans `^`/`~`) prises sur `VieSolution-CSF/package.json` du 30 oct. 2026 (qui a `^`/`~`) ; la
personne qui exécute relit `npm view <paquet>@<version> version` dans `$T` si l'installation échoue, et note l'écart.
`tsconfig.json` : `strict`, `noUncheckedIndexedAccess` si CSF l'a, `moduleResolution: "bundler"`, `paths: { "@/*":
["./src/*"] }`, `types: ["node", "vitest/globals"]` seulement si les tests utilisent les globaux (préférer les imports
explicites). `vitest.config.ts` : `environment: 'node'`, `resolve.alias: { '@': fileURLToPath(new URL('./src',
import.meta.url)) }` (pas de `vite-tsconfig-paths` : une dépendance de moins).

**Exécution (seule procédure permise) :**
```bash
T=$(mktemp -d) && cp -a /home/user/methode-travail/kits/crm/ts/. "$T"/ && test -d "$T/src" \
  && cd "$T" && [ "$PWD" != "/home/user/methode-travail" ] \
  && npm install --no-audit --no-fund && npm run verify
```
Un échec d'installation par le proxy : voir `/root/.ccr/README.md`, pas de contournement TLS.

## 6. Documents du kit et du modèle

- **`kits/crm/CATALOGUE.md`** : en-tête « Colonne Kit » complétée par « **Colonne TS** — `code (ts/)` : variante
  TypeScript fournie dans `kits/crm/ts/` ; `—` : pas encore » ; colonne « TS » ajoutée aux tableaux 1 (Limiteur de
  débit, Anti-robots), 4 (Envoi, LCAP), 5 (URL du site) et 8 (Tests) ; nouvelles lignes : « Adresse IP fiable »,
  « CSP », « Redirection interne », « Consentement jamais précoché », « Garde du secret cron » (famille 1 ou 6 selon
  l'existant). Les lignes déjà existantes gardent leur colonne « Kit » JS (la fiche reste « fiche » pour JS).
- **`kits/crm/README.md`** : ligne `ts/` dans « Ce qu'il contient » ; « Pile visée » : JS = `auth/ admin/ tests/`,
  TS strict = `ts/` (lot 1, lots 2-3 à venir) ; « Ordre d'installation » : branche TS (`ts/` avant toute route
  publique) ; « Vérifier le kit lui-même » : renvoi à `ts/BRIQUE.md` et à la commande de la section 5.
- **`kits/crm/ts/BRIQUE.md`** : format des `BRIQUE.md` existants — fichiers, variables d'env (`.env.exemple`), tables
  (SQL fournis, appliqués par Camille seulement), dépendances, adaptation brique par brique, vérification, pièges
  (écarts 3, 4, 7 corrigés ici ; CSF reste sur SendGrid).
- **`CHANGELOG.md`** : entrée `## 1.4.0 — <date> — Kit CRM TS, lot 1` (format de 1.3.0 : ce qui entre, **Vérifié**,
  **Pas encore vérifié** — SQL jamais joués sur base neuve, aucune brique installée dans un projet réel).
- **`VERSION`** : `1.3.0` → `1.4.0`.
- **`modele/.claude/skills/nouveau-crm/SKILL.md`** : § 0.3 — pile TS strict → `kits/crm/ts/` ; § 1 « socle » ajoute
  « site public : adresse du site, IP, anti-abus, Turnstile, CSP, consentement, envoi, désabonnement » ; § 2 ordre
  TS : `ts/` (migrations 01xx, puis `src/lib/`, puis routes) avant les briques JS équivalentes à traduire ; § 3 :
  `npm run verify` du kit TS dans un dossier temporaire et la règle E15 (mutations hors dépôt seulement).
- **`modele/scripts/check-rules.mjs`** : section 4, B11.

## 7. Phases

### Graphe

```
P0 montage + B1 B2 B6 ──┬─▶ P1 anti-abus B3 + Turnstile B4 (data-agent) ──┐
                         └─▶ P2 CSP B5 + consentement B7 + cron B10 ───────┤
                                                                           ▼
                                             P3 courriels B8 + désabonnement B9 (automation-dev-agent)
                                                                           ▼
                                             P4 documents + check-rules (§ 6, B11)
                                                                           ▼
                                             P5 qa-agent final
```
P1 ∥ P2 (fichiers disjoints ; 2 agents au plus). P3 attend P1 (politique `desabonnement`, `server-admin`) et B1.
Chaque phase P0-P3 se termine par un **qa-agent court** (Opus) : tests dans `$T`, lignes d'origine, recherche de
textes client ; P5 est le passage complet.

### P0 — Montage et briques sans dépendance
- **Objectif :** `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.exemple`, squelette `BRIQUE.md` ; B1, B2, B6.
- **Fichiers :** `kits/crm/ts/{package.json,tsconfig.json,vitest.config.ts,.env.exemple,BRIQUE.md}`,
  `src/lib/site/site-url.ts(.test.ts)`, `src/lib/api/request-ip.ts(.test.ts)`,
  `src/lib/security/{internal-redirect,trailing-backslash}.ts(.test.ts)`.
- **Agent :** agent principal (Opus) — port simple, palier petit par phase.
- **Tests :** `npm run verify` dans `$T` ; casser une règle par brique dans `$T` seulement (ex. lire `x-forwarded-for`
  d'abord) et voir le test échouer.
- **Coût :** ≈ 80 k + qa court 20 k.

### P1 — Anti-abus et Turnstile
- **Objectif :** B3, B4 (+ `server-admin.ts`, `0101_rate_limits.sql`).
- **Agent :** `data-agent` (Opus).
- **Tests :** section 4, B3 et B4 ; mutation dans `$T` : repli mémoire qui renvoie `true` → un test doit tomber.
- **Coût :** ≈ 140 k + qa court 20 k.

### P2 — CSP, consentement, cron
- **Objectif :** B5, B7, B10, `next.config.exemple.mjs`, route `csp-rapport`.
- **Agent :** agent principal (Opus), en parallèle de P1.
- **Tests :** section 4 ; mutation dans `$T` : `consentFromForm('on')` → `true` doit faire tomber un test.
- **Coût :** ≈ 70 k + qa court 20 k.

### P3 — Courriels et désabonnement
- **Objectif :** B8, B9 (+ `0102_lcap_desabonnement.sql`, route `desabonnement`).
- **Agent :** `automation-dev-agent` (Opus).
- **Tests :** section 4 ; mutation dans `$T` : comparaison de jeton par `===` → test temps constant / longueurs ;
  `addMonths` naïf → test du 31 janvier.
- **Coût :** ≈ 110 k + qa court 20 k.

### P4 — Documents et règles du modèle
- **Objectif :** section 6 en entier, B11.
- **Agent :** agent principal (Opus).
- **Tests :** `node modele/scripts/check-rules.mjs` sur le modèle (0 erreur) ; essai de chaque règle remontée dans
  `$T` (une ligne fautive par règle → bloquée, puis retirée) ; `node modele/scripts/verifier-methode.mjs` si
  applicable au dépôt.
- **Coût :** ≈ 45 k.

### P5 — Vérification finale
- **Agent :** `qa-agent` (Opus), une passe, une révision au plus. Recherches à faire (lecture seule sur le dépôt) :
  `grep -rniE "viesolution|vie solution|khi|camille|khieduc|gflkfwal|alnirija|\.ca\b|@gmail|438|514" kits/crm/ts`
  (toute occurrence hors ligne d'origine = refus) ; chaque fichier `kits/crm/ts/**/*.{ts,mjs,mts,sql}` commence par la
  ligne d'origine ; `git status` sans `node_modules`/verrou ; `npm run verify` dans `$T` ; relecture du diff des
  tests (aucun test affaibli, `agent-workflow.md`).
- **Coût :** ≈ 60 k.

**Total : 80+20 + 140+20 + 70+20 + 110+20 + 45 + 60 = 585 k.** `securite` n'est **pas** prévu dans ce lot (rien n'est
mis en ligne) ; il passera à l'installation dans le premier projet client.

## 8. Critères d'acceptation (cochables par `qa-feature`)

1. [ ] `kits/crm/ts/` existe avec l'arborescence de la section 3 (fichiers prévus présents, aucun en trop).
2. [ ] Chaque fichier de code et SQL de `kits/crm/ts/` a sa ligne d'origine (projet, chemin, commit, ce qui a été
   généralisé) ou « écrit pour le kit (raison) ».
3. [ ] Aucun texte, coordonnée, domaine, nom, identifiant Supabase ou prix d'un client (recherche de P5 vide hors
   lignes d'origine).
4. [ ] Tests du kit TS verts hors projet : `npm run verify` (tsc strict + Vitest) passe dans un dossier `mktemp -d`.
5. [ ] Chaque brique B1-B10 a au moins un fichier `*.test.ts` ; les tests de la source sont tous repris (ou leur
   abandon justifié dans `BRIQUE.md`) ; les tests « à ajouter » de la section 4 existent.
6. [ ] Chaque brique a été vue en échec une fois (règle cassée dans `$T`), noté dans le compte rendu.
7. [ ] Repli mémoire : base injoignable → le compteur limite toujours (écart 3) ; IP lue par `request-ip.ts` seul
   (écart 4) ; Turnstile avec délai 5 s et nom d'hôte contrôlable (écart 7).
8. [ ] CSP : `CSP_MODE=observation` → Report-Only, `actif` → bloquante ; jamais `unsafe-eval` sur Vercel ; origine
   Supabase exacte.
9. [ ] Consentement : seule la valeur `true` stricte vaut accord ; aucune valeur par défaut à `true`.
10. [ ] Désabonnement : GET page + POST RFC 8058, jeton HMAC à temps constant, lien `https` seulement, toutes les fiches
    de l'adresse, aucun envoi commercial sans adresse postale ni lien.
11. [ ] Envoi Resend : résultat permanent / temporaire testé, aucun appel sans clé.
12. [ ] Versions épinglées exactes dans `kits/crm/ts/package.json` ; aucun `node_modules`, `package-lock.json`, `.next`
    suivi ou présent dans le dépôt.
13. [ ] `CATALOGUE.md` a la colonne « TS » expliquée en tête ; `README.md`, `CHANGELOG.md` (1.4.0) et `VERSION`
    (1.4.0) à jour ; la skill `nouveau-crm` cite `kits/crm/ts/`.
14. [ ] `modele/scripts/check-rules.mjs` contient `consentement-precoche`, `stockage-direct`, `police-google`,
    `temoignages-demo`, chacune avec son `incident` ; `node modele/scripts/check-rules.mjs` passe.
15. [ ] Aucun fichier modifié dans CSF, KHI ou WEB (`git status` propre dans les trois).
16. [ ] Aucune mutation faite dans un dépôt (E15) : le compte rendu donne le chemin `$T` de chaque essai.
17. [ ] `qa-agent` final rendu, diff des tests relu par l'agent principal.

## 9. Migrations

`0101_rate_limits.sql` et `0102_lcap_desabonnement.sql` : **fournies dans le kit, jamais appliquées**. Elles seront
appliquées **en production par Camille seulement** (ou par Claude sur sa demande explicite), projet par projet, à
l'installation. Non jouées sur une base neuve dans ce lot : noté « Pas encore vérifié » au CHANGELOG.

## 10. Risques et retours arrière

| Risque | Parade | Retour arrière |
|---|---|---|
| Mutation dans un dépôt (E15) | procédure `$T` de la section 2, garde `$PWD` | `git checkout -- kits/` ; rien n'est commité avant P5 |
| `abuse-guard.ts` trop lié à CSF (verrou de compte, notifications) | découpe B3 ; ce qui sort va au lot 2 | garder la brique en « fiche TS » si le découpage casse les tests |
| Tests CSF qui dépendent de modules CSF absents | `vi.mock` ciblé ; abandon justifié dans `BRIQUE.md` | — |
| Installation npm bloquée (proxy, version introuvable) | `/root/.ccr/README.md` ; version voisine notée | phase en attente, Camille prévenue |
| Règle `stockage-direct` trop large pour un projet | `exclure` documenté ; `regle-ok: <id>` avec raison | retirer la règle du modèle (une ligne) |
| Dépassement de budget | coût par phase relevé ; à 600 k, arrêt et état écrit | P4 peut glisser dans une session suivante |
| Limite d'usage | arrêt net, état dans ce fichier ou `docs/ETAT-ACTUEL.md` du dépôt | aucune relance automatique |

Tout le lot est **additif** (nouveau dossier, ajouts de documentation, règles ajoutées) : retour arrière = revert du
commit unique de la PR.

## 11. Hors périmètre

Lot 2 (matrice d'accès, verrou de compte, double vérification, journal, Loi 25 côté admin, conservation, archivage,
santé, faux Supabase en Vitest) ; lot 3 (clés d'API, MCP/OAuth, moteur d'automatisations et tick — la garde cron B10
est livrée seule —, agenda, webhooks, courriels entrants) ; tout changement dans CSF, KHI, WEB (écarts de KHI :
KHIEDUC#96) ; application des migrations ; installation dans un projet client ; agent `securite`.

## 12. Questions ouvertes (non bloquantes)

1. **Versions** : épinglage exact sur CSF (vitest 4.1.12, typescript 5.9.3, @types/node 24.10.1, next 16.4.3,
   @supabase/supabase-js 2.118.0) — proposé ; le kit JS épingle `next` 16.4.2 : aligner les deux sur 16.4.3 ? (Plan :
   ne pas toucher au kit JS dans ce lot.)
2. **Agents** : `data-agent` et `automation-dev-agent` existent dans VieSolution-CSF, pas à la racine de
   `methode-travail` (le modèle a `data-agent`, pas `automation-dev-agent`). Si la session d'exécution ne les voit pas,
   l'agent principal (Opus) fait P1/P3 lui-même.
3. **CSP par défaut** sur un nouveau projet : `observation` (proposé, comme Web) ou `actif` d'emblée (comme CSF) ?
4. **Table des désabonnements** : colonnes sur `leads` (modèle KHI, proposé) ou table à part par empreinte (idée de
   Web, liée à l'effacement du lot 2) ?
5. **Consentement** : le kit fournit les règles pures et la règle mécanique ; la version du texte de consentement
   enregistrée avec la demande (KHI, non vérifiée dans son code) est laissée au lot 2.

## 13. Non fait (dans ce plan)

- Aucun fichier source n'a été lu ligne à ligne au-delà des en-têtes, exports et variables d'environnement : les
  numéros de ligne cités viennent de MEILLEURES-BRIQUES ou d'une recherche, à confirmer à l'exécution.
- Commits d'origine non relevés (à lire par `git log -1` à l'exécution).
- Chemins vérifiés après écriture (30 oct.) : CSF `src/lib/supabase/server-admin.ts` et WEB `src/app/api/csp-rapport/route.ts` existent.
- Coûts estimés, pas mesurés.
