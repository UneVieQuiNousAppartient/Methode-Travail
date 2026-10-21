-- Kit CRM (methode-travail) — origine : KHI Educ, supabase/schema.sql (liste blanche, journal, clés d'API), oct. 2026. À adapter : voir BRIQUE.md.
-- Accès de l'équipe : liste blanche avec rôle, journal d'activité, clés d'API.
-- Idempotente (rejouable). Aucune politique RLS : ces tables ne sont lues et écrites que par le serveur
-- (service_role, lib/authServer.js, lib/audit.js) ; RLS activée sans politique = fermées au navigateur.
-- Les rôles ('admin', 'gestionnaire', 'employe') doivent rester identiques à ROLES de lib/roles.js.

-- Liste blanche de l'équipe : une adresse = un membre, avec son rôle.
create table if not exists public.admin_allowlist (
    email text primary key
);
alter table public.admin_allowlist
    add column if not exists role text not null default 'admin',
    add column if not exists name text,
    add column if not exists added_by text,
    add column if not exists added_at timestamptz not null default now();
alter table public.admin_allowlist drop constraint if exists admin_allowlist_role_check;
alter table public.admin_allowlist add constraint admin_allowlist_role_check
    check (role in ('admin', 'gestionnaire', 'employe'));
-- Adresses en minuscules : le serveur compare à l'identique avec l'adresse de Supabase Auth.
update public.admin_allowlist set email = lower(btrim(email)) where email <> lower(btrim(email));
alter table public.admin_allowlist drop constraint if exists admin_allowlist_email_normalized;
alter table public.admin_allowlist add constraint admin_allowlist_email_normalized check (email = lower(btrim(email)));
alter table public.admin_allowlist enable row level security;

-- Premier administrateur (à remplacer, puis gérer l'équipe depuis l'admin) :
-- insert into public.admin_allowlist (email, role, name) values ('admin@exemple.ca', 'admin', 'Administrateur')
-- on conflict (email) do nothing;

-- Journal d'activité de l'équipe (lib/audit.js).
create table if not exists public.admin_audit_log (
    id bigint generated always as identity primary key,
    actor text not null,
    action text not null,
    target_type text,
    target_id text,
    meta jsonb not null default '{}',
    ip text,
    created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor, created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);
alter table public.admin_audit_log enable row level security;

-- Clés d'API (lib/apiKeys.js) : seul le haché SHA-256 est stocké ; prefix = début affichable.
create table if not exists public.api_keys (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    prefix text not null,
    key_hash text not null unique,
    role text not null default 'gestionnaire' check (role in ('admin', 'gestionnaire', 'employe')),
    created_by text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);
alter table public.api_keys enable row level security;

-- Défense en profondeur : aucun droit pour les rôles du navigateur.
revoke all on public.admin_allowlist from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.api_keys from anon, authenticated;
