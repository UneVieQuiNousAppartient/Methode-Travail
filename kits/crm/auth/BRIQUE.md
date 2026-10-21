# Brique « auth » — accès de l'équipe et des espaces clients

Origine : KHI Educ (CRM Next.js 16 + Supabase), octobre 2026. Code en production, nettoyé de tout ce qui
était propre au client.

## À quoi ça sert

Contrôle d'accès côté serveur d'un CRM Next.js (App Router) sur Supabase :

- **Équipe** : liste blanche `admin_allowlist` (adresse → rôle `admin` / `gestionnaire` / `employe`) ;
  **matrice de droits par route** (`lib/roles.js`) appliquée dans `getAdminFromRequest` ; refus 401 ou 403
  avec le rôle requis (`deny(request)`) ; résumé des droits pour cacher les boutons interdits (`GET /v1/admin/me`).
- **Clés d'API** pour les agents et intégrations (`crm_…`, seul le haché SHA-256 est stocké), avec leur rôle.
- **Espaces clients** (`profiles.role`) : `getUserWithRole(request, "parent")`.
- **Double authentification** (TOTP de Supabase Auth) : un membre inscrit doit être en `aal2` ; tous si
  `ADMIN_MFA_REQUIRED=1` ; les rôles clients de `MFA_ALWAYS_ROLES` toujours. Deux verrous : le serveur
  (routes en `service_role`, qui contournent RLS) et la base (politiques **restrictives** `aal2`).
- **Appareils de confiance** (« se souvenir de cet appareil 30 jours ») : témoin httpOnly + session Supabase
  inscrite comme session de confiance, acceptée par le serveur ET par la base (`public.mfa_session_ok()`).
- **Journal d'activité** de l'équipe (`lib/audit.js`) : qui a fait quoi, IP, marque `via_agent`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `lib/authServer.js` | `getUserFromRequest`, `getUserWithMfa`, `getAdminFromRequest`, `getUserWithRole`, `deny` |
| `lib/roles.js` | `ROLES`, `ROLE_LABELS`, `requiredRole`, `canAccess`, `hasRole`, `permissionsOf` — **matrice d'exemple** |
| `lib/mfa.js` | `sessionAal`, `mfaState`, `isEnrolled`, `MFA_ALWAYS_ROLES`, messages des codes de refus |
| `lib/mfaTrust.js` | appareils de confiance : règles pures (`deviceAccepts`, `trustedSessionValid`, témoin) + accès base |
| `lib/apiKeys.js` | génération, haché, préfixe des clés d'API |
| `lib/audit.js` | `audit()` (ne lève jamais), `listAudit()`, `AUDIT_ACTIONS` (catalogue = filtres du journal) |
| `lib/supabaseAdmin.js` | client `service_role` (échoue bruyamment si la clé manque) |
| `app/v1/auth/role/route.js` | `GET` : rôle de l'utilisateur connecté (routage après connexion, **ouvert en aal1**) |
| `app/v1/admin/me/route.js` | `GET` : qui suis-je, rôle, droits, état MFA (répond même quand le code manque) |
| `app/v1/auth/mfa/trust/route.js` | `POST` : retenir cet appareil (aal2 exigé) |
| `app/v1/auth/mfa/trusted-session/route.js` | `POST` : présenter le témoin à la connexion |
| `app/v1/auth/mfa/devices/route.js` | `GET` / `DELETE` : lister, oublier un ou tous les appareils |
| `supabase/migrations/0001…0004` | voir ci-dessous |
| `tests/unit/mfa.test.mjs`, `mfa-trust.test.mjs`, `roles.test.mjs` | tests (base en mémoire, brique `tests`) |

Imports en alias `@/lib/...` : copier les dossiers **à la racine du projet, aux mêmes chemins**.

## Tables et migrations (`supabase/migrations/`, idempotentes, dans l'ordre)

1. `0001_equipe_acces.sql` — `admin_allowlist` (rôle, nom, adresse en minuscules), `admin_audit_log`,
   `api_keys`. RLS activée **sans politique** + `revoke all` : tables du serveur seulement.
2. `0002_profiles.sql` — `profiles` (rôle client, `check` à adapter) + « chacun lit son profil ».
3. `0003_mfa_aal2_restrictive.sql` — politique restrictive `aal2` sur `profiles` (exemple ; une par table lue
   par le navigateur). Contient les requêtes de vérification et le retour arrière.
