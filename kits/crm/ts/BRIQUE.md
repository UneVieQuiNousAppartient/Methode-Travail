# Kit CRM TS — lot 1 : site public, formulaires, courriels

Variante **TypeScript strict** du kit CRM (Next.js App Router + Supabase + Vercel). Chaque brique vient de sa
meilleure source parmi trois projets en production (VieSolution-CSF, KHI Educ, Vie Solution Web), selon la
comparaison du 30 oct. 2026 (`VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md`). Chaque fichier commence par
sa ligne d'origine (projet, chemin, commit, ce qui a été généralisé). Rien de propre à un client : ce qui varie
est un paramètre ou une variable d'environnement ; les textes visibles sont des exemples marqués `[à adapter]`.

Lots suivants (pas ici) : lot 2 — admin, verrou par compte, double vérification, journal, Loi 25 côté admin,
archivage, santé, version du texte de consentement ; lot 3 — clés d'API, connecteur, automatisations, agenda,
webhooks.

## Fichiers

Le dossier reproduit l'arborescence d'un projet : `ts/src/lib/api/turnstile.ts` se copie en
`src/lib/api/turnstile.ts`. Imports en alias `@/` → `src/`.

| Brique | Fichiers | Source principale |
|---|---|---|
| B1 Adresse du site | `src/lib/site/site-url.ts` | KHI `lib/siteUrl.js` |
| B2 Adresse IP fiable | `src/lib/api/request-ip.ts` | CSF |
| B3 Anti-abus | `src/lib/api/rate-limit-core.ts`, `abuse-guard.ts`, `abuse-policies.ts`, `src/lib/supabase/server-admin.ts`, `supabase/migrations/0101_rate_limits.sql` | CSF (+ table des limites de KHI) |
| B4 Turnstile | `src/lib/api/turnstile.ts` | KHI (+ refus 503 de CSF) |
| B5 CSP | `src/lib/security/csp-policy.mjs` (+ `.d.mts`), `csp.ts`, `src/app/api/csp-rapport/route.ts`, `next.config.exemple.mjs` | CSF (+ mode observation de Web) |
| B6 Redirection interne | `src/lib/security/internal-redirect.ts`, `trailing-backslash.ts` | CSF (+ cas de KHI) |
| B7 Consentement | `src/lib/leads/consent.ts` | CSF (principe seulement) |
| B8 Envoi | `src/lib/email/envoi.ts` | Web (+ `esc` de KHI) |
| B9 Désabonnement, LCAP | `src/lib/email/desabonnement.ts`, `lcap.ts`, `src/app/api/desabonnement/route.ts`, `supabase/migrations/0102_lcap_desabonnement.sql` | Web + KHI |
| B10 Garde du secret cron | `src/lib/cron/auth.ts` | CSF |

Chaque fichier a son `*.test.ts` à côté (Vitest). `package.json`, `tsconfig.json`, `vitest.config.ts`,
`.npmrc`, `.gitignore` servent aux tests **du kit** : ne pas les copier tels quels dans un projet (y reprendre
seulement ce qui manque : alias `@/*`, `strict`).

## Variables d'environnement

Toutes dans `.env.exemple`, sans valeur. Les secrets : `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_PEPPER`,
`TURNSTILE_SECRET_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET` — serveur seulement, jamais
`NEXT_PUBLIC_`. Replis documentés :
- `RATE_LIMIT_PEPPER` absent → `CRON_SECRET`, puis `SUPABASE_SERVICE_ROLE_KEY` (la clé HMAC en est **dérivée**,
  libellé `RATE_LIMIT_KEY_LABEL`) ; aucun → clé aléatoire de l'instance. Changer de secret ou de libellé remet
  les compteurs à zéro (sans gravité).
- `UNSUBSCRIBE_SECRET` absent ou de moins de **32** caractères → `CRON_SECRET` s'il en a 32 ; sinon **aucun lien**
  de désabonnement, donc **aucun envoi commercial**. Les sources acceptaient 16 caractères : durci pour le kit.
  Changer ce secret invalide les liens déjà envoyés.

