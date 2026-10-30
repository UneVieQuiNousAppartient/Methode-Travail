# IMPLEMENTATION-PLAN — Kit TypeScript, lot 2 (admin : accès, double vérification, journaux, Loi 25, archivage, santé)

**Date :** 2026-10-30 · **Auteur :** tech-lead (Opus) · **Entrée :** `projets/kit-ts/BRIEF-LOT2.md` (plan d'abord, puis
décision de Camille) · **Sélection :** `VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md` (table, écarts 2 et 5,
« Lot 2 ») · **Forme et règles :** reprises de `IMPLEMENTATION-PLAN.md` (lot 1, kit 1.4.0).

## 1. Résumé

1. Ajouter à `kits/crm/ts/` les briques d'un **admin d'équipe** : rôles hiérarchiques + matrice « refus par défaut »,
   refus du mot de passe partagé en ligne, verrou de compte, double vérification (TOTP de Supabase) + appareils de
   confiance 30 jours + codes de secours, journal des actions, journal d'accès Loi 25, accès / effacement avec
   empreinte, conservation limitée, archivage, santé + battement du tick, faux Supabase pour Vitest.
2. Chaque brique copiée de sa meilleure source, avec ses tests repris, les tests manquants ajoutés et sa ligne d'origine.
3. Neuf migrations SQL **fournies, jamais appliquées** (0103 à 0111, à la suite des 0101-0102 du lot 1).
4. Mises à jour : `kits/crm/ts/BRIQUE.md`, `CATALOGUE.md` (colonne TS), `README.md`, `CHANGELOG.md`, `VERSION` 1.5.0,
   skill `nouveau-crm`, fiche « admin d'un seul propriétaire » (en fiche seulement).
5. `securite` (Opus) obligatoire avant de déclarer le lot prêt. Aucun changement dans les trois projets d'origine.

