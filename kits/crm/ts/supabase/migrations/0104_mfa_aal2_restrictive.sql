-- Kit CRM TS (methode-travail) — origine : kit CRM JS (methode-travail), kits/crm/auth/supabase/migrations/0003_mfa_aal2_restrictive.sql, commit 545da4e (2026-10-21) ; généralisé : politique posée seulement si la table d'exemple existe (bloc DO), renvois vers les fichiers du kit TS ; règle, vérifications et retour arrière repris.
--
-- Double vérification exigée PAR LA BASE pour les tables que le NAVIGATEUR lit avec le jeton de l'utilisateur
-- (rôle `authenticated`) : sans session « aal2 », la base ne renvoie aucune ligne. Exemple sur `profiles`
-- [à adapter] : reproduire le bloc pour CHAQUE table lue par le navigateur avec le jeton de l'utilisateur.
-- 0105_mfa_trusted_devices.sql l'élargit ensuite à « aal2 OU session de confiance » : APPLIQUER 0104 AVANT 0105.
--
-- L'admin de l'équipe lit la base côté serveur (service_role, qui contourne la RLS) : là, l'exigence est faite
-- par le code serveur (src/lib/auth/team-session.ts). Cette migration ne concerne que les lectures du navigateur.
--
-- Ordre de mise en production : APRÈS la mise en ligne de l'écran qui fait inscrire le facteur puis demande le
-- code. Appliquée avant, un utilisateur en session aal1 voit un espace vide (0 ligne, sans erreur).
--
-- Pourquoi une politique RESTRICTIVE : les politiques permissives d'une table s'additionnent (OU) ; une
-- restrictive s'applique en ET à toutes. Une seule par table suffit, et les politiques en place ne changent pas.
-- « for all » + « with check » : couvre d'office toute politique d'écriture ajoutée plus tard.
-- « (select auth.jwt() ->> 'aal') » : évalué une fois par requête (initPlan), pas à chaque ligne.
--
-- Non concernés :
--   - anon : aucune politique ne lui ouvre ces tables (auth.uid() est null) ;
--   - service_role (contourne la RLS) : routes serveur — d'où le second verrou côté serveur.
-- Une politique qui lit une autre table dans une sous-requête est elle-même soumise à cette règle : en aal1 elle
-- ne trouve rien — refus cohérent.
--
-- Idempotente. NON APPLIQUÉE par le kit.
--
-- Vérification 1 (lecture seule) — attendu : une ligne par table, RESTRICTIVE, {authenticated}, ALL :
--   select tablename, policyname, permissive, roles, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and policyname = 'authenticated requires aal2'
--    order by tablename;
-- Vérification 2 (utilisateur simulé, transaction annulée ; éditeur SQL, rôle postgres) — attendu : aal1 → 0 ; aal2 → 1.
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

do $$
begin
    if to_regclass('public.profiles') is not null then
        drop policy if exists "authenticated requires aal2" on public.profiles;
        create policy "authenticated requires aal2" on public.profiles
            as restrictive
            for all
            to authenticated
            using ((select auth.jwt() ->> 'aal') = 'aal2')
            with check ((select auth.jwt() ->> 'aal') = 'aal2');
    end if;
end
$$;

-- Même bloc pour chaque autre table lue par le navigateur, par exemple :
-- drop policy if exists "authenticated requires aal2" on public.<table>;
-- create policy "authenticated requires aal2" on public.<table>
--     as restrictive for all to authenticated
--     using ((select auth.jwt() ->> 'aal') = 'aal2')
--     with check ((select auth.jwt() ->> 'aal') = 'aal2');