## Tables (SQL fournis, jamais appliqués par le kit)

Numérotés 01xx pour ne pas heurter `auth/supabase/migrations/0001-0004` du kit JS. **Appliqués projet par
projet, par Camille seulement** (ou par Claude sur sa demande explicite). Idempotents.
1. `0101_rate_limits.sql` — `rate_limit_hits` (empreintes HMAC seulement, RLS sans politique, `revoke all`),
   `hit_rate_limit(...)` et `purge_rate_limit_hits(...)` (`security definer`, `search_path` fixé, exécution par
   `service_role` seul). Fenêtre ≤ 1 h, blocage ≤ 24 h. Tant qu'elle manque, le compteur en mémoire limite quand
   même. Purge : appeler `purgeSharedCounters(getSupabaseAdmin())` chaque heure depuis une route cron protégée
   par `authorizeCronRequest`.
2. `0102_lcap_desabonnement.sql` — colonnes `email_opt_out_at`, `email_opt_out_source` (`lien` | `one-click` |
   `admin`) sur `public.leads` (**à adapter** si la table s'appelle autrement : renommer dans le SQL et poser
   `LCAP_LEADS_TABLE`), index sur les désabonnés et sur `lower(email)`.

## Dépendances npm

`next`, `@supabase/supabase-js` (déjà dans un projet Next + Supabase). Rien d'autre : Resend par `fetch`, pas de
SDK ; pas de zod imposé.

## Adaptation, brique par brique

- **B1** : poser `NEXT_PUBLIC_SITE_URL` dès que le domaine est branché. `getPublicSiteUrl()` renvoie `""` pour
  `http://`, `localhost` ou une adresse avec chemin : tout lien absolu (courriel, désabonnement) disparaît alors.
- **B2** : sûr derrière Vercel seulement (**condition de déploiement**, en tête du fichier). Toute lecture d'IP
  passe par `clientIp` ; jamais `x-forwarded-for` directement.
- **B3** : chaque route publique qui écrit ou coûte : `validateJsonRequest` (ou `readJsonBodyWithLimit` sans
  `content-length`), puis `enforceSharedAbuseGuard(request, POLITIQUE, { message: rateLimitMessage('fr') })`,
  puis Turnstile, puis l'écriture. Ajouter ses politiques dans `abuse-policies.ts` (portée distincte ; le test de
  table vérifie les bornes).
- **B4** : déploiement en trois temps (aucune clé → `TURNSTILE_SECRET_KEY` → `TURNSTILE_ENFORCE=1`). Le
  formulaire envoie `turnstile_token` dans le corps JSON. Après avoir collé les clés, vérifier la paire avec
  `siteverify` sur un jeton pris sur le site en ligne. `turnstileHealth` / `turnstileVerdict` pour une page de
  santé (lot 2).
- **B5** : fusionner `next.config.exemple.mjs` dans `next.config.mjs` ; lister les routes à politique propre dans
  `ROUTES_A_POLITIQUE_PROPRE`. **Passage observation → actif** : 1) déployer sans `CSP_MODE` (observation) ;
  2) lire les journaux `[csp-rapport]` pendant quelques jours de trafic réel ; 3) ajouter les origines légitimes
  à `CSP_EXTRA_ORIGINS` ; 4) quand plus rien de légitime n'est signalé, poser `CSP_MODE=actif` et redéployer
  (lu au build) ; 5) retour arrière immédiat : retirer `CSP_MODE`. Reste à faire par projet : nonces à la place
  de `'unsafe-inline'`.
- **B6** : `normalizeInternalRedirectPath(valeur, repli, { allowedPrefixes: ['/admin'] })` pour tout `next=`,
  `redirect=`, `Referer` ; `endsWithBackslash` dans le middleware (réponse 404).