**Coût total estimé : ≈ 1,2 M jetons (fourchette 1,0 – 1,35 M) — palier GROS (> 1 M) : accord de Camille requis
avant de lancer quoi que ce soit.** Estimation corrigée du dépassement du lot 1 (780 k réels pour 585 k estimés,
× 1,33) : les chiffres par phase ci-dessous l'incluent déjà. **Proposition** pour rester sous 1 M par session :
découper en **lot 2a ≈ 710 k** (P0-P2 + QA-A + `securite` sur le cœur d'accès) et **lot 2b ≈ 520 k** (P3-P6), chacun
palier moyen, livrés en deux PR (section 7, « Découpage »).

## 2. Règles d'exécution (valent pour toutes les phases — reprises du lot 1, durcies)

- **Interdiction absolue : aucune mutation de code dans un dépôt** (incident **E15** de VieSolution-CSF, 29 et 30 oct.
  2026 : `rsync` absent, chaîne `cd <copie> && …` arrêtée avant le `cd`, puis `rm -rf src` joué **dans le dépôt**).
  Tout essai « casser la règle une fois » (skill `tester-dabord`) se fait **uniquement** dans une copie :
  ```bash
  T=$(mktemp -d) && cp -a /home/user/methode-travail/kits/crm/ts/. "$T"/ && test -d "$T/src" \
    && cd "$T" && [ "$PWD" != "/home/user/methode-travail" ] || exit 1
  ```
  **Jamais `rsync`**, jamais `rm -rf` sur un chemin relatif, chemins absolus partout. Les trois dépôts sources
  (`/home/user/VieSolution-CSF`, `/home/user/khieduc`, `/home/user/viesolution---web`) sont en **lecture seule**.
  Attention : `kits/crm/ts/BRIQUE.md` (lot 1) écrit `/home/user/Methode-Travail` (majuscules) dans la commande de
  vérification ; le chemin réel de cette session est `/home/user/methode-travail` — à corriger en P5 (sinon `cp -a`
  échoue, et la garde `$PWD` compare un mauvais chemin).
- **Jamais de `node_modules`, `package-lock.json` ni `.next/` dans `methode-travail`** : `npm install` seulement dans
  `$T`. Fin de chaque phase : `git -C /home/user/methode-travail status --porcelain` ne montre que des fichiers prévus.
- **Versions épinglées exactes** : celles de `kits/crm/ts/package.json` (lot 1 : `@supabase/supabase-js` 2.118.0,
  `@types/node` 24.10.1, `next` 16.4.3, `react`/`react-dom` 19.3.1, `typescript` 5.9.3, `vitest` 4.1.12). **Aucune
  dépendance ajoutée** par ce lot (TOTP : Supabase ; codes de secours et empreintes : `node:crypto` / Web Crypto ; QR :
  `qrDataUrl` de CSF — vérifier qu'il n'ajoute aucune dépendance, sinon le QR reste à l'écran du projet). `.npmrc`
  (`legacy-peer-deps=true`) inchangé.
- **Aucune migration appliquée** — ni sur un projet client, ni sur une base de test distante. Pas de connecteur
  Supabase dans ce lot.
- **Aucun nom de projet client dans le modèle** (décision de Camille du 30 oct. : « projet client ») : ni « VieSolution »,
  « KHI », « Vie Solution Web », « CSF », « Camille », ni domaine, courriel, téléphone, identifiant Supabase, prix,
  date de décision d'un client, ni préfixe de table d'un client (`vsw_`). **Seule exception : la ligne d'origine** en
  tête de fichier :
  `// Kit CRM TS (methode-travail) — origine : <Projet>, <chemin>, commit <sha court> (<date>) ; généralisé : <quoi>.`
  (sha : `git -C <dépôt source> log -1 --format=%h -- <chemin>`) ; `-- …` pour le SQL ; « écrit pour le kit (raison) »
  quand rien n'est copié. Les commentaires d'historique (« lot 3A », « #350 », « 22 oct. ») sont remplacés par la
  règle seule.
- Une boucle : un passage de vérification, une révision au plus. Ce qui reste va dans « Non fait ».
- Délégation : « plan approuvé par Camille, tu exécutes, tu ne dispatches personne » ; chemins de départ = ce document
  (section de la phase) + fichiers sources listés ; « écris les fichiers vers le tour 15, puis vérifie » ;
  `maxTurns` ≥ 35 ; `model: opus` à chaque appel.

## 3. Rôles par défaut du kit — recommandation (Camille tranche)

| Option | Rôles | Pour | Contre |
|---|---|---|---|
| A. Deux rôles (modèle CSF) | `owner` / `advisor` | simple ; liste blanche par rôle déjà écrite | pas de rang intermédiaire : « peut lancer un envoi groupé mais pas gérer l'équipe » impossible sans réécrire la matrice ; noms anglais, liés au métier « conseiller » |
| **B. Trois rangs (modèle KHI) — recommandé** | `admin` > `gestionnaire` > `employe` | **déjà ceux du kit JS** (`auth/lib/roles.js`, `check` de `0001_equipe_acces.sql`, écrans `admin/`) : un projet passe de JS à TS sans migrer ses rôles ; la hiérarchie couvre A (n'utiliser que `admin` et `employe`) ; la règle « tout envoi en masse ≥ gestionnaire » est un vrai besoin récurrent ; libellés français | un rang de plus à expliquer ; KHI n'a pas la normalisation de chemin de CSF (corrigée ici) |
| C. Rôles libres | liste fournie par le projet | souple | aucun défaut testable ; chaque projet réinvente |

**Recommandation : B, paramétrable.** Le kit exporte `ROLES = ['employe', 'gestionnaire', 'admin'] as const` (ordre =
rang) et `ROLE_LABELS` (exemples `[à adapter]`) ; la matrice est construite par `defineAccessMatrix({ roles, rules })`,
donc un projet à deux rôles passe `['employe', 'admin']` (ou ses propres noms) sans toucher au moteur. Principe fusionné :
- **refus par défaut (CSF + KHI corrigé du 30 oct.)** : un chemin qui ne correspond à aucune règle exige le **rang le
  plus haut** ; une méthode non listée pour une règle est refusée aux rangs inférieurs ;
- **chemin normalisé avant toute comparaison (CSF)** : `..`, `%`, `//`, barre oblique inverse, barre finale → refus
  ou forme canonique, selon `canAccessPath` de CSF ;
- **identifiants au format UUID (CSF)** dans les motifs (`[id]` → UUID, pas « n'importe quel segment » comme KHI) ;
- **matrice = première ligne de défense** ; le cloisonnement des données (« un employé ne voit que ses fiches ») reste
  dans chaque route (CSF `scope.ts`, **non repris** : propre au métier ; expliqué dans `BRIQUE.md`).
Correspondance documentée pour un projet venu de CSF : `owner` ↔ `admin`, `advisor` ↔ `employe`.

## 4. Arborescence ajoutée

```
kits/crm/ts/
├── src/test-support/fake-supabase.ts (+ .test.ts)        faux Supabase en mémoire (Vitest), jamais importé par le code
├── src/lib/auth/types.ts                                 TeamRole, TeamMember (figé en P0 : P1 et P2 en dépendent)
├── src/lib/authz/roles.ts (+ .test.ts)                   ROLES, ROLE_LABELS, hasRole, rang
├── src/lib/authz/access-matrix.ts (+ .test.ts)           defineAccessMatrix, canAccessPath, requiredRole, matchedRule,
│                                                         permissionsOf, sessionLockFor, allowedWhileMfaPending
├── src/lib/admin/token-mode.ts (+ .test.ts)              refus du mot de passe partagé en ligne
├── src/lib/auth/team-session.ts (+ .test.ts)             point d'entrée équipe : session Supabase → liste blanche → rôle → état MFA ; deny 401/403
├── src/lib/auth/mfa.ts (+ .test.ts)                      règles pures : sessionAal, mfaState, isEnrolled, MFA_ALWAYS_ROLES (paramètre)
├── src/lib/auth/mfa-supabase.ts (+ .test.ts)             enrollTotp, challengeAndVerify, unenrollFactor, messages d'erreur
├── src/lib/auth/mfa-route.ts (+ .test.ts)                getMfaSession, mfaRefusal, mfaThrottled
├── src/lib/auth/mfa-trust.ts (+ .test.ts)                appareils de confiance 30 jours (Web Crypto)
├── src/lib/auth/mfa-backup-codes.ts (+ .test.ts)         codes de secours : génération, normalisation, empreinte HMAC, usage unique
├── src/lib/api/account-lock.ts (+ .test.ts)              verrou par compte (connexion 9/h, code MFA 4/15 min)
├── src/lib/audit/admin-audit.ts (+ .test.ts)             journal des actions (catalogue fermé, meta sans secret ni courriel)
├── src/lib/audit/audit-detail.ts (+ .test.ts)            détail lisible d'une entrée du journal
├── src/lib/audit/subject-access.ts (+ .test.ts)          journal d'accès Loi 25 (qui a ouvert quelle fiche)
├── src/lib/privacy/privacy.ts (+ .test.ts)               accès et effacement : courriel normalisé, filtre PostgREST échappé, adresses de l'équipe exclues
├── src/lib/privacy/effacement.ts (+ .test.ts)            orchestration : empreinte d'abord, tables paramétrées, bilan, liste « à effacer à la main »
├── src/lib/privacy/conservation.ts (+ .test.ts)          purge après N mois, empreinte, motif ILIKE échappé
├── src/lib/archivage/archivage.ts (+ .test.ts, garde-archivage.test.ts)
├── src/lib/health/heartbeat.ts (+ .test.ts)              battement du tick (cron_heartbeats)
├── src/lib/health/verdict.ts (+ .test.ts)                verdicts purs : tick, variables, secret cron, mode jeton, MFA, base
└── supabase/migrations/
    ├── 0103_equipe_acces.sql            team_allowlist (rôle check = ROLES), RLS sans politique, revoke all
    ├── 0104_mfa_aal2_restrictive.sql    politique restrictive aal2 (exemple sur une table lue par le navigateur)
    ├── 0105_mfa_trusted_devices.sql     mfa_trusted_devices, mfa_trusted_sessions, mfa_session_ok() (facteur vérifié exigé)
    ├── 0106_admin_audit_log.sql         admin_audit_log + index (sans api_keys ni tables MCP : lot 3)
    ├── 0107_subject_access_log.sql      journal d'accès Loi 25
    ├── 0108_privacy_requests.sql        demandes d'accès / effacement, empreinte du courriel seulement
    ├── 0109_mfa_backup_codes.sql        empreintes des codes de secours + fonction de consommation atomique
    ├── 0110_archivage.sql               archived_at sur leads (à adapter) + index partiel
    └── 0111_cron_heartbeats.sql         cron_heartbeats, RLS sans politique
```
Ordre d'application documenté : 0101 → 0111 ; **0104 avant 0105** (0105 fait `alter policy` sur la politique de 0104 ;
rejouer 0104 après 0105 remet « aal2 seulement », piège du kit JS repris tel quel).

## 5. Briques : source, cible, généralisation, tests

Abréviations : **CSF** = `/home/user/VieSolution-CSF`, **KHI** = `/home/user/khieduc`, **WEB** = `/home/user/viesolution---web`,
**KIT-JS** = `/home/user/methode-travail/kits/crm/auth`.

### L0. Faux Supabase pour Vitest
- **Source :** CSF `src/features/tasks/lib/fake-supabase.ts` (filtres réellement appliqués, `!inner`, colonnes du
  `select`, `head: true`, journal `queries`/`writes`, clés uniques → 23505) ; CSF `src/lib/team/mfa-test-db.ts`
  (`createMfaTestDb`) ; KIT-JS `../tests/` (`fake-supabase`) pour la parité de comportement (`rpc`, `auth.getUser`).
- **Cible :** `src/test-support/fake-supabase.ts` (+ aide `createAuthStub` issue de `mfa-test-db.ts`).
- **Généraliser :** retirer toute table métier des exemples ; `rpc(nom, args)` branchable par dictionnaire de fonctions ;
  `auth.getUser(token)` et `auth.admin.mfa.*` simulés. Dossier `test-support` : jamais importé par `src/lib/**` hors tests.
- **Tests :** **à écrire** (la source n'en a pas en propre) : `eq`/`in`/`ilike` échappé, `!inner` exclut, colonne non
  demandée → `undefined`, doublon → 23505, `rpc` inconnu → erreur.

### L1. Rôles et matrice d'accès « refus par défaut »
- **Source :** CSF `src/lib/authz/access-matrix.ts` (+ `access-matrix.test.ts`, 526 l.) : moteur, normalisation du
  chemin (`canAccessPath`, l. 229 s.), `sessionLockFor`, `lockRedirectPath`, `allowedWhileMfaPending`,
  `allowedWhilePasswordChangeRequired`, `mayReachWithoutAdminSession`, `adminReferrerPolicyFor` ; KHI `lib/roles.js`
  (version du 30 oct., refus par défaut, l. 14-18 et 134-186) : `ROLES`, `hasRole`, `requiredRole`, `matchedRule`,
  `canAccess`, `permissionsOf` ; tests KHI `tests/unit/roles.test.mjs` et `roles-droits.test.mjs` (cas seulement ; le
  tableau figé `roles-droits-avant.json` est propre à KHI : non repris).
- **Cible :** `src/lib/authz/roles.ts`, `src/lib/authz/access-matrix.ts`.
- **Généraliser :** `TeamRole = 'owner' | 'advisor'` → type dérivé de `ROLES` ; `ADVISOR_RULES` (pages `/dashboard/…`,
  routes `/api/admin/action-plans`, `prospecteurs`, Google…) → **matrice d'exemple** courte (`/admin`, `/api/admin/leads`,
  `/api/admin/leads/[id]`, `/api/admin/team` admin, `/api/admin/privacy` admin, envois groupés gestionnaire) marquée
  `[à adapter]` ; constantes de pages (`ADVISOR_HOME`, `PASSWORD_CHANGE_*`, `MFA_PAGE`, `SECURITY_PAGE`) → objet
  `AdminPaths` passé à `defineAccessMatrix` (défauts `/admin`, `/admin/securite`, `/admin/mot-de-passe` `[à adapter]`) ;
  retirer `GOOGLE_*` (lot 3). La matrice reste **pure, sans I/O, importable par le middleware (Edge)**.
- **Tests :** CSF repris pour le moteur (normalisation, méthodes, UUID, verrous de session, page d'accueil du rang bas
  présente dans la liste — garde anti-boucle) ; KHI pour les rangs ; **à ajouter :** chemin inconnu → rang le plus haut
  exigé (écart 2) ; `HEAD` permis seulement si listé ; `/api/admin/leads/%2e%2e/team`, `//`, `\`, barre finale → refus ;
  matrice à deux rôles (`['employe','admin']`) fonctionne ; `permissionsOf` cohérent avec `canAccessPath` (test de
  table) ; rôle inconnu → rang 0 (jamais plus).

### L2. Mot de passe partagé interdit en ligne
- **Source :** CSF `src/lib/admin/token-mode.ts` (+ test).
- **Cible :** `src/lib/admin/token-mode.ts`.
- **Généraliser :** `TOKEN_MODE_REFUSED_MESSAGE` cite `SUPABASE_ADMIN_AUTH_ENABLED` / `ADMIN_ALLOWED_EMAILS` (variables
  de CSF) → message `[à adapter]` qui renvoie à la connexion par courriel ; garder `VERCEL` → refus, `NODE_ENV=production`
  → refus sauf `ADMIN_TOKEN_MODE_LOCAL=1` hors Vercel, permis en dev/test. `BRIQUE.md` explique que le kit ne fournit
  **pas** de mode jeton : la brique sert à un projet qui en a hérité, et à `verdictModeJeton` (L12).
- **Tests :** repris ; **à ajouter :** `VERCEL=' '` (espaces seuls → permis selon le `trim()` d'origine : figer et
  documenter), `ADMIN_TOKEN_MODE_LOCAL=1` **avec** `VERCEL` → refus.

### L3. Point d'entrée de l'équipe (colle des briques)
- **Source :** KIT-JS `lib/authServer.js` (`getAdminFromRequest`, `deny`, WeakMap) ; CSF `src/lib/admin/auth.ts`
  (lecture seule, pour la forme TS ; **ne pas** reprendre son mode jeton ni ses variables propres).
- **Cible :** `src/lib/auth/team-session.ts` — `getTeamMember(request, { allowlistTable })` → `{ userId, email, role,
  mfa }` ou refus ; `deny(request)` 401 / 403 `{ detail, required_role }`.
- **Généraliser :** table `team_allowlist` (nom en paramètre ; colonne `email` en minuscules, contrainte SQL) ;
  **`aal` et `session_id` lus seulement après `supabase.auth.getUser(token)`** (piège du kit JS) ; rôle vérifié avant la MFA.
- **Pourquoi l'ajouter :** sans point d'entrée, matrice + MFA + journal restent des pièces qu'aucune route ne relie, et
  `securite` ne peut pas juger la chaîne. **Taille contenue** (≈ 150 lignes) ; s'il déborde, il passe en fiche (risques).
- **Tests :** **à écrire** sur L0 : jeton absent → 401 ; adresse hors liste → 401 ; majuscules → refus ; rôle
  insuffisant → 403 + `required_role` ; membre inscrit en aal1 → 403 `mfa_required` ; session de confiance → accepté ;
  facteur retiré + session de confiance → refusé.

### L4. Double vérification (TOTP de Supabase)
- **Source :** CSF `src/lib/team/mfa.ts`, `mfa-supabase.ts`, `mfa-route.ts` (+ `mfa.test.ts`, `authz/mfa-lock.test.ts`) ;
  KHI `lib/mfa.js` (`MFA_ALWAYS_ROLES`, `mfaRequiredForRole`, `MFA_SPACE_MESSAGES`) ; KIT-JS
  `supabase/migrations/0003_mfa_aal2_restrictive.sql`.
- **Cible :** `src/lib/auth/mfa.ts`, `mfa-supabase.ts`, `mfa-route.ts`, `supabase/migrations/0104_mfa_aal2_restrictive.sql`.
- **Généraliser :** `MFA_ISSUER` → `process.env.MFA_ISSUER` (défaut `SITE_NAME`) ; `MFA_ALWAYS_ROLES` paramètre (vide par
  défaut ; exemple de rôle client en commentaire) ; `ADMIN_MFA_REQUIRED=1` gardé ; `tokenModeMfaState` **retiré** (pas de
  mode jeton dans le kit) ; `TOKEN_MODE_MESSAGE` de `mfa-route.ts` → import de L2 ; messages `[à adapter]` ;
  `mfa-team.ts` (statut MFA de l'équipe) **non repris** (écran, lot écrans). SQL 0104 : porté du KIT-JS 0003 tel quel
  (table d'exemple `profiles`), requêtes de vérification et retour arrière gardés.
- **Tests :** CSF `mfa.test.ts` + `mfa-lock.test.ts` (sans les routes propres à CSF) ; KHI `mfa.test.mjs` (cas) ;
  **à ajouter :** jeton falsifié (`aal2` dans une charge non vérifiée) → aal1 ; facteur `unverified` ≠ inscrit ;
  `isTotpCode` refuse 5/7 chiffres et espaces internes.

### L5. Appareils de confiance (30 jours)
- **Source :** CSF `src/lib/team/mfa-trust.ts` (+ 17 tests) ; CSF `supabase/migrations/20261109_mfa_trusted_devices.sql`
  (tables, RLS, `revoke`) ; KIT-JS `0004_mfa_trusted_devices.sql` pour `public.mfa_session_ok()` (**security definer,
  `search_path` vide, facteur vérifié exigé** — LECONS n° 7 ; aucun `create function` trouvé dans la migration CSF).
- **Cible :** `src/lib/auth/mfa-trust.ts`, `supabase/migrations/0105_mfa_trusted_devices.sql`.
- **Généraliser :** `TRUST_COOKIE` → `process.env.MFA_TRUST_COOKIE ?? 'mfa_device'` ; `TRUST_COOKIE_PATH` →
  `/api/admin/mfa` (paramètre) ; `TRUST_DAYS` constante ; témoin `httpOnly; Secure; SameSite=Strict`.
- **Tests :** les 17 de CSF ; **à ajouter :** témoin d'un autre compte → refusé ; appareil révoqué → session refusée ;
  appareil expiré à la seconde près ; `purgeTrustedDevices` ne touche que l'expiré. Mutation dans `$T` : retirer
  `device.user_id === userId` de `deviceAccepts` → un test tombe.

### L6. Codes de secours
- **Source :** WEB `src/lib/admin/mfa.ts` l. 101-125 (`genererCodesSecours`, alphabet sans 0/O/1/I, `normaliserCodeSecours`,
  `estFormatCodeSecours`, `empreinteCodeSecours` HMAC, `LONGUEUR_MIN_SECRET`) ; WEB `src/lib/admin/mfa-store.ts`
  (`activerMfa`, `utiliserCodeSecours` par RPC atomique) et la fonction SQL correspondante de WEB
  (`supabase/setup-crm-vsw.sql`, à localiser par grep sur `use_backup_code`).
- **Cible :** `src/lib/auth/mfa-backup-codes.ts`, `supabase/migrations/0109_mfa_backup_codes.sql`.
- **Généraliser :** WEB = un seul propriétaire, codes rangés dans une table de réglages → table `mfa_backup_codes
  (user_id, code_hash, used_at)` par membre ; fonction `consume_mfa_backup_code(p_user uuid, p_hash text)` atomique
  (`update … where used_at is null returning`), `security definer`, `search_path` fixé, exécution `service_role` seule ;
  préfixe HMAC du client → `mfa-backup|` ; secret `MFA_BACKUP_SECRET` (≥ 32), sans repli silencieux.
- **Conception à trancher (sécurité) :** Supabase n'a pas de codes de secours et un code accepté **ne fait pas passer la
  session en aal2**. Proposé : code juste → la session courante devient **session de confiance de courte durée**
  (`mfa_trusted_sessions`, 1 h, sans appareil) + obligation de réinscrire un facteur (l'ancien est retiré par
  `auth.admin.mfa.deleteFactor`) ; tous les autres codes restent valables ; nouvelle série = anciennes empreintes
  effacées. Écrit pour le kit (WEB n'a pas ce problème) : **revue `securite` obligatoire sur ce point**.
- **Tests :** **à écrire** : 8 codes distincts, format `XXXX-XXXX` ; normalisation (minuscules, tiret, espaces) ;
  empreinte dépend du secret ; second usage → refus ; code d'un autre membre → refus ; secret court → aucune génération ;
  échecs comptés par le verrou L7.

### L7. Verrou de compte
- **Source :** CSF `src/lib/api/abuse-guard.ts` l. 270-372 (`ACCOUNT_LOGIN_RULE` 9/h, `ACCOUNT_MFA_RULE` 4/15 min,
  `accountLockKey`, `accountLockedFor`, `recordFailedLogin`, `accountLockedResponse`) + tests du verrou laissés au lot 1
  (`abuse-guard.test.ts`, parties « compte » / « MFA ») ; CSF `rate-limit-core.ts` l. 80-105 (`NOTIFY_*`, plafond
  d'alertes) seulement si le verrou en dépend.
- **Cible :** `src/lib/api/account-lock.ts` (importe `hitSharedCounter`, `hashRateLimitKey` du lot 1 ; s'appuie sur
  `0101_rate_limits.sql` — vérifier que `LockReadClient` lit une colonne déjà fournie, sinon compléter par une
  **nouvelle migration additive**, jamais en modifiant 0101).
- **Généraliser :** clé = empreinte HMAC du courriel normalisé (jamais le courriel en clair) ; seuils en constantes
  exportées ; message 429 `[à adapter]` avec `Retry-After`.
- **Tests :** repris ; **à ajouter :** 9 échecs → verrou, 10e même avec bon mot de passe → 429 ; base injoignable →
  repli mémoire qui verrouille aussi ; casse et espaces du courriel → même clé ; une réussite ne lève pas un verrou posé.

### L8. Journal des actions de l'admin
- **Source :** CSF `src/lib/integrations/admin-audit.ts` et `audit-detail.ts` (+ leurs deux tests) ; KHI `lib/audit.js`
  (catalogue `AUDIT_ACTIONS` plus long, `audit()` ne lève jamais) ; CSF `supabase/migrations/20261108_integrations.sql`
  l. 28-47 **seulement** (`admin_audit_log`, 3 index, RLS, revoke).
- **Cible :** `src/lib/audit/admin-audit.ts`, `audit-detail.ts`, `supabase/migrations/0106_admin_audit_log.sql`.
- **Généraliser :** catalogue fermé **générique** (connexion, déconnexion, MFA inscrite/retirée/code de secours utilisé,
  appareil de confiance ajouté/oublié, membre ajouté/retiré/rôle changé, fiche supprimée/archivée/désarchivée, export,
  demande Loi 25 accès/effacement, réglage modifié, purge de conservation) avec familles et libellés `[à adapter]` ;
  actions métier de CSF/KHI retirées ; `ipOf` via `request-ip.ts` (lot 1) ; `meta` filtrée (aucune clé `email`,
  `token`, `secret`, `password`, `code`).
- **Tests :** repris ; **à ajouter :** action hors catalogue → erreur de type + test ; `meta` avec `email` → retirée ;
  base en erreur → `audit()` ne lève pas ; `parseAuditFilters` refuse une date invalide.

### L9. Journal d'accès Loi 25
- **Source :** CSF `src/lib/audit/subject-access.ts` (+ test) ; table : CSF `supabase/migrations/20260823_access_logs.sql`
  (seule migration qui cite `subject_access`).
- **Cible :** `src/lib/audit/subject-access.ts`, `supabase/migrations/0107_subject_access_log.sql`.
- **Généraliser :** `AdminActor` de CSF → membre de L3 ; `TOKEN_ACTOR_LABEL` et `toLegacyAccessRow` **retirés** (mode
  jeton et ancienne table propres à CSF) ; `sanitizeLoggedPath` gardé (aucun paramètre d'URL journalisé) ; durée de
  conservation du journal en paramètre.
- **Tests :** repris ; **à ajouter :** chemin avec `?q=courriel` → journalisé sans requête ; écriture du journal en
  échec ne lève pas (l'affichage continue, l'échec est journalisé) ; une ligne par ouverture de fiche, pas par liste.

### L10. Accès et effacement Loi 25 (+ empreinte) et conservation limitée
- **Source :** KHI `lib/privacy.js` (+ test) : `normalizePersonEmail`, `isValidPersonEmail`, `postgrestQuote` (filtre
  `.or()` échappé), `emailMessagesFilter`, `teamAddresses` (adresses de l'équipe exclues), `collectEmailMessages`,
  `eraseEmailMessages` ; **l'orchestration** accès / effacement de KHI n'est pas dans `privacy.js` (fonctions sur les
  courriels seulement) mais dans `app/v1/admin/privacy/route.js` (lire pour l'ordre des tables et les cas « courriel
  sans fiche ») ; WEB `src/lib/crm/effacement.ts` (empreinte **d'abord**, bilan, `empreintesEffacees`) ; WEB
  `src/lib/crm/conservation.ts` (+ test) : `derniereActivite`, `aConserverJusquau`, `aSupprimer`, `empreinteCourriel`,
  `motifExact`.
- **Cible :** `src/lib/privacy/privacy.ts`, `effacement.ts`, `conservation.ts`, `supabase/migrations/0108_privacy_requests.sql`.
- **Généraliser :** tables préfixées du client et `leads` → **liste déclarée** `ERASABLE_SOURCES: { table, by:
  'email' | 'lead_id', column }[]` `[à adapter]` ; table de demandes du client → `privacy_requests (kind, email_hash,
  actor, summary, created_at)` ; acteur écrit en dur dans WEB → membre de L3 ; clé d'empreinte `PRIVACY_HASH_SECRET`
  (≥ 32) avec repli `UNSUBSCRIBE_SECRET` documenté (lien avec le désabonnement du lot 1) ; `MOIS_CONSERVATION = 36`
  (décision d'un client) → paramètre **obligatoire** `RETENTION_MONTHS`, sans défaut silencieux (exemple 36 `[à adapter]`,
  note : les factures suivent la loi fiscale) ; liste « à effacer à la main » (agenda, fournisseur de courriel, boîte
  de réception) gardée comme exemple `[à adapter]` ; égalité exacte, **jamais `ilike` non échappé**.
- **Tests :** KHI `privacy.test.mjs` + WEB `conservation.test.mjs` portés ; **à ajouter :** courriel avec `"`, `,`, `)`
  → filtre `.or()` sans injection ; `%`/`_` dans le courriel → motif échappé ; adresse de l'équipe jamais effacée ;
  empreinte écrite **avant** la première suppression (échec à mi-parcours → l'adresse reste bloquée) ; relance vers
  une empreinte effacée → refusée ; secret absent → effacement refusé avec message clair ; courriel sans fiche couvert.

### L11. Archivage
- **Source :** CSF `src/lib/archivage/archivage.ts` (+ `archivage.test.ts`, `garde-archivage.test.ts`) ; CSF
  `supabase/migrations/20261110_archivage.sql` ; KHI `lib/archivage.js` (origine, lecture si un cas manque).
- **Cible :** `src/lib/archivage/archivage.ts` (+ deux tests), `supabase/migrations/0110_archivage.sql`.
- **Généraliser :** garder `ARCHIVED_MODES`, `parseArchivedMode`, `applyArchived`, `sansArchives`, `doitDesarchiver`,
  `activiteArchivage` ; **retirer** `peutArchiverRendezVous`, `STATUT_RENDEZ_VOUS_ANNULE` (agenda, lot 3) ; SQL :
  `archived_at` sur `leads` seulement (`appointments` en commentaire `[à adapter]`), index partiel. **Garde** :
  `garde-archivage.test.ts` lit les fichiers d'un projet ; dans le kit, liste des fichiers à surveiller en paramètre
  (`ARCHIVAGE_FICHIERS_LISTES`), test qui passe sur un exemple du kit et échoue si l'exemple oublie `sansArchives`.
- **Tests :** repris ; mutation dans `$T` : retirer le filtre `archived_at is null` de l'exemple → la garde tombe.

### L12. Point de santé + battement du tick
- **Source :** CSF `src/lib/health/heartbeat.ts`, `verdict.ts` (+ `verdict.test.ts`) ; CSF
  `supabase/migrations/20261111_cron_heartbeats.sql` ; KHI `app/v1/admin/health/` (liste des contrôles utiles : secret
  de désabonnement, dernier incident Turnstile, URL du site — lecture seule, pour la liste).
- **Cible :** `src/lib/health/heartbeat.ts`, `verdict.ts`, `supabase/migrations/0111_cron_heartbeats.sql`.
- **Généraliser :** `VARIABLES_ATTENDUES` → liste du kit (lots 1-2 : `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`, `UNSUBSCRIBE_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `MFA_BACKUP_SECRET`,
  `PRIVACY_HASH_SECRET`) extensible ; `verdictGoogle`/`EtatGoogle` **retirés** (lot 3) ; ajout `verdictTurnstile` et
  `verdictSiteUrl` (lot 1 : `turnstileHealth`, `getPublicSiteUrl`) ; `verdictModeJeton` branché sur L2 ; seuils
  `TICK_ATTENTION_HEURES` / `TICK_PANNE_HEURES` gardés. **Pas de route** dans ce lot (la route de santé dépend des
  écrans) : exemple d'assemblage dans `BRIQUE.md`, protégé par L3 (rang `admin`).
- **Tests :** repris ; **à ajouter :** aucune valeur de secret dans le verdict (seulement présent / trop court) ;
  `avecDelai` → « injoignable » après `DELAI_CONTROLE_MS` ; tick jamais passé → panne.

## 6. Ce qui reste en fiche (pas en code)

- **Admin d'un seul propriétaire avec code d'accès** (WEB `admin-auth.ts`, `mfa.ts` TOTP maison, `mfa-store.ts`) :
  fiche dans `CATALOGUE.md` + paragraphe de `BRIQUE.md` — quand l'utiliser (une seule personne, pas de Supabase Auth),
  ses limites (écart 5 : pas d'identité dans le journal, session révocable seulement en changeant le secret, le code
  seul permet d'activer la MFA tant qu'elle ne l'est pas), ce qu'il faut garder (secret chiffré AES-256-GCM, anti-rejeu
  du pas de 30 s, essais limités 8/IP et 20 échecs du 2e facteur).
- Cloisonnement des données par membre (CSF `scope.ts`) : principe dans `BRIQUE.md`, code propre au métier.
- Invitation d'un membre, changement de mot de passe obligatoire, écrans MFA : lot écrans.

## 7. Phases

### Graphe

```
P0 montage + L0 faux Supabase + types + L1 rôles/matrice + L2 token-mode     (agent principal)
        │
        ├──────────────────────────────┐
        ▼                              ▼
P1 L3 entrée équipe + L4 MFA      P2 L8 journal + L9 accès Loi 25
   + L5 confiance (0103-0105)        + L10 effacement/conservation (0106-0108)
   (data-agent)                      (agent principal)
        └──────────────┬───────────────┘
                       ▼
               QA-A (qa-agent court, P0+P1+P2)      ── fin du lot 2a : securite-A (cœur d'accès)
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
P3 L6 codes de secours            P4 L11 archivage + L12 santé
   + L7 verrou de compte (0109)      (0110-0111) (agent principal)
   (data-agent)
        └──────────────┬───────────────┘
                       ▼
               QA-B (qa-agent court, P3+P4)
                       ▼
P5 documents (BRIQUE, CATALOGUE, README, CHANGELOG, VERSION 1.5.0, skill nouveau-crm, fiche propriétaire unique)
                       ▼
P6 qa-agent final (court) → securite (obligatoire avant « prêt »)
```
Parallélisme : P1 ∥ P2, P3 ∥ P4 — fichiers disjoints, **2 agents au plus**, tous **Opus**. P2 n'importe de P1 que le
**type** du membre, figé en P0 dans `src/lib/auth/types.ts` pour éviter l'attente.

### Alléger le contrôle qualité (lot 1 : ≈ 120 k par qa)
- **Un qa pour deux phases** (QA-A, QA-B) + un qa final court, au lieu d'un par phase.
- Le prompt du qa donne **une liste fermée** et les commandes prêtes : (1) `npm run verify` dans `$T` ; (2)
  `grep -rniE "viesolution|vie solution|khi|camille|khieduc|vsw_|gflkfwal|alnirija|\.ca\b|@gmail|438|514" kits/crm/ts`
  hors lignes d'origine ; (3) première ligne de chaque fichier ajouté ; (4) `git status --porcelain` ; (5) **diff des
  seuls fichiers `*.test.ts` ajoutés/modifiés** (aucun test affaibli) ; (6) les critères de la phase. Pas de
  réexploration des sources, `maxTurns` 20, rapport ≤ 30 lignes.
- Les essais de mutation sont faits **par l'agent de la phase** (compte rendu avec le chemin `$T`), pas refaits par le qa.
- Cible : ≈ 70-80 k par qa.

### P0 — Montage, faux Supabase, types, rôles et matrice, token-mode
- **Fichiers :** `src/test-support/fake-supabase.ts(.test.ts)`, `src/lib/auth/types.ts`,
  `src/lib/authz/{roles,access-matrix}.ts(.test.ts)`, `src/lib/admin/token-mode.ts(.test.ts)` ; `package.json`
  (description « lots 1 et 2 » seulement) ; `vitest.config.ts` si `test-support` doit être inclus ; `.env.exemple`
  (nouvelles variables du lot, sans valeur).
- **Agent :** agent principal (Opus).
- **Mutation dans `$T` :** `requiredRole` qui renvoie le rang bas pour un chemin inconnu → test « refus par défaut » tombe.
- **Coût :** ≈ 110 k.

### P1 — Entrée de l'équipe, double vérification, appareils de confiance
- **Fichiers :** `src/lib/auth/{team-session,mfa,mfa-supabase,mfa-route,mfa-trust}.ts(.test.ts)`,
  `supabase/migrations/0103_equipe_acces.sql`, `0104_mfa_aal2_restrictive.sql`, `0105_mfa_trusted_devices.sql`.
- **Agent :** `data-agent` (Opus) ; s'il n'existe pas dans la session (question ouverte 2 du lot 1), l'agent principal.
- **Mutation :** L5 (`deviceAccepts`) et L3 (lire `aal` avant `getUser`).
- **Coût :** ≈ 220 k.

### P2 — Journaux et Loi 25
- **Fichiers :** `src/lib/audit/{admin-audit,audit-detail,subject-access}.ts(.test.ts)`,
  `src/lib/privacy/{privacy,effacement,conservation}.ts(.test.ts)`, `0106_admin_audit_log.sql`,
  `0107_subject_access_log.sql`, `0108_privacy_requests.sql`.
- **Agent :** agent principal (Opus), en parallèle de P1.
- **Mutation :** `postgrestQuote` sans échappement → test d'injection tombe ; empreinte écrite après la suppression →
  test d'ordre tombe.
- **Coût :** ≈ 200 k.

### QA-A — `qa-agent` (Opus), P0 + P1 + P2 — **≈ 80 k**

### Fin du lot 2a (si le découpage est retenu) — `securite` (Opus) sur L1, L3, L4, L5, L10 et SQL 0103-0108 — **≈ 100 k**

### P3 — Codes de secours et verrou de compte
- **Fichiers :** `src/lib/auth/mfa-backup-codes.ts(.test.ts)`, `src/lib/api/account-lock.ts(.test.ts)`,
  `0109_mfa_backup_codes.sql` ; retouche **additive** de `mfa-route.ts` (branchement du verrou MFA 4/15 min).
- **Agent :** `data-agent` (Opus).
- **Mutation :** consommation non atomique (lecture puis écriture) → test de double usage tombe ; verrou levé par une
  réussite → test tombe.
- **Coût :** ≈ 150 k.

### P4 — Archivage et santé
- **Fichiers :** `src/lib/archivage/archivage.ts` (+ 2 tests), `src/lib/health/{heartbeat,verdict}.ts(.test.ts)`,
  `0110_archivage.sql`, `0111_cron_heartbeats.sql`.
- **Agent :** agent principal (Opus), en parallèle de P3.
- **Coût :** ≈ 110 k.

### QA-B — `qa-agent` (Opus), P3 + P4 — **≈ 80 k**

### P5 — Documents
- **`kits/crm/ts/BRIQUE.md`** : titre « lots 1 et 2 » ; table des fichiers L0-L12 ; variables (`ADMIN_MFA_REQUIRED`,
  `MFA_ISSUER`, `MFA_TRUST_COOKIE`, `MFA_BACKUP_SECRET`, `PRIVACY_HASH_SECRET`, `RETENTION_MONTHS`,
  `ADMIN_TOKEN_MODE_LOCAL`) ; tables 0103-0111 et ordre ; adaptation brique par brique ; rôles par défaut et
  correspondance ; « tests de la source non repris (et pourquoi) » ; pièges (aal lu après `getUser`, 0104 avant 0105,
  routes `service_role` contournent RLS, empreinte avant effacement) ; **correction du chemin `/home/user/Methode-Travail`**.
- **`CATALOGUE.md`** : colonne TS = `code (ts/)` pour « Liste blanche », « Rôles par route », « Double authentification »,
  « Se souvenir 30 jours », « Journal d'activité » ; nouvelles lignes : « Mot de passe partagé interdit en ligne »,
  « Verrou de compte », « Codes de secours », « Journal d'accès Loi 25 », « Accès et effacement », « Conservation
  limitée », « Archivage », « Santé + battement », « Faux Supabase (Vitest) », « Admin d'un seul propriétaire » (fiche,
  TS `—`) ; en-tête : « lots 1 et 2, depuis 1.5.0 ».
- **`kits/crm/README.md`** : `ts/` = lots 1-2 ; ordre d'installation TS (0101-0111, puis `src/lib/`, puis routes du projet).
- **`CHANGELOG.md`** : `## 1.5.0 — <date> — Kit CRM TS, lot 2` (ce qui entre, **Vérifié**, **Pas encore vérifié** :
  SQL jamais joués sur base neuve, aucune brique installée dans un projet réel, codes de secours = conception neuve).
- **`VERSION`** : `1.4.0` → `1.5.0`.
- **`modele/.claude/skills/nouveau-crm/SKILL.md`** : socle admin TS (L0-L12), question des rôles à poser au démarrage,
  ordre des migrations, `securite` avant la mise en ligne d'un admin, règle E15.
- **Agent :** agent principal (Opus). **Coût :** ≈ 70 k.

### P6 — Vérification finale
- `qa-agent` (Opus) court : liste fermée ci-dessus sur tout le lot + critères 1-20 — **≈ 70 k**.
- `securite` (Opus, lecture seule, verdict binaire) **obligatoire avant « prêt »** : matrice et normalisation, point
  d'entrée, MFA (aal après vérification), confiance (`mfa_session_ok` exige un facteur vérifié), **codes de secours**
  (conception L6), verrou, effacement (injection `.or()`, empreinte), RLS et `security definer` + `search_path` de
  0103-0111, aucun secret dans un verdict ou un journal — **≈ 100 k** (≈ 60 k si `securite-A` a déjà vu le lot 2a).

### Coûts

| Phase | Coût (correction × 1,33 incluse) |
|---|---|
| P0 | 110 k |
| P1 | 220 k |
| P2 | 200 k |
| QA-A | 80 k |
| P3 | 150 k |
| P4 | 110 k |
| QA-B | 80 k |
| P5 | 70 k |
| P6 qa | 70 k |
| P6 securite | 100 k |
| **Total** | **≈ 1 190 k** (fourchette 1,0 – 1,35 M) — **gros, accord de Camille** |

### Découpage proposé (recommandé)
- **Lot 2a ≈ 710 k** : P0, P1, P2, QA-A, `securite-A` (100 k) → PR 1, sans changer `VERSION` ; état écrit dans
  `docs/ETAT-ACTUEL.md` du dépôt.
- **Lot 2b ≈ 520 k** : P3, P4, QA-B, P5, P6 (qa + `securite` complément ≈ 60 k) → PR 2, `VERSION` 1.5.0.
- Total découpé ≈ 1,23 M (un passage `securite` de plus), mais chaque session reste **moyenne** et une coupure
  (limite d'usage) ne perd que la moitié du lot. Arrêt et état écrit si un sous-lot atteint 110 % de son estimation.

## 8. Critères d'acceptation (cochables par `qa-feature`)

1. [ ] L'arborescence de la section 4 existe ; aucun fichier en trop.
2. [ ] Chaque fichier de code et SQL ajouté a sa ligne d'origine (projet, chemin, commit, généralisation) ou « écrit
   pour le kit (raison) ».
3. [ ] Recherche de noms / domaines / identifiants clients vide hors lignes d'origine (dont `vsw_`, et `owner`/`advisor`
   hors de la correspondance documentée).
4. [ ] `npm run verify` (tsc strict + Vitest, lots 1 et 2) passe dans un dossier `mktemp -d` ; versions inchangées ;
   aucune dépendance ajoutée.
5. [ ] Chaque brique L0-L12 a au moins un `*.test.ts` ; tests des sources repris ou abandon justifié dans `BRIQUE.md` ;
   les tests « à ajouter » de la section 5 existent.
6. [ ] Chaque brique vue en échec une fois (mutation dans `$T`, chemin noté au compte rendu).
7. [ ] Matrice : chemin inconnu → rang le plus haut exigé ; chemins piégés (`..`, `%2e`, `//`, `\`) refusés ; matrice
   à deux rôles testée ; `permissionsOf` cohérent avec `canAccessPath`.
8. [ ] Mode jeton : refusé sur Vercel et en production, sauf `ADMIN_TOKEN_MODE_LOCAL=1` hors Vercel.
9. [ ] Point d'entrée : 401 / 403 (`required_role`, `mfa_required`) testés ; `aal` jamais lu avant `getUser`.
10. [ ] Appareils de confiance : témoin `httpOnly; Secure; SameSite=Strict` au chemin MFA ; refusé pour un autre
    compte, un appareil révoqué ou expiré, ou sans facteur vérifié (serveur **et** `mfa_session_ok()`).
11. [ ] Codes de secours : empreinte HMAC seule en base, usage unique atomique, effet sur la session conforme à la
    conception validée par `securite`.
12. [ ] Verrou de compte : 9 échecs/h et 4 codes MFA/15 min, clé = empreinte du courriel normalisé, repli mémoire qui
    verrouille.
13. [ ] Journal des actions : catalogue fermé testé ; `meta` sans courriel ni secret ; `audit()` ne lève jamais.
14. [ ] Journal d'accès : une ligne par ouverture de fiche, chemin sans paramètres.
15. [ ] Effacement : empreinte écrite avant toute suppression ; filtre `.or()` échappé ; adresses de l'équipe
    exclues ; relance vers une empreinte effacée refusée ; conservation sans durée par défaut silencieuse.
16. [ ] Archivage : garde qui échoue si une liste oublie de masquer les archivés.
17. [ ] Santé : verdicts purs testés, aucun secret dans un verdict, `verdictGoogle` absent.
18. [ ] Migrations 0103-0111 : RLS activée, `revoke all` pour `anon`/`authenticated`, fonctions `security definer` à
    `search_path` fixé, idempotentes, **non appliquées** ; ordre documenté (0104 avant 0105).
19. [ ] `BRIQUE.md`, `CATALOGUE.md` (colonne TS), `README.md`, `CHANGELOG.md` 1.5.0, `VERSION` 1.5.0, skill
    `nouveau-crm` à jour ; fiche « admin d'un seul propriétaire » présente, sans code.
20. [ ] Aucun fichier modifié dans CSF, KHI, WEB ; aucun `node_modules`, verrou ni `.next` dans le dépôt ; aucune
    mutation dans un dépôt (E15) ; diff des tests relu par l'agent principal ; `securite` rendu **favorable**.

## 9. Migrations

`0103_equipe_acces.sql` à `0111_cron_heartbeats.sql` : **fournies dans le kit, jamais appliquées**. Elles seront
appliquées **en production par Camille seulement** (ou par Claude sur sa demande explicite), projet par projet, à
l'installation. Non jouées sur une base neuve dans ce lot : « Pas encore vérifié » au CHANGELOG. Chaque fichier porte
ses requêtes de vérification et son retour arrière en commentaire (modèle KIT-JS 0003/0004).

## 10. Risques et retours arrière

| Risque | Parade | Retour arrière |
|---|---|---|
| Mutation dans un dépôt (E15) | procédure `$T` + garde `$PWD` ; chemin minuscule `methode-travail` | `git checkout -- kits/` ; rien n'est commité avant QA |
| Codes de secours mal conçus au-dessus de Supabase (session aal1 « promue ») | conception écrite (L6), tests, `securite` obligatoire | L6 passe en fiche ; le reste du lot est livrable sans lui |
| Point d'entrée L3 qui grossit (sessions, jetons, clés d'API) | périmètre fermé : session Supabase + liste blanche seulement ; clés d'API = lot 3 | L3 en fiche, le kit JS `authServer.js` reste la référence |
| Matrice d'exemple gardée telle quelle par un projet | `[à adapter]` en tête, étape 1 de l'adaptation dans `BRIQUE.md`, question posée par `nouveau-crm` | — |
| Orchestration d'effacement de KHI trop liée au métier | WEB `effacement.ts` comme base, KHI pour les courriels et l'ordre | brique « effacement » en code partiel + fiche |
| `account-lock` a besoin d'une colonne absente de 0101 | nouvelle migration additive, jamais modifier 0101 | — |
| Dépassement (lot 1 : + 33 %) | découpage 2a / 2b ; arrêt à 110 % d'un sous-lot, état écrit | P5 glisse à une session suivante |
| Limite d'usage | arrêt net, état dans `docs/ETAT-ACTUEL.md` du dépôt, aucune relance automatique | — |
| Tests CSF qui dépendent de modules CSF absents | `vi.mock` ciblé ou L0 ; abandon justifié dans `BRIQUE.md` | — |

Tout le lot est **additif** (nouveaux fichiers ; seules retouches de fichiers du lot 1 : description de `package.json`,
`.env.exemple`, `BRIQUE.md`) : retour arrière = revert du commit de la PR.

## 11. Hors périmètre

Lot 3 (clés d'API, connecteur Claude / OAuth, moteur d'automatisations et tick — seul le **battement** est livré ici —,
agenda, webhooks, courriels entrants) ; écrans de l'admin en TS (inscription MFA, code, appareils, journal, santé,
Loi 25) ; routes API de l'admin (sauf exemples dans `BRIQUE.md`) ; cloisonnement des données par membre ; invitation
d'un membre, mot de passe obligatoire à la première connexion ; mode jeton (refusé, pas fourni) ; tout changement dans
CSF, KHI, WEB ; application des migrations ; installation dans un projet client.

## 12. Questions ouvertes

1. **Rôles par défaut** : B (`admin` / `gestionnaire` / `employe`, paramétrable) recommandé (section 3) — Camille tranche.
2. **Découpage** 2a / 2b (recommandé) ou lot unique de ≈ 1,2 M ? Dans les deux cas : accord sur l'estimation.
3. **Codes de secours** : la conception « session de confiance d'une heure + réinscription obligatoire » convient-elle,
   ou préférer « l'équipe réinitialise la double vérification à la main » (plus simple, pas de code) ?
4. **Point d'entrée L3** dans ce lot (recommandé) ou laissé au kit JS / au lot écrans ?
5. **Durée de conservation** : aucun défaut (proposé) ou 36 mois par défaut ?
6. **Anti-rejeu du code TOTP** : Supabase refuse-t-il un même code deux fois dans le même pas de 30 s ? Non vérifié ;
   sinon, le verrou 4/15 min limite le risque, à noter dans `BRIQUE.md`.

## 13. Non fait (dans ce plan)

- Sources lues par en-têtes, exports et recherches ciblées seulement : numéros de ligne à confirmer à l'exécution
  (en particulier `canAccessPath` l. 229 s. de `access-matrix.ts`, verrou l. 270-372 de `abuse-guard.ts`).
- Vérifié après écriture : CSF `audit-detail.ts` (+ test) existe ; table du journal d'accès dans CSF
  `20260823_access_logs.sql` ; KHI `app/v1/admin/privacy/route.js` existe. Non localisé : la fonction SQL des codes de
  secours de WEB (dans `supabase/setup-crm-vsw.sql`, supposé).
- Non vérifié : absence de `mfa_session_ok()` dans la migration CSF `20261109` (aucun `create function` trouvé ; le kit
  JS 0004 sert de source) ; que `qrDataUrl` n'ajoute aucune dépendance.
- Commits d'origine non relevés ; coûts estimés, pas mesurés.

## Décisions de Camille (30 oct. 2026)
- **Découpage** : lot 2a d'abord (P0-P2 : accès refusés par défaut, point d'entrée de l'équipe, double vérification + appareils de confiance + codes de secours, `qa-agent`, `securite`), plafond ≈ 710 k ; lot 2b (P3-P6) seulement après son OK.
- **Rôles par défaut** : `admin` > `gestionnaire` > `employe`, paramétrables, refus par défaut.
- **Codes de secours** : 10 codes à usage unique ; un code accepté ouvre une session de confiance d'une heure qui oblige à réinscrire un facteur ; conception revue par `securite` avant « prêt ».