4. `0004_mfa_trusted_devices.sql` — `mfa_trusted_devices`, `mfa_trusted_sessions`, `public.mfa_session_ok()`
   (security definer, `search_path` vide, **facteur vérifié exigé**), `revoke all`, puis `alter policy` des
   politiques de 0003. **Rejouer 0003 après 0004 remet la règle « aal2 seulement »** : toujours 0003 puis 0004.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` (serveur seulement, jamais `NEXT_PUBLIC_`) |
| `ADMIN_MFA_REQUIRED` | `1` = double authentification obligatoire pour toute l'équipe (sinon : seulement les membres inscrits) |

## Dépendances

`next` (`next/server`), `@supabase/supabase-js`, `node:crypto`. Tests : brique `tests` du kit (`fake-supabase`,
loaders, `run-unit-tests`). Rien d'autre : pas de limiteur de débit ni d'OAuth dans cette brique.

## Étapes d'adaptation

1. **Matrice de rôles** (`lib/roles.js`) : réécrire `RULES` avec les routes du projet, les plus strictes
   d'abord. Décider ce qui est réservé : envois en masse, suppressions définitives, équipe, clés, vie privée.
   Mettre `permissionsOf` d'accord avec les boutons de l'écran. Si les rôles changent de nom : aussi les
   `check` de `0001` (deux tables) et `ROLE_LABELS`.
2. **Rôles « toujours MFA »** (`MFA_ALWAYS_ROLES` dans `lib/mfa.js`) : les rôles clients du projet ; mêmes
   valeurs que le `check` de `profiles.role` (`0002`).
3. **Tables lues par le navigateur** : une politique restrictive par table dans `0003` et une ligne
   `alter policy` dans `0004` ; étendre le contrôle 4 de `tests/unit/mfa.test.mjs` à ces tables.
4. **Liste blanche** : insérer le premier administrateur (exemple commenté dans `0001`), en minuscules.
5. **Noms propres au projet** : préfixe des clés (`API_KEY_PREFIX`), nom du témoin (`TRUST_COOKIE`), en-tête
   d'agent (`AGENT_HEADER`), catalogue `AUDIT_ACTIONS`.
6. **Création du profil** à l'inscription (déclencheur sur `auth.users`) : propre au projet ; ne jamais créer
   de profil client pour une adresse de la liste blanche.
7. **Points d'extension** laissés en commentaire : autre type de jeton dans `getAdminFromRequest` (ex. OAuth
   d'un connecteur MCP héritant du rôle d'une clé), champs supplémentaires de `GET /v1/admin/me`.
8. **Écrans** (hors brique) : inscription du facteur, écran du code, case « se souvenir », « Sécurité du
   compte ». Ils réagissent aux codes `mfa_required` / `mfa_enrollment_required` des réponses 403.

## Comment vérifier

```bash
npm test                       # avec la brique tests copiée : 3 fichiers, ≈ 87 contrôles
node tests/unit/mfa-trust.test.mjs
```
- **Casser une règle une fois** (méthode `tester-dabord`) : retirer `device.user_id === userId` de
  `deviceAccepts` (`lib/mfaTrust.js`) → `mfa-trust.test.mjs` échoue (« témoin d'un autre compte → refusé »,
  et ses suites), puis restaurer.
- **Base** : requêtes de vérification en tête de `0003` et `0004` (pg_policies, utilisateur simulé dans une
  transaction annulée : aal1 → 0 ligne, aal2 → 1, session de confiance → 1, appareil retiré → 0).
- **Écran** : scénario `simulation/s7-double-auth.mjs` de la brique `tests`.

## Pièges connus

- **Ne lire `aal` ou `session_id` du jeton qu'après `supabase.auth.getUser(token)`** : la charge utile d'un
  JWT se falsifie ; c'est la vérification de Supabase qui la rend fiable.
- **Les routes en `service_role` contournent RLS** : la politique `aal2` de la base ne protège que les
  lectures du navigateur. Toute route d'espace client passe par `getUserWithRole`, jamais par
  `getUserFromRequest` seul.
- **Rôle vérifié avant la MFA** dans `getUserWithRole` : un compte d'un autre rôle reçoit 401, jamais une
  invitation à inscrire un facteur.
- `GET /v1/admin/me` et `GET /v1/auth/role` **doivent** répondre en aal1 : sinon l'écran ne sait pas qu'il doit
  demander le code (boucle de déconnexion).
- **Appliquer `0003` avant la mise en ligne des écrans MFA** = espaces clients vides sans erreur.
- **Session de confiance sans facteur** : sans le garde-fou de `mfa_session_ok()` (et d'`isEnrolled` dans
  `mfaState`), retirer son dernier facteur laisserait la confiance ouvrir les données. Ne pas le retirer.
- **Adresses en majuscules** dans la liste blanche : refus silencieux (comparaison exacte) ; la contrainte de
  `0001` l'empêche.
- `deny(request)` dépend du **même objet `request`** que celui passé à `getAdminFromRequest` (WeakMap).
- `audit()` ne lève jamais ; ne pas y mettre de données personnelles effaçables (noms, courriels de clients).
- Ajouter une action à `audit({ action })` sans l'ajouter à `AUDIT_ACTIONS` : `roles.test.mjs` échoue (voulu).
