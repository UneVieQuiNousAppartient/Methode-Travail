-- Kit CRM (methode-travail) — origine : KHI Educ, supabase/migrations/20260930c_mfa_parents_tutors.sql, oct. 2026. À adapter : voir BRIQUE.md.
-- Double authentification OBLIGATOIRE des espaces clients : la base refuse leurs données sans session
-- « aal2 ». Exemple sur profiles : reproduire le bloc pour CHAQUE table que le navigateur lit avec le
-- jeton de l'utilisateur (le test tests/unit/mfa.test.mjs vérifie la présence de la politique ici).
-- Idempotente. 0004_mfa_trusted_devices.sql l'élargit ensuite à « aal2 OU session de confiance ».
--
-- Ordre de mise en production : APRÈS la mise en ligne de l'écran qui fait inscrire le facteur à la
-- première connexion (supabase.auth.mfa.enroll) puis demande le code (challenge + verify). Appliquée
-- avant, un client en session aal1 voit un espace vide (0 ligne, sans erreur) sans moyen d'atteindre aal2.
--
-- Pourquoi des politiques RESTRICTIVES : les politiques permissives d'une table s'additionnent (OU) ;
-- une restrictive s'applique en ET à toutes. Une seule par table suffit, et les politiques en place
-- (qui choisissent les lignes de l'utilisateur) ne changent pas. « for all » + « with check » : couvre
-- d'office toute politique d'écriture ajoutée plus tard. « (select auth.jwt() ->> 'aal') » : évalué une
-- fois par requête (initPlan), pas à chaque ligne.
--
-- Non concernés :
--   - anon : aucune politique ne lui ouvre ces tables (auth.uid() est null) ;
--   - service_role (contourne RLS) : routes serveur — d'où le second verrou, getUserWithRole
--     (lib/authServer.js), et GET /v1/auth/role qui doit répondre en aal1 (routage après connexion) ;
--   - l'équipe : « authenticated » aussi, mais passe par l'API /v1/admin/** (ADMIN_MFA_REQUIRED, lib/mfa.js).
-- Une politique qui lit une autre table dans une sous-requête (ex. « lignes dont le courriel = celui de mon
-- profil ») est elle-même soumise à cette règle : en aal1 elle ne trouve rien — refus cohérent.
--
-- Vérification 1 (lecture seule) — attendu : une ligne par table, RESTRICTIVE, {authenticated}, ALL :
--   select tablename, policyname, permissive, roles, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and policyname = 'authenticated requires aal2'
--    order by tablename;
-- Vérification 2 (utilisateur simulé, transaction annulée ; SQL Editor, rôle postgres) — attendu : aal1 → 0 ; aal2 → 1.
--   begin;
--   select set_config('test.user', (select id::text from public.profiles order by created_at limit 1), true);
--   select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user'), 'role', 'authenticated', 'aal', 'aal1')::text, true);
--   set local role authenticated;
--   select count(*) from public.profiles;
--   select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.user'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
--   select count(*) from public.profiles;
--   rollback;
--
-- Retour arrière (urgence : espaces inaccessibles) — les politiques existantes reprennent seules :
--   drop policy if exists "authenticated requires aal2" on public.profiles;

drop policy if exists "authenticated requires aal2" on public.profiles;
create policy "authenticated requires aal2" on public.profiles
    as restrictive
    for all
    to authenticated
    using ((select auth.jwt() ->> 'aal') = 'aal2')
    with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- Même bloc pour chaque autre table lue par le navigateur, par exemple :
-- drop policy if exists "authenticated requires aal2" on public.<table>;
-- create policy "authenticated requires aal2" on public.<table>
--     as restrictive for all to authenticated
--     using ((select auth.jwt() ->> 'aal') = 'aal2')
--     with check ((select auth.jwt() ->> 'aal') = 'aal2');
