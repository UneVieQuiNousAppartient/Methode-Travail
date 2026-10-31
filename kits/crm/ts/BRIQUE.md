# Kit CRM TS — lots 1 et 2 : site public, formulaires, courriels ; socle de l'admin d'équipe ; poste d'appel

Variante **TypeScript strict** du kit CRM (Next.js App Router + Supabase + Vercel). Chaque brique vient de sa
meilleure source parmi trois projets clients en production, selon une comparaison du 30 oct. 2026. Chaque
fichier commence par sa ligne d'origine (projet source, chemin, commit, ce qui a été généralisé) : c'est là,
et seulement là, que la provenance est notée. Rien de propre à un client : ce qui varie est un paramètre ou une
variable d'environnement ; les textes visibles sont des exemples marqués `[à adapter]`.

- **Lot 1** (depuis 1.4.0) : site public, formulaires, courriels (B1-B10).
- **Lot 2** (depuis 1.5.0) : socle de l'admin d'équipe — rôles et refus par défaut, entrée de l'équipe, double
  vérification, appareils de confiance, codes de secours, verrou de compte, journaux, Loi 25 (accès,
  effacement, conservation), archivage, santé (L0-L12). **Pas d'écran** : les pages et routes sont à écrire
  par le projet (règles plus bas).
- **Poste d'appel** (depuis 1.6.0) : file d'appels du jour, 5 résultats d'appel appliqués en une transaction,
  bilan du jour, emplacements de scripts vides, brouillon de courriel après l'appel (modèle injecté). **Pas
  d'écran ni de route** : règles plus bas (section « Poste d'appel »).
- Lot 3 (à venir) : clés d'API, connecteur, automatisations, agenda, webhooks ; puis un lot d'écrans.

## Fichiers

Le dossier reproduit l'arborescence d'un projet : `ts/src/lib/api/turnstile.ts` se copie en
`src/lib/api/turnstile.ts`. Imports en alias `@/` → `src/`. Source de chaque fichier : sa première ligne.

### Lot 1 — site public

| Brique | Fichiers |
|---|---|
| B1 Adresse du site | `src/lib/site/site-url.ts` |
| B2 Adresse IP fiable | `src/lib/api/request-ip.ts` |
| B3 Anti-abus | `src/lib/api/rate-limit-core.ts`, `abuse-guard.ts`, `abuse-policies.ts`, `src/lib/supabase/server-admin.ts`, `supabase/migrations/0101_rate_limits.sql` |
| B4 Turnstile | `src/lib/api/turnstile.ts` |
| B5 CSP | `src/lib/security/csp-policy.mjs` (+ `.d.mts`), `csp.ts`, `src/app/api/csp-rapport/route.ts`, `next.config.exemple.mjs` |
| B6 Redirection interne | `src/lib/security/internal-redirect.ts`, `trailing-backslash.ts` |
| B7 Consentement | `src/lib/leads/consent.ts` |
| B8 Envoi | `src/lib/email/envoi.ts` |
| B9 Désabonnement, LCAP | `src/lib/email/desabonnement.ts`, `lcap.ts`, `src/app/api/desabonnement/route.ts`, `supabase/migrations/0102_lcap_desabonnement.sql` |
| B10 Garde du secret cron | `src/lib/cron/auth.ts` |

### Lot 2 — socle de l'admin d'équipe

