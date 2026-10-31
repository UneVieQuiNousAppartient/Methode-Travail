# Catalogue du kit CRM

Tout ce qu'un CRM, un admin ou un espace client a déjà coûté à construire sur un projet client (oct. 2026 :
Next.js 16 App Router en JavaScript, Supabase — Postgres, Auth, RLS —, Vercel, Resend, Tailwind), rangé par
famille. Chaque brique dit **ce qu'elle fait**, **où elle est**, **ce qu'elle demande** et **ce qu'il reste à
adapter**. Mode d'emploi : `README.md` de ce dossier, puis la skill `nouveau-crm` du modèle.

**Colonne « Kit »** :
- **code** — fournie dans ce dossier, nettoyée, prête à copier (`auth/`, `admin/`, `tests/`), avec son `BRIQUE.md` ;
- **fiche** — décrite ici seulement : la logique et les pièges sont connus, le code est à réécrire pour le
  nouveau projet (trop lié au métier du projet source : séances, tuteurs, diagnostics).

**Colonne « TS »** (tableaux 1, 4, 5 et 8) :
- **code (`ts/`)** — variante TypeScript strict fournie dans `kits/crm/ts/` (lots 1 et 2, depuis 1.5.0), prise
  sur la meilleure de trois sources (projets clients ; voir la ligne d'origine de chaque fichier), avec ses tests
  Vitest ; mode d'emploi dans `ts/BRIQUE.md` ;
- **—** — pas encore en TypeScript (lot 3 et écrans à venir) : partir de la brique JS ou de la fiche.

Les chemins `Source : …` désignent les fichiers d'origine dans le projet source, pour qui y a accès.

---

## 1. Authentification et accès

| Brique | Ce qu'elle fait | Kit | TS | Demande |
|---|---|---|---|---|
| **Liste blanche de l'équipe** | Seules les adresses de `admin_allowlist` entrent dans l'admin, avec un rôle (`admin`, `gestionnaire`, `employe`) ; les autres comptes sont déconnectés. `getAdminFromRequest` (Bearer Supabase) ; `GET /v1/auth/role` sert au routage après connexion. Source : `lib/authServer.js`, `app/v1/auth/role` | code (`auth/`) | code (`ts/`) | table `admin_allowlist` ; `SUPABASE_SERVICE_ROLE_KEY` |
| **Rôles par route** | Matrice méthode + chemin → rôle minimal ; refus en 401 (pas connecté) ou 403 (`{ detail, required_role }`) via `deny(request)` ; l'écran reçoit `permissions` de `GET /v1/admin/me` et **ne recalcule rien**. Source : `lib/roles.js` | code | code (`ts/`) | à adapter : la matrice |
| **Espaces par rôle** | `getUserWithRole(request, "parent" \| "tutor")` : rôle exact lu dans `profiles`, double authentification exigée pour ces rôles. Source : `lib/authServer.js` | code | — | table `profiles (id, role)` |
| **Double authentification (TOTP)** | Supabase gère l'application d'authentification (code QR, `challenge`/`verify`) ; le serveur décide qui doit être en `aal2` (`mfaState`) : tout membre inscrit, tous si `ADMIN_MFA_REQUIRED=1`, toujours pour les rôles listés. `/v1/admin/me` répond toujours, avec `mfa.code`, pour que l'écran affiche le code ou l'inscription. Deux verrous pour les espaces : la base (politiques **restrictives** « aal2 ») et les routes serveur. Source : `lib/mfa.js`, migration `20260930c` | code | code (`ts/`) | `ADMIN_MFA_REQUIRED` |
| **« Se souvenir de cet appareil 30 jours »** | Après un code juste, jeton aléatoire de 32 octets (empreinte SHA-256 seule en base) dans un témoin `httpOnly; Secure; SameSite=Strict; Path=/v1/auth/mfa` ; à la connexion suivante, la session Supabase en cours (`session_id`) devient « session de confiance ». Accepté par le serveur ET par la base (`public.mfa_session_ok()`), jamais à la place d'une inscription (facteur vérifié exigé des deux côtés). Liste « Appareils de confiance », Oublier / Oublier tous. Source : `lib/mfaTrust.js`, `app/v1/auth/mfa/*`, migration `20261021_mfa_trusted_devices` | code | code (`ts/`) | tables `mfa_trusted_devices`, `mfa_trusted_sessions` |
| **Journal d'activité** | `audit({ actor, action, target_type, target_id, meta }, request)` : qui a fait quoi, avec IP, marque des appels faits par un agent ; catalogue fermé des actions (un test échoue si une action n'y est pas). Source : `lib/audit.js` | code | code (`ts/`) | table `admin_audit_log` |
| **Clés d'API** | Clés préfixées (ex. `crm_…`) hachées (jamais stockées en clair), rôle par clé, révocation, dernière utilisation notée au plus une fois par minute ; même `getAdminFromRequest`. Source : `lib/apiKeys.js` | code | — | table `api_keys` |
| **Mot de passe partagé interdit en ligne** | Un code d'accès commun à toute l'équipe n'est accepté qu'en local ; en ligne, chaque membre a son compte. `ts/src/lib/admin/token-mode.ts` | — | code (`ts/`) | `ADMIN_TOKEN_MODE_LOCAL` (local seulement) |
| **Verrou de compte** | Par compte, pas par IP : 10e échec de mot de passe dans l'heure → 1 h ; 5e code faux en 15 min → 15 min. `ts/src/lib/api/account-lock.ts` | — | code (`ts/`) | `rate_limit_hits` (0101) |
| **Codes de secours** | 10 codes à usage unique (empreinte HMAC seule en base, consommation atomique) ; un code accepté ouvre une session d'une heure qui oblige à réinscrire un facteur ; la page qui les reçoit est à écrire **avec** le verrou. `ts/src/lib/auth/mfa-backup-codes.ts` | — | code (`ts/`) | `MFA_BACKUP_SECRET` ; table `mfa_backup_codes` (0109) |
| **Admin d'un seul propriétaire** | Code d'accès + TOTP maison, sans Supabase Auth : pour une seule personne ; limites et ce qu'il faut garder dans `ts/BRIQUE.md` (fiche) | fiche | — | — |
| **Invitation d'un membre** | Ajouter un membre crée son compte et envoie le lien (inscriptions libres fermées : sinon une adresse de la liste blanche reste « dormante » et prenable). Source : `lib/teamInvite.js` | fiche | — | Resend |
| **Comptes créés par l'équipe** | Jamais de compte client pour une adresse de l'équipe ; lien d'accès à usage unique montré une seule fois si le courriel ne part pas ; jamais de mot de passe renvoyé. Source : `lib/accounts.js`, `lib/passwords.js` | fiche | — | — |
| **Jetons pour Claude (MCP OAuth)** | Brancher Claude sur le CRM : jeton d'accès 1 h, jeton de renouvellement 30 jours en rotation, rôle de la clé d'API choisie. Source : `lib/mcpOAuth.js`, `mcp/` | fiche | — | — |
| **Limiteur de débit** | Table + fonction SQL (`rate_limit_hit`) : en serverless, la mémoire d'une instance ne limite rien. Source : `lib/rateLimit.js` | fiche | code (`ts/`) | JS : table `rate_limits` ; TS : `rate_limit_hits` + `hit_rate_limit` (`ts/supabase/migrations/0101`) |
| **Anti-robots** | Cloudflare Turnstile sur les formulaires publics et la connexion par mot de passe. Source : `lib/turnstile.js` | fiche | code (`ts/`) | clés Turnstile |
| **Adresse IP fiable** | Une seule lecture de l'IP : `x-vercel-forwarded-for`, puis `x-real-ip`, puis le premier de `x-forwarded-for` ; sûr derrière Vercel seulement. Source : voir la ligne d'origine du fichier : `src/lib/api/request-ip.ts` | — | code (`ts/`) | — |
| **CSP (observation → actif)** | Politique de sécurité du contenu lue par `next.config` : Report-Only par défaut (`CSP_MODE`), bloquante en `actif`, origine Supabase exacte, jamais `unsafe-eval` sur Vercel, route de rapports sans donnée personnelle. Source : voir la ligne d'origine du fichier | — | code (`ts/`) | `CSP_MODE`, `CSP_EXTRA_ORIGINS` |
| **Redirection interne sûre** | `next=`, `redirect=`, `Referer` : seuls les chemins du site, jugés après résolution (`/.//evil.com` refusé), préfixes autorisés en paramètre ; 404 sur une adresse finie par « \\ ». Source : voir la ligne d'origine du fichier : `src/lib/security/internal-redirect.ts` | — | code (`ts/`) | — |
| **Consentement jamais précoché** | Seul le booléen `true` vaut accord (`consentFromForm`) ; premier contact unique, suivis avec la case facultative ; règle mécanique `consentement-precoche` du modèle (Loi 25, voir aussi famille 6). Source : voir la ligne d'origine du fichier : `src/lib/leads/contact-consent.ts` | — | code (`ts/`) | — |
| **Garde du secret cron** | `Authorization: Bearer $CRON_SECRET` seul, comparé à temps constant ; `?token=` refusé ; secret absent → 401 générique. Source : voir la ligne d'origine du fichier : `src/lib/cron/auth.ts` | — | code (`ts/`) | `CRON_SECRET` |