- **B7** : côté serveur `consentFromForm(body.consent)` (seul `true` compte) ; côté interface `useState(false)` ;
  règles de contact avec `ConsentRules` (`splitAt`, `sources` ; sources absentes = règle partout). La version du
  texte de consentement enregistrée avec la demande : lot 2.
- **B8** : `envoyerCourriel` renvoie `{ id }` ou `{ echec: 'permanent' | 'temporaire' }` ; ne réessayer que le
  temporaire. Tout texte venu d'un visiteur passe par `esc`.
- **B9** : avant toute relance commerciale, `pretAEnvoyer(configurationLcap(process.env, getPublicSiteUrl()))`
  doit valoir `null` ; puis `relanceSkipReason(lead, { commercial: true })` ; pied `piedLcap(...)` et en-têtes
  `entetesDesabonnement(lienDesabonnement(...))`. Statuts « client » : `clientStatuses`. Page et route : nom
  `SITE_NAME`, contact `CONTACT_EMAIL`, textes `[à adapter]`. Une adresse enregistrée avec des espaces autour ne
  sera pas retrouvée par l'ILIKE : nettoyer les courriels à l'enregistrement. Le journal d'activité de chaque
  fiche désabonnée (KHI) revient avec le lot 2.
- **B10** : toute route cron commence par `const refus = authorizeCronRequest(request); if (refus) return refus;`.

## Vérification (tests du kit, hors de tout projet)

Jamais dans le dépôt, jamais de `node_modules` dans `methode-travail` :

```bash
T=$(mktemp -d) && cp -a /home/user/Methode-Travail/kits/crm/ts/. "$T"/ && test -d "$T/src" \
  && cd "$T" && [ "$PWD" != "/home/user/Methode-Travail" ] \
  && npm install --no-audit --no-fund && npm run verify
```

`.npmrc` pose `legacy-peer-deps=true` : npm 10 plante (« Cannot read properties of null (reading 'edgesOut') »)
sur les pairs facultatifs de Vitest 4 ; `react` et `react-dom` sont donc déclarés à la main (pairs de `next`).
Versions épinglées exactes, prises sur VieSolution-CSF au 30 oct. 2026.

**Essais de mutation** (« casser la règle une fois ») : uniquement dans une copie `cp -a` sous `mktemp -d`, garde
sur `$PWD`, jamais `rsync`, jamais `rm -rf` sur un chemin relatif (incident E15 de VieSolution-CSF).

## Tests de la source non repris (et pourquoi)

- CSF `rate-limit-core` : plafond de notifications (code au lot 2). `abuse-guard` : verrou par compte et code
  MFA (lot 2), empreinte « visiteur » (lot 2). `abuse-policies` : valeurs des politiques propres à CSF.
- CSF `csp.test.ts` : mesure d'audience, WebAssembly des PDF, page d'autorisation du connecteur (lot 3).
- CSF `contact-consent.test.ts` : guide offert, pastille, gabarits de courriel, date de bascule figée.
- CSF `cron/auth.test.ts` : « les routes cron du projet utilisent la garde » (routes absentes du kit).
- KHI `turnstile.test.mjs` : sections 4 (cinq routes du projet) et 6 (route d'administration du projet).
- KHI `site-url.test.mjs` : llms.txt et redirection www (propres au projet).
- KHI `lcap.test.mjs` : gabarits, réglages, moteur de relances (propres au projet).

## Pièges corrigés ici (écarts de la comparaison)

- **Écart 3** : chez KHI, une panne de base laissait tout passer ; ici le repli mémoire **limite** toujours.
- **Écart 4** : l'IP n'est lue que par `request-ip.ts` (`x-vercel-forwarded-for` d'abord).
- **Écart 7** : Turnstile avec délai de 5 s et contrôle facultatif du nom d'hôte.
- VieSolution-CSF reste sur SendGrid : le kit envoie par Resend (Web, KHI).
