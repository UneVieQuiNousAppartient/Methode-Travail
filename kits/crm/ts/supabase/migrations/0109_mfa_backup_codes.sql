-- Kit CRM TS (methode-travail) — origine : Vie Solution Web, supabase/setup-crm-vsw.sql (fonction de consommation atomique d'un code de secours), commit 59e389a (2026-10-30) ; généralisé : une ligne par code et par membre (la source gardait une liste unique dans une table de réglages), fonction de remplacement de la série, search_path vide.
--
-- Codes de secours de la double vérification (src/lib/auth/mfa-backup-codes.ts).
--
-- CONTENU
-- 1. public.mfa_backup_codes : une ligne par code. `code_hash` = HMAC-SHA256 hexadécimal du code normalisé
--    (clé = MFA_BACKUP_SECRET, côté serveur) : AUCUN code en clair (contrainte de format). `used_at` posé à
--    l'usage ; la ligne reste (elle prouve que le membre a déjà été inscrit : la double vérification reste exigée
--    même sans facteur). RLS active, aucune politique, aucun droit pour anon ni authenticated.
-- 2. public.consume_mfa_backup_code(p_user, p_hash) → boolean : UNE instruction
--    `update … where used_at is null returning` ; deux appels simultanés avec le même code → un seul `true`
--    (le second attend le verrou de ligne, relit `used_at`, ne trouve plus rien).
-- 3. public.replace_mfa_backup_codes(p_user, p_hashes) → integer : efface toutes les empreintes du membre et
--    écrit la nouvelle série (1 à 20 empreintes au bon format), dans la même transaction.
-- Fonctions `security definer`, search_path vide (noms qualifiés), exécutables par service_role seulement.
--
-- Dépend de 0105 (mfa_trusted_sessions, colonne `reason`) pour la session de récupération, pas pour ce fichier.
-- Idempotente (if not exists / create or replace). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : appliquée projet
-- par projet, à l'installation.
--
-- VÉRIFICATIONS (après application)
--   select relrowsecurity from pg_class where oid = 'public.mfa_backup_codes'::regclass;            -- true
--   select count(*) from pg_policies where tablename = 'mfa_backup_codes';                          -- 0
--   select has_table_privilege('authenticated', 'public.mfa_backup_codes', 'select');              -- false
--   select has_function_privilege('authenticated', 'public.consume_mfa_backup_code(uuid, text)', 'execute'); -- false
--   select proconfig from pg_proc where proname = 'consume_mfa_backup_code';                      -- {search_path=""}
--
-- RETOUR ARRIÈRE
--   drop function if exists public.replace_mfa_backup_codes(uuid, text[]);
--   drop function if exists public.consume_mfa_backup_code(uuid, text);
--   drop table if exists public.mfa_backup_codes;

create table if not exists public.mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create index if not exists mfa_backup_codes_unused_idx
  on public.mfa_backup_codes (user_id)
  where used_at is null;

alter table public.mfa_backup_codes enable row level security;
revoke all on table public.mfa_backup_codes from anon, authenticated;

create or replace function public.consume_mfa_backup_code(p_user uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_user is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update public.mfa_backup_codes
     set used_at = now()
   where user_id = p_user
     and code_hash = p_hash
     and used_at is null
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.replace_mfa_backup_codes(p_user uuid, p_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user is null
     or p_hashes is null
     or cardinality(p_hashes) not between 1 and 20
     or exists (select 1 from unnest(p_hashes) as h(value) where h.value is null or h.value !~ '^[0-9a-f]{64}$')
     or (select count(distinct h.value) from unnest(p_hashes) as h(value)) <> cardinality(p_hashes) then
    raise exception 'replace_mfa_backup_codes : série invalide' using errcode = '22023';
  end if;
  delete from public.mfa_backup_codes where user_id = p_user;
  insert into public.mfa_backup_codes (user_id, code_hash)
  select p_user, h.value from unnest(p_hashes) as h(value);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.consume_mfa_backup_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_mfa_backup_code(uuid, text) to service_role;
revoke all on function public.replace_mfa_backup_codes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.replace_mfa_backup_codes(uuid, text[]) to service_role;