## 2. Admin (écrans)

| Brique | Ce qu'elle fait | Kit |
|---|---|---|
| **Coquille** | Barre latérale à sections configurables + barre du haut **de même hauteur** (traits alignés), nom de la page en haut, menu mobile, cloche de notifications, bouton Assistant | code (`admin/`) |
| **`apiFetch`** | Ajoute le Bearer Supabase ; 403 de rôle → **un seul** message (identifiant = texte) ; 403 `mfa_required` / `mfa_enrollment_required` → écran du code ou de l'inscription | code |
| **Cartes de confirmation** | `confirmAction(texte, { title, confirmLabel, tone: "danger", typeToConfirm: "supprimer" })` — jamais `window.confirm` ; mot à taper pour une suppression définitive | code |
| **Fiche en page** | `useDetailRoute("lead")` : la fiche remplace la liste (liste gardée montée, filtres et page conservés), a sa propre adresse (`?lead=<id>`), retour du navigateur, « Ouvrir dans un nouvel onglet » | code |
| **Tableaux, chiffres, graphiques** | Tableau triable avec pagination, cartes de chiffres clés, barres et courbes (Recharts), d'après 21st.dev | code |
| **Rafraîchissement après modification** | `refreshAfterChange` : après tout ajout, modification ou suppression (fiche, liste, Kanban, actions groupées, assistant), listes + vues dérivées relues **une fois**, **sans écran de chargement** (`{ quiet: true }`) | code (exemple) + `admin/PATTERNS.md` |
| **Écrans de double authentification** | Code (avec case « 30 jours » cochée), inscription obligatoire (code QR, clé à copier), Paramètres › Sécurité (appareils, appareils de confiance, « Entrer le code maintenant ») ; aussi pour les espaces clients (`SpaceMfaGate`) | code |
| **Assistant avec approbations** | Conversation avec l'IA qui propose des actions ; chaque écriture passe par une carte « Approuver / Refuser » ; réponse perdue = « peut-être exécutée », jamais « en attente ». Source : `components/admin/assistant/`, `app/v1/admin/assistant`, `lib/agent/` | fiche |
| **Notifications** | Cloche, non lues, lien qui ouvre la fiche sans recharger. Source : `components/admin/NotificationsBell.jsx`, `lib/notifications.js` | fiche |
| **Paramètres** | Sous-onglets : entreprise, horaires, modèles de courriels, automatisations, équipe, clés d'API, webhooks, journal, vie privée, sécurité. Source : `components/admin/tabs/SettingsTab.jsx` | fiche |