| Brique | Fichiers (`src/lib/…` sauf mention) | Ce qu'elle fait |
|---|---|---|
| L0 Faux Supabase | `src/test-support/fake-supabase.ts` | base en mémoire pour Vitest (filtres réellement appliqués, `!inner`, RPC, Auth MFA simulée) ; jamais importé par le code |
| L1 Rôles et matrice | `auth/types.ts`, `authz/roles.ts`, `authz/access-matrix.ts` | `createRoles`, `hasRole` ; `defineAccessMatrix({ roles, rules })` : chemin normalisé, identifiants UUID, **refus par défaut** |
| L2 Mot de passe partagé | `admin/token-mode.ts` | `isTokenModeAllowed` : refusé en ligne, permis en local seulement (`ADMIN_TOKEN_MODE_LOCAL`) |
| L3 Entrée de l'équipe | `auth/team-session.ts` | `getTeamMember` : session Supabase → liste blanche → rôle → état MFA ; `deny` (401/403) |
| L4 Double vérification | `auth/mfa.ts`, `mfa-supabase.ts`, `mfa-route.ts` | TOTP de Supabase : `mfaState`, `enrollTotp`, `challengeAndVerify`, `getMfaSession`, `mfaRefusal` |
| L5 Appareils de confiance | `auth/mfa-trust.ts` | 30 jours, témoin `httpOnly`, empreinte SHA-256 seule en base, facteur vérifié exigé |
| L6 Codes de secours | `auth/mfa-backup-codes.ts` | 10 codes à usage unique, empreinte HMAC (`MFA_BACKUP_SECRET`), un code accepté ouvre une session d'une heure qui oblige à réinscrire un facteur |
| L7 Verrou de compte | `api/account-lock.ts` (+ `mfaAccountLock`, `recordMfaCodeFailure`, `recordBackupCodeAttempt` dans `auth/mfa-route.ts`) | par compte, pas par IP : mot de passe et code MFA |
| L8 Journal des actions | `audit/admin-audit.ts`, `audit/audit-detail.ts` | `audit(...)` : catalogue fermé d'actions, `meta` sans secret ni courriel ; détail lisible |
| L9 Journal d'accès Loi 25 | `audit/subject-access.ts` | qui a ouvert quelle fiche (`recordSubjectAccess`), chemin masqué, purge |
| L10 Accès, effacement, conservation | `privacy/privacy.ts`, `effacement.ts`, `conservation.ts` | `accessPerson`, `erasePerson` (empreinte **d'abord**, tables paramétrées, adresses de l'équipe exclues), purge après `RETENTION_MONTHS` |
| L11 Archivage | `archivage/archivage.ts` (+ `exemple-liste.ts`) | archivé = masqué, jamais effacé ; `sansArchives`, `doitDesarchiver` |
| L12 Santé + battement | `health/heartbeat.ts`, `health/verdict.ts` | battement du tick (`enregistrerBattement`), verdicts purs (tick, variables, secret cron, mode jeton, MFA, base) |

### Poste d'appel (depuis 1.6.0)

