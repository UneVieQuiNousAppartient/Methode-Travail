-- Kit CRM (methode-travail) — origine : KHI Educ, supabase/schema.sql (profiles), oct. 2026. À adapter : voir BRIQUE.md.
-- Profils des comptes des espaces clients (hors équipe) et leur rôle, lu par getUserWithRole
-- (lib/authServer.js) et GET /v1/auth/role. Idempotente.
-- Rôles d'exemple ('parent', 'tutor') : à remplacer par ceux du projet, ET dans MFA_ALWAYS_ROLES (lib/mfa.js).
--
-- Point d'extension : la création du profil à l'inscription (déclencheur after insert on auth.users,
-- security definer) est propre à chaque projet. Règle à garder : un membre de l'équipe (adresse dans
-- admin_allowlist) ne reçoit PAS de profil client.

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    full_name text not null default '',
    role text not null default 'parent',
    created_at timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('parent', 'tutor'));
alter table public.profiles enable row level security;

-- Chacun lit son propre profil (navigateur, clé anon + jeton de l'utilisateur). Aucune politique
-- d'écriture : le rôle ne se change que côté serveur.
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
    for select using ((select auth.uid()) = id);