## 3. Fonctions CRM

| Brique | Ce qu'elle fait | Kit | Source |
|---|---|---|---|
| **Leads** | Étapes (pipeline), note, ville, étiquettes, responsable (notification au responsable), prochaine action, archivage (masqué, jamais effacé), suppression définitive (admin, mot à taper), actions groupées (≤ 200), vues enregistrées | fiche | `app/v1/admin/leads`, `lib/leadFilters.js`, `lib/archivage.js` |
| **Fil d'activité** | Tout ce qui arrive à un lead passe par un seul point (note, appel, courriel, changement d'étape, relance) ; `last_contact_at` = dernier contact **humain** seulement | fiche | `lib/leadActivity.js` |
| **Tâches** | Échéance, responsable, faite / supprimée (journalisée), tâches en retard dans « Aujourd'hui » | fiche | `app/v1/admin/tasks` |
| **Kanban** | Glisser-déposer entre étapes, remis en place si le serveur refuse | fiche | `components/admin/tabs/LeadsTab.jsx` |
| **Import / export CSV** | Séparateur détecté, BOM, `;` pour Excel français ; en-têtes en français ou en clé ; attestation de consentement à l'import | fiche | `lib/csv.js`, `lib/leadCsv.js` |
| **Score** | Règles transparentes 0-100 (pas d'IA) | fiche | `lib/scoring.js` |
| **« Aujourd'hui » (centre d'actions)** | Sections : à rappeler, sans réponse, tâches en retard, rendez-vous du jour… avec action suggérée ; calcul à la demande | fiche | `lib/actionCenter.js` |
| **Analyse du jour par IA** | Priorités du jour + canal à amplifier, une fois par jour, repli déterministe sans IA ; tâches en retard toujours fraîches (leads archivés exclus) | fiche | `lib/recommendations.js` |
| **Réponse prête (speed-to-lead)** | Dès qu'une demande arrive : brouillon de courriel avec vrais créneaux, résumé pour l'appel, tâche, et un lien signé « Envoyer tel quel » | fiche | `lib/speedToLead.js` |
| **IA sur la fiche** | Résumé + action suggérée (en cache tant que rien ne bouge), brouillon de courriel, articles à recommander ; l'IA ne voit que le dossier | fiche | `lib/leadAi.js` |
| **Statistiques** | Jours civils dans le fuseau du client (une demande de 21 h compte ce jour-là), période, prévision par semaine | fiche | `lib/analytics.js`, `lib/adminOverview.js` |
| **Webhooks sortants** | `emitEvent(event, data)` vers Zapier / Make / n8n, signé, reprises par le tick, rétention 30 jours | fiche | `lib/webhooks.js` |
| **Réservations et agenda** | Créneaux libres dans le fuseau du client (changements d'heure), événement Google Agenda + Meet, rattrapage si l'agenda a échoué, OAuth Google avec `state` signé | fiche | `lib/booking.js`, `lib/calendarSync.js`, `lib/googleOAuth.js` |

## 4. Courriels et automatisations

| Brique | Ce qu'elle fait | Kit | TS | Source |
|---|---|---|---|---|
| **Envoi** | Resend côté serveur ; sans clé, aucun envoi et `null` (les appelants le gèrent) | fiche | code (`ts/`) | `lib/email.js` |
| **Modèles éditables** | Corps en texte simple (« # Titre », paragraphes, variables `{prénom}`), défauts dans le code, surcharges en base, « Rétablir par défaut » | fiche | — | `lib/emailTemplates.js` |
| **Moteur de relances (tick)** | Un seul point d'entrée horaire (Vercel Cron avec `CRON_SECRET`, ou boucle en processus) ; verrou `job_locks` contre deux ticks simultanés ; règles = candidats + condition + action, réglables dans l'admin | fiche | — | `lib/tick.js`, `lib/automations.js` |
| **Loi anti-pourriel (LCAP)** | Consentement tacite (6 mois demande, 2 ans client), désabonnement par lien signé HMAC sans table, en-têtes `List-Unsubscribe`, désabonnement appliqué à toutes les fiches de la même adresse ; **testé** | fiche | code (`ts/`) | `lib/lcap.js`, `lib/unsubscribe.js` |
| **Courriels entrants** | Réception par Resend (webhook), rattachement au lead | fiche | — | `lib/inboundEmail.js` |

## 5. Contenu public

| Brique | Ce qu'elle fait | Kit | TS | Source |
|---|---|---|---|---|
| **Articles gérés dans l'admin** | La base fait foi dès qu'elle répond (un article dépublié disparaît partout : liste, page, sitemap, accueil, clavardage) ; le contenu du code ne sert qu'en secours ; `revalidatePath` après chaque changement | fiche | — | `lib/articles.js` |
| **Paramètres publics** | Défauts dans le code, surcharges en base, clés publiques exposées sans authentification (coordonnées, horaires) — jamais une coordonnée écrite en dur | fiche | — | `lib/settings.js` |
| **URL du site** | Une seule source (`NEXT_PUBLIC_SITE_URL`), repli sur l'URL de production Vercel | fiche | code (`ts/`) | `lib/siteUrl.js` |
| **Mesure d'audience** | Rien n'est envoyé avant le consentement ; retrait = effacement | fiche | — | `lib/visitors.js`, `lib/utm.js` |

## 6. Vie privée (Loi 25)

| Brique | Ce qu'elle fait | Kit | TS | Source |
|---|---|---|---|---|
| **Accès et effacement** | Toutes les données d'une personne (fiches, activité, courriels — y compris ceux reçus sans fiche), journalisé ; empreinte du courriel **avant** l'effacement (personne effacée jamais recontactée), adresses de l'équipe exclues. TS : `privacy/privacy.ts`, `effacement.ts` | fiche | code (`ts/`) | `lib/privacy.js`, `app/v1/admin/privacy` ; TS : `PRIVACY_HASH_SECRET`, table `privacy_requests` (0108) |
| **Journal d'accès Loi 25** | Qui a ouvert quelle fiche, quand ; chemin masqué ; purge. TS : `audit/subject-access.ts` | — | code (`ts/`) | table `subject_access_log` (0107) |
| **Conservation limitée** | Purge des demandes sans activité après N mois, empreinte gardée. TS : `privacy/conservation.ts` | — | code (`ts/`) | `RETENTION_MONTHS` (obligatoire) |
| **Archivage** | Archivé = masqué de toutes les listes, jamais effacé ; désarchivage automatique quand la personne revient. TS : `archivage/archivage.ts` | — | code (`ts/`) | colonne `archived_at` (0110, à adapter) |
| **Consentement horodaté** | Texte de consentement versionné, version enregistrée avec chaque demande | fiche | — | `app/v1/leads` |

## 7. IA

| Brique | Ce qu'elle fait | Kit | Source |
|---|---|---|---|
| **Registre des tâches IA** | `aiText / aiJson / aiStream` ; une tâche = un prompt dans `lib/ai/prompts/` + une ligne du registre (fournisseur et modèle réglables par variable d'environnement) ; jamais un SDK appelé depuis une route | fiche | `lib/ai/` |

## 8. Tests et contrôles

| Brique | Ce qu'elle fait | Kit | TS |
|---|---|---|---|
| **Faux Supabase en mémoire** | `createFakeSupabase(tables, { fail })` : select / insert / update / upsert / delete, filtres, `maybeSingle`, erreurs simulées (ex. `23505`), lectures et écritures notées | code (`tests/`) || code (`ts/`, `src/test-support/fake-supabase.ts` : filtres réellement appliqués, `!inner`, RPC, Auth MFA simulée) |
| **Loaders** | Alias `@/` et remplacement de `@/lib/supabaseAdmin` par le faux, pour tester les routes de bout en bout sans réseau | code | — |
| **Harnais de simulation de l'admin réel** | Build avec un Supabase fictif, Playwright intercepte Auth et `/v1/**` (faux serveur à état, échecs 500 / refus 403 à la demande, journal des appels) : chaque action jouée en échec, en refus puis en réussite | code | — |
| **Santé + battement du tick** | Battement enregistré à chaque tick ; verdicts purs (tick en retard ou jamais passé = panne, variables manquantes, secret cron court, mode jeton, MFA, base) pour une route de santé réservée au rang `admin`. TS : `health/heartbeat.ts`, `verdict.ts` | — | code (`ts/`) |
| **Contrôle après déploiement (smoke)** | Pages publiques, routes, en-têtes, et contrôles admin avec une clé d'API. Source : `scripts/smoke.mjs` | fiche | — |
| **Contrat d'API** | Toute route de `app/v1` doit être dans `docs/API.md`. Source : `scripts/check-api-doc.mjs` | fiche | — |
| **Tests du kit TS** | Vitest + `tsc --noEmit` strict, tests colocalisés `*.test.ts`, base simulée par `vi.mock` ; lancés hors projet (`ts/BRIQUE.md`) | — | code (`ts/`) |

---

**À ne pas reprendre tel quel** : les textes, prix, coordonnées, témoignages et politiques du projet source (règle
« rien que le client n'a pas dit ») ; les écrans publics (propres à chaque client) ; les séances, tuteurs et
candidatures (métier du projet source, à repenser pour chaque projet).