| Brique | Fichiers (`src/lib/appels/…` sauf mention) | Ce qu'elle fait |
|---|---|---|
| A1 Règles | `regles.ts` | `ConfigAppels` (étapes, étapes protégées, plan par résultat, fuseau, jours ouvrables et fériés, heure du suivi ; exemple `CONFIG_APPELS_EXEMPLE` `[à adapter]`, `verifierConfigAppels`) ; `planResultat` (aperçu = ce qui sera écrit ; une étape protégée **ne recule jamais**) ; `prochainJourOuvrable`, `classerFile`, `bilanDuJour`, `detailsAppel`, `exigeConversation` ; scripts : `scriptsVides`, `afficherScript`, `remplirScript` |
| A2 Serveur | `server.ts` | `lireFile`, `lireBilan`, `apercuAppel` (rien n'est écrit), `confirmerAppel` (RPC), `lireSaisieAppel` ; contrôle d'accès **injecté** (`AccesAppels` : périmètre + auteur) |
| A3 Courriel après l'appel | `courriel.ts` | `construireInviteSysteme`, `buildAppelEmailPrompt` (coordonnées masquées, bloc non fiable), `refusCourrielAppel`, `accordDejaNote`, `lireBrouillon`, `pointsAVerifier`, `redigerCourrielAppel` (modèle **injecté**) ; plafond `APPEL_EMAIL_DAILY_RULE` pour le compteur de B3 |
| A4 Transaction | `supabase/migrations/0112_call_result.sql` | `record_call_result` : lead verrouillé, périmètre revérifié, tâche terminée, activité, contact, étape (garde), suivi, `follow_up_at` |

Tests : `regles.test.ts`, `server.test.ts` (faux Supabase L0), `courriel.test.ts`, `parite-sql.test.ts` (listes du
SQL = configuration d'exemple : changer l'une sans l'autre fait échouer ce test).

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

Lot 2 (même fichier, section « Lot 2 ») :
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client Supabase au nom du membre (double vérification). Les tables de l'admin
  n'accordent rien à `anon`.
- `ADMIN_MFA_REQUIRED=1` — code exigé pour toute l'équipe. Vide : exigé pour les membres inscrits (ou qui ont des
  codes de secours) et pour les rôles de `MFA_ALWAYS_ROLES`.
- `MFA_ISSUER` (nom dans l'application d'authentification, repli `SITE_NAME`), `MFA_TRUST_COOKIE` (nom du
  témoin « appareil de confiance », repli `mfa_device`).
- `MFA_BACKUP_SECRET` — clé des empreintes des codes de secours, 32 caractères ou plus, **aucun repli** : vide =
  aucun code généré ni accepté. La changer rend les codes remis inutilisables.
- `PRIVACY_HASH_SECRET` — empreinte des courriels effacés, **sans repli** (vide = effacement refusé).
- `RETENTION_MONTHS` — **obligatoire** pour la purge de conservation (aucune valeur par défaut, plafond dans le code).
- `ADMIN_TOKEN_MODE_LOCAL=1` — mot de passe partagé permis **en local seulement** ; toujours refusé en ligne.

## Tables (SQL fournis, jamais appliqués par le kit)

Numérotés 01xx pour ne pas heurter `auth/supabase/migrations/0001-0004` du kit JS. **Appliqués projet par
projet, par la personne qui valide seulement** (ou par Claude sur sa demande explicite). Idempotents.
1. `0101_rate_limits.sql` — `rate_limit_hits` (empreintes HMAC seulement, RLS sans politique, `revoke all`),
   `hit_rate_limit(...)` et `purge_rate_limit_hits(...)` (`security definer`, `search_path` fixé, exécution par
   `service_role` seul). Fenêtre ≤ 1 h, blocage ≤ 24 h. Tant qu'elle manque, le compteur en mémoire limite quand
   même. Purge : appeler `purgeSharedCounters(getSupabaseAdmin())` chaque heure depuis une route cron protégée
   par `authorizeCronRequest`.
2. `0102_lcap_desabonnement.sql` — colonnes `email_opt_out_at`, `email_opt_out_source` (`lien` | `one-click` |
   `admin`) sur `public.leads` (**à adapter** si la table s'appelle autrement : renommer dans le SQL et poser
   `LCAP_LEADS_TABLE`), index sur les désabonnés et sur `lower(email)`.

Lot 2, **ordre obligatoire 0101 → 0111** (0103 à 0111 après les deux du lot 1) :
3. `0103_equipe_acces.sql` — `team_allowlist` (adresse, rôle `check` = `ROLES`, `user_id`), RLS sans politique,
   `revoke all`.
4. `0104_mfa_aal2_restrictive.sql` — politique **restrictive** « aal2 » (exemple sur une table lue par le
   navigateur ; à reproduire sur chacune).
5. `0105_mfa_trusted_devices.sql` — `mfa_trusted_devices`, `mfa_trusted_sessions`, `mfa_session_ok()` ; fait
   `alter policy` sur celle de 0104. **0104 avant 0105** : rejouer 0104 après 0105 remet « aal2 seulement ».
6. `0106_admin_audit_log.sql` — `admin_audit_log` + index.
7. `0107_subject_access_log.sql` — `subject_access_log` (journal d'accès Loi 25).
8. `0108_privacy_requests.sql` — `privacy_requests` (empreinte du courriel seulement).
9. `0109_mfa_backup_codes.sql` — `mfa_backup_codes` (empreintes), `consume_mfa_backup_code` (consommation
   atomique), `replace_mfa_backup_codes`.
10. `0110_archivage.sql` — `archived_at` sur `leads` (**à adapter**) + index partiel.
11. `0111_cron_heartbeats.sql` — `cron_heartbeats`, RLS sans politique.

Poste d'appel (depuis 1.6.0), **après 0110** (lit `archived_at`) :
12. `0112_call_result.sql` — fonction `record_call_result` (`security definer`, `search_path` fixé, `service_role`
    seulement). Dépend des tables du projet `leads`, `tasks`, `activities` (**à adapter** : noms, colonnes, listes
    d'étapes, d'étapes protégées et de raisons de perte, alignées sur `ConfigAppels`). Avant le code qui l'appelle
    (sinon la confirmation répond 503, sans rien écrire).

**Préalable Supabase (tableau de bord, avant d'ouvrir l'admin)** : Authentication › inscriptions publiques
**désactivées** et « Confirm email » **activé**. Sinon une adresse de la liste blanche encore sans compte peut être
prise par n'importe qui qui s'inscrit avec elle. Régler aussi Authentication › **Rate Limits** (connexions,
vérifications de jetons et de codes MFA) : Supabase Auth est joignable en direct avec la clé publique, donc le verrou
du kit ne voit que les essais qui passent par les routes du projet (voir L7).

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
  santé (`health/verdict.ts`, lot 2).
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
  texte de consentement enregistrée avec la demande : à venir (pas dans le lot 2).
- **B8** : `envoyerCourriel` renvoie `{ id }` ou `{ echec: 'permanent' | 'temporaire' }` ; ne réessayer que le
  temporaire. Tout texte venu d'un visiteur passe par `esc`.
- **B9** : avant toute relance commerciale, `pretAEnvoyer(configurationLcap(process.env, getPublicSiteUrl()))`
  doit valoir `null` ; puis `relanceSkipReason(lead, { commercial: true })` ; pied `piedLcap(...)` et en-têtes
  `entetesDesabonnement(lienDesabonnement(...))`. Statuts « client » : `clientStatuses`. Page et route : nom
  `SITE_NAME`, contact `CONTACT_EMAIL`, textes `[à adapter]`. Une adresse enregistrée avec des espaces autour ne
  sera pas retrouvée par l'ILIKE : nettoyer les courriels à l'enregistrement. Journal de chaque fiche désabonnée : `audit(...)` du lot 2.
- **B10** : toute route cron commence par `const refus = authorizeCronRequest(request); if (refus) return refus;`.

### Lot 2

**Rôles par défaut** : `admin` > `gestionnaire` > `employe` (ordre = rang), paramétrables : `createRoles([...])` et
`defineAccessMatrix({ roles, rules })` — un projet à deux rôles passe `['employe', 'admin']` sans toucher au moteur.
**Refus par défaut** : un chemin sans règle exige le rang le plus haut ; une méthode non listée est refusée aux rangs
inférieurs. `exampleRules` / `DEFAULT_ACCESS_MATRIX` sont des exemples `[à adapter]` : réécrire la matrice pour les
routes du projet. La matrice est la première ligne de défense ; le cloisonnement des données (« un employé ne voit
que ses fiches ») reste dans chaque route (propre au métier, non fourni).

- **L0** : n'importer qu'en test. **L1** : une règle par route admin ; `minRole` passé à `getTeamMember`
  **s'ajoute** à la matrice, il ne la remplace pas. **L2** : `ADMIN_TOKEN_MODE_LOCAL` jamais posé sur Vercel.
- **L3** : toute route admin commence par `getTeamMember(request, …)` ; refus → `deny(...)`.
- **L4-L5** : `MFA_ALWAYS_ROLES` à fixer (ex. `admin`) ; 0104 reproduite sur chaque table lue par le navigateur.
- **L6** : poser `MFA_BACKUP_SECRET` avant de proposer les codes ; montrer les 10 codes une seule fois.
- **L7** : brancher le verrou sur la connexion par mot de passe (`attemptAccountLogin`) et sur chaque saisie de
  code : route du code à 6 chiffres = `getMfaSession` (double vérification non exigée), `mfaAccountLock` **avant**
  `challengeAndVerify`, `recordMfaCodeFailure` sur un code faux ; garder aussi le compteur par IP du lot 1.
  Limites connues :
  - **seuls les codes de secours sont vraiment verrouillés par le kit** (fonction SQL réservée au serveur). Le
    mot de passe et le code à 6 chiffres peuvent être essayés directement auprès de Supabase Auth : les Rate
    Limits de Supabase (préalable ci-dessus) sont la seule borne de ce chemin ;
  - le verrou lit l'état, vérifie, puis compte : il borne les essais successifs, pas une rafale envoyée en
    parallèle (N requêtes simultanées = N essais avant que le verrou tombe) ;
  - base en panne : lecture « compte libre » sauf verrou connu de l'instance ; les échecs se comptent en
    mémoire, par instance (même règle que l'anti-abus du lot 1) ;
  - qui connaît un courriel peut bloquer ce compte (1 h pour la connexion, 15 min pour les codes) : revers
    accepté d'un verrou par compte.
- **L11** : la garde de l'archivage juge par fonction de premier niveau ; elle ne voit ni un nom de table passé
  par une constante, ni un appel coupé sur plusieurs lignes, et un seul filtre fait passer deux lectures d'une
  même fonction. L'archivage masque, il n'autorise rien : relire les listes à la main en plus de la garde.
- **L8** : ajouter ses actions au catalogue `AUDIT_ACTIONS` (un test échoue sinon).
- **L9** : `recordSubjectAccess` à chaque ouverture de fiche ; purge périodique depuis une route cron.
- **L10** : lister ses tables dans `ERASABLE_SOURCES` ; `MANUAL_ERASURE_STEPS` = ce qui s'efface à la main
  (sauvegardes, outils tiers) ; `mayContact` avant tout envoi à une adresse effacée.
- **L11** : `sansArchives` sur toute liste ; colonne et table de 0110 à adapter.
- **L12** : `enregistrerBattement` à la fin du tick ; `VARIABLES_ATTENDUES` à compléter.

**Règles pour les routes que le projet écrira** (aucune n'est fournie) :
- **(a) Page « code de secours »** : membre obtenu par `getMfaSession` ; compteur par IP du lot 1 ;
  `mfaAccountLock` **avant** tout ; puis `redeemBackupCode` avec
  `member.userId`, `member.sessionId` et l'`accessToken` venant du **même** appel à `getTeamMember` ; puis
  `recordBackupCodeAttempt`. **Ne pas mettre en ligne cette page sans le verrou.**
- **(b) Régénérer ou effacer les codes** : seulement si `backupCodesManageAllowed(member.mfa)`.
- **(c) Inscrire un facteur** : seulement si `enrollmentAllowedFor(member.mfa)`.
- **(d) Changer l'adresse d'un membre** dans `team_allowlist` : remettre `user_id` à `null` dans la même mise à
  jour, sinon le nouveau titulaire est refusé.
- **(e) Route de santé** : réservée au rang `admin`.

### Poste d'appel

**À adapter** : copier `CONFIG_APPELS_EXEMPLE` dans le projet et le remplacer (étapes réelles, étapes protégées,
étape « perdu » et raison, passage automatique quand la personne est jointe (`avanceeQuandJoint`, ex. nouveau →
contacté), fuseau, jours ouvrables, jours fériés, heure du suivi, libellés), passer la configuration
par `verifierConfigAppels` au chargement, puis reporter les mêmes listes dans `0112_call_result.sql` (et dans
`parite-sql.test.ts` si le projet garde ce test, conseillé). Les libellés des résultats servent de titre d'activité
et au bilan : ne pas les changer une fois en service. Contrôle d'accès : écrire `AccesAppels` du projet (avec le
lot 2 : `{ tout: true }` pour les rangs qui voient toute l'équipe, `{ responsable: member.userId }` sinon ;
`leads.owner_id` doit contenir le même identifiant).

**Scripts** : le kit n'en fournit **aucun**. Un emplacement par étape d'appel (`ETAPES_SCRIPT` : ouverture,
découverte, objections, conclusion, message vocal, courriel de suivi, `[à adapter]`) affiche « Script à recevoir »
tant que le client n'a pas donné son texte, puis « en attente de relecture » tant que `relu` n'est pas rempli.
Les textes sont ceux du client, recopiés mot pour mot ; jamais rédigés par un agent.

**Règles pour les routes que le projet écrira** (aucune n'est fournie, aucun écran) :
- **(f) File et bilan** (`GET`) : `getTeamMember` (L3) d'abord, puis `lireFile` et `lireBilan` avec l'`AccesAppels`
  du projet ; la matrice (L1) donne l'accès à l'onglet, le périmètre donne les fiches.
- Lead archivé (0110) : la file l'exclut ; l'aperçu, la confirmation et la fonction SQL répondent « introuvable ».
- **(g) Résultat d'un appel** (`POST`) : `getTeamMember`, `validateJsonRequest` (B3, 16 Ko), `lireSaisieAppel`
  (identifiants dans le **corps**, jamais dans l'adresse) ; sans `confirm` → `apercuAppel` (rien n'est écrit) ; avec
  `confirm: true` → `confirmerAppel`. `RefusAppel` → `{ error: message }` avec son `status` ; toute autre erreur →
  message générique, détail technique au journal seulement (jamais de donnée de prospect).
- **(h) Courriel après l'appel** (`POST { leadId, resultat, notes, accordVerbal }`) : dans cet ordre, `exigeConversation`
  et `accordVerbal === true` **avant** toute lecture en base et tout appel au modèle ; fiche dans le périmètre ;
  `refusCourrielAppel` avec `adresseEffacee = !mayContact(...)` (L10) ; accord noté à la fiche (`accordDejaNote`,
  sinon une activité `note` `ACCORD_APPEL_TITRE`) — **sans preuve de l'accord, pas de brouillon** ; plafonds :
  quota par membre, puis `hitSharedCounter(hashRateLimitKey(APPEL_EMAIL_COUNTER_SOURCE), APPEL_EMAIL_DAILY_RULE)` ;
  puis `redigerCourrielAppel` avec le client IA du projet ; la route **renvoie un brouillon, n'envoie rien**.
  L'envoi passe ensuite par le chemin habituel (B8 + pied, en-têtes et contrôles LCAP de B9), après relecture.

**Conformité** :
- **Scripts relus par un humain avant usage** (le responsable de la conformité du client, s'il y en a un) : c'est
  ce que `relu` atteste ; un script non relu ne s'affiche pas.
- **Aucune promesse** dans un script ni dans un courriel (ni garantie, ni rendement, ni prix non dit) ; les règles
  propres au métier (vocabulaire interdit, sujets réglementés) s'ajoutent par `reglesSupplementaires`, et les
  mentions réglementaires obligatoires vont dans le **pied** du courriel, ajouté à l'envoi, jamais rédigées par le
  modèle (`[à adapter]` selon le métier du client).
- **Consentement de vive voix noté** : la case « La personne accepte de recevoir un courriel » est cochée par la
  personne qui appelle, et l'accord est écrit sur la fiche (date, auteur). Jamais après « message laissé » ou « pas
  de réponse » (personne n'a parlé). L'accord de vive voix ne lève jamais un désabonnement.
- Le brouillon est relu par la personne qui appelle ; une revue de conformité automatique, si le projet en a une,
  s'ajoute à cette relecture sans la remplacer.

## Vérification (tests du kit, hors de tout projet)

Jamais dans le dépôt, jamais de `node_modules` dans `methode-travail` :

```bash
T=$(mktemp -d) && cp -a /home/user/Methode-Travail/kits/crm/ts/. "$T"/ && test -d "$T/src" \
  && cd "$T" && [ "$PWD" != "/home/user/Methode-Travail" ] \
  && npm install --no-audit --no-fund && npm run verify
```

`.npmrc` pose `legacy-peer-deps=true` : npm 10 plante (« Cannot read properties of null (reading 'edgesOut') »)
sur les pairs facultatifs de Vitest 4 ; `react` et `react-dom` sont donc déclarés à la main (pairs de `next`).
Versions épinglées exactes, prises sur le projet source au 30 oct. 2026.

**Essais de mutation** (« casser la règle une fois ») : uniquement dans une copie `cp -a` sous `mktemp -d`, garde
sur `$PWD`, jamais `rsync`, jamais `rm -rf` sur un chemin relatif (incident E15).

## Tests de la source non repris (et pourquoi)

- `rate-limit-core` : plafond de notifications (code au lot 2). `abuse-guard` : verrou par compte et code
  MFA (lot 2), empreinte « visiteur » (lot 2). `abuse-policies` : valeurs des politiques propres au projet source.
- `csp.test.ts` : mesure d'audience, WebAssembly des PDF, page d'autorisation du connecteur (lot 3).
- `contact-consent.test.ts` : guide offert, pastille, gabarits de courriel, date de bascule figée.
- `cron/auth.test.ts` : « les routes cron du projet utilisent la garde » (routes absentes du kit).
- `turnstile.test.mjs` : sections 4 (cinq routes du projet) et 6 (route d'administration du projet).
- `site-url.test.mjs` : llms.txt et redirection www (propres au projet).
- `lcap.test.mjs` : gabarits, réglages, moteur de relances (propres au projet).

Lot 2 :
- Tableau figé des droits d'un projet source (matrice propre à ce projet) : remplacé par `EXAMPLE_PERMISSION_CHECKS`.
- Statut MFA de toute l'équipe et tests d'écrans MFA : relèvent du lot écrans.
- Cloisonnement des données par membre : propre au métier, non fourni.
- Tests de routes du projet source (pages admin, routes de santé, d'effacement, d'archivage) : les routes ne
  sont pas dans le kit ; les règles pures qu'elles appelaient sont testées ici.
- L0 et L6 : la source n'avait pas de tests en propre ; ils sont écrits pour le kit (conception neuve pour L6).

Poste d'appel :
- Tests de routes de la source (file, résultat, courriel) : les routes ne sont pas dans le kit ; `server.test.ts`
  et `parite-sql.test.ts` sont écrits pour le kit.
- Tests du client IA, de l'analyse de sortie et du masquage propres au projet source : remplacés par des tests du
  modèle injecté, de `lireBrouillon` et de `preparerPourModele`.

## Pièges corrigés ici (écarts de la comparaison)

- **Écart 3** : dans un projet source, une panne de base laissait tout passer ; ici le repli mémoire **limite** toujours.
- **Écart 4** : l'IP n'est lue que par `request-ip.ts` (`x-vercel-forwarded-for` d'abord).
- **Écart 7** : Turnstile avec délai de 5 s et contrôle facultatif du nom d'hôte.
- Envoi par Resend (un projet source envoyait par un autre service).

Lot 2 — pièges à connaître :
- `aal` et `session_id` se lisent **après** `supabase.auth.getUser(token)` (jeton vérifié), jamais avant.
- **0104 avant 0105** (voir Tables).
- Les routes en `service_role` **contournent la RLS** : la matrice et `getTeamMember` sont alors la seule barrière.
- Effacement : **empreinte d'abord**, puis suppression ; sinon une personne effacée peut être recontactée.
- `minRole` s'ajoute à la matrice (le plus strict des deux l'emporte).

Écarts connus avec la source (assumés) :
- Verrou : c'est le **10e** échec de mot de passe dans l'heure et le **5e** code faux en 15 min qui bloquent
  (`limit: 9` et `limit: 4`, comme la source ; le plan disait 9 et 4 par erreur).
- Tick **jamais passé** = « panne » (la source disait « attention ») : un tick absent ne doit pas passer inaperçu.

## Fiche — admin d'un seul propriétaire avec code d'accès (pas de code fourni)

Variante vue dans un projet source : une seule personne, pas de Supabase Auth, un code d'accès + TOTP maison.
- **Quand l'utiliser** : une seule personne entre dans l'admin, et on ne veut pas de comptes Supabase.
- **Limites** : aucune identité dans le journal (tout est « le propriétaire ») ; une session ne se révoque qu'en
  changeant le secret de signature ; tant que la double vérification n'est pas activée, le code seul permet de
  l'activer (l'activer dès la mise en ligne). Dès qu'une deuxième personne entre : passer au socle du lot 2.
- **À garder** : secret TOTP chiffré (AES-256-GCM) en base ; anti-rejeu du pas de 30 s ; essais limités (8 par IP,
  et 20 échecs du deuxième facteur au total par 15 min) ; cookie `httpOnly` signé par un secret distinct du code ;
  codes de secours stockés en empreinte seulement.
