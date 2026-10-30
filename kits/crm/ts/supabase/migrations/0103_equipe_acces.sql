-- Kit CRM TS (methode-travail) — origine : kit CRM JS (methode-travail), kits/crm/auth/supabase/migrations/0001_equipe_acces.sql (liste blanche seulement), commit 545da4e (2026-10-21) ; généralisé : table renommée team_allowlist, aucun rôle par défaut (la source donnait « admin » à toute ligne sans rôle), journal et clés d'API retirés (journal : 0106 ; clés d'API : hors périmètre du kit TS).
--
-- Liste blanche de l'équipe : une adresse = un membre, avec son rôle (src/lib/auth/team-session.ts).
-- Le serveur compare À L'IDENTIQUE le courriel de Supabase Auth, mis en minuscules, à la colonne `email` :
-- la contrainte ci-dessous garde la table en minuscules, sans espaces autour.
-- Les rôles doivent rester identiques à ROLES de src/lib/authz/roles.ts (rang : employe < gestionnaire < admin).
--
-- Accès : serveur seulement (service_role). RLS activée SANS politique, et tout droit retiré à `anon` et
-- `authenticated` (défense en profondeur).
--
-- Idempotente (rejouable). NON APPLIQUÉE par le kit : à appliquer dans le projet, avant la mise en ligne de l'admin.
--
-- Vérification (lecture seule) — attendu : rowsecurity = true ; aucune ligne dans pg_policies ; aucun droit pour anon/authenticated :
--   select relrowsecurity from pg_class where oid = 'public.team_allowlist'::regclass;
--   select * from pg_policies where schemaname = 'public' and tablename = 'team_allowlist';
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'team_allowlist' and grantee in ('anon', 'authenticated');
--
-- Retour arrière (aucune donnée ailleurs n'en dépend) :
--   drop table if exists public.team_allowlist;

create table if not exists public.team_allowlist (
    email text primary key,
    role text not null,
    name text,
    added_by uuid,
    created_at timestamptz not null default now()
);

-- Adresses en minuscules et non vides.
alter table public.team_allowlist drop constraint if exists team_allowlist_email_normalized;
alter table public.team_allowlist add constraint team_allowlist_email_normalized
    check (email = lower(btrim(email)) and email <> '');

alter table public.team_allowlist drop constraint if exists team_allowlist_role_check;
alter table public.team_allowlist add constraint team_allowlist_role_check
    check (role in ('employe', 'gestionnaire', 'admin'));

alter table public.team_allowlist enable row level security;

-- Défense en profondeur : RLS sans politique ferme déjà la table ; aucun droit non plus (refus explicite).
revoke all on public.team_allowlist from anon, authenticated;

-- [à adapter] Premier administrateur (adresse en minuscules), puis gérer l'équipe depuis l'admin :
-- insert into public.team_allowlist (email, role, name) values ('admin@exemple.test', 'admin', 'Administrateur')
-- on conflict (email) do nothing;
