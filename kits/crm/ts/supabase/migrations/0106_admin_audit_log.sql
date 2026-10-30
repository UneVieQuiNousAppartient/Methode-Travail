-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261108_integrations.sql (l. 28-47 : admin_audit_log, 3 index, RLS, revoke), commit 508f19a (2026-10-30) ; généralisé : tables des clés d'API et de la connexion d'agents retirées, acteur sans courriel (contrainte de format), rôle de l'acteur, action et meta contraintes.
--
-- Journal des actions de l'administration (src/lib/audit/admin-audit.ts). Qui a fait quoi, sur quoi.
--
-- CONTENU
-- public.admin_audit_log : une ligne par action réussie.
--   actor      : « member:<uuid> » ou « system:<nom> » (contrainte) — JAMAIS un courriel ;
--   actor_role : rôle du membre au moment de l'action (null pour une tâche planifiée) ;
--   action     : action du catalogue fermé (AUDIT_ACTIONS, vérifié côté serveur ; ici : format seulement,
--                pour qu'un projet ajoute ses actions sans migration) ;
--   meta       : objet JSON filtré côté serveur (aucune clé courriel / jeton / secret / mot de passe / code).
-- RLS activée SANS politique, aucun droit pour anon ni authenticated : lecture et écriture par service_role
-- seulement (routes serveur de l'administration).
--
-- Idempotente (if not exists). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : à appliquer projet par projet.
--
-- VÉRIFICATIONS (après application)
--   select relrowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass;          -- true
--   select count(*) from pg_policies where tablename = 'admin_audit_log';                       -- 0
--   select has_table_privilege('anon', 'public.admin_audit_log', 'select'),
--          has_table_privilege('authenticated', 'public.admin_audit_log', 'insert');            -- false, false
--   insert into public.admin_audit_log (actor, action) values ('quelqu.un@exemple.test', 'auth.login'); -- refusé (format)
--
-- RETOUR ARRIÈRE (efface le journal : l'exporter d'abord si on doit le conserver)
--   drop table if exists public.admin_audit_log;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor text not null
    constraint admin_audit_log_actor_check
    check (actor ~ '^(member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|system:[a-z0-9_-]{1,60})$'),
  actor_role text
    constraint admin_audit_log_actor_role_check check (actor_role is null or actor_role ~ '^[a-z_]{1,40}$'),
  action text not null
    constraint admin_audit_log_action_check check (action ~ '^[a-z_]{1,30}\.[a-z_]{1,40}$'),
  target_type text
    constraint admin_audit_log_target_type_check check (target_type is null or char_length(target_type) <= 40),
  target_id text
    constraint admin_audit_log_target_id_check check (target_id is null or char_length(target_id) <= 100),
  meta jsonb not null default '{}'::jsonb
    constraint admin_audit_log_meta_check check (jsonb_typeof(meta) = 'object'),
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor, created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
