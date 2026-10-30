-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20260823_access_logs.sql (table access_logs, RLS, index), commit 508f19a (2026-10-30) ; généralisé : acteur = identifiant du membre et rôle (aucun courriel), sujet et action en colonnes contraintes, chemin sans paramètres d'URL, colonnes de l'ancienne table retirées.
--
-- Journal d'accès Loi 25 (src/lib/audit/subject-access.ts) : qui a ouvert quelle fiche, qui a exporté ou
-- cherché combien de fiches. Identifiants seulement : ni nom, ni courriel, ni contenu, ni texte cherché.
--
-- CONTENU
-- public.subject_access_log :
--   action 'view'   → une fiche (subject_id obligatoire, row_count vide) — une ligne par OUVERTURE de fiche ;
--   action 'export' / 'search' → un nombre de fiches (row_count obligatoire, subject_id vide), jamais une
--   ligne par fiche d'une liste ;
--   path : chemin sans « ? », « # » ni « @ » (contrainte), ou « (chemin masqué) ».
-- Durée de conservation : purge par `purgeSubjectAccessLog(db, mois)` (paramètre obligatoire, [à adapter]).
-- RLS activée SANS politique, aucun droit pour anon ni authenticated : service_role seulement.
--
-- Idempotente (if not exists). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : à appliquer projet par projet.
--
-- VÉRIFICATIONS (après application)
--   select relrowsecurity from pg_class where oid = 'public.subject_access_log'::regclass;        -- true
--   select count(*) from pg_policies where tablename = 'subject_access_log';                     -- 0
--   select has_table_privilege('anon', 'public.subject_access_log', 'select');                   -- false
--   insert into public.subject_access_log (actor_user_id, actor_role, action, subject_type, path)
--     values (gen_random_uuid(), 'admin', 'view', 'lead', '/x?q=a');                              -- refusé
--
-- RETOUR ARRIÈRE (efface le journal : l'exporter d'abord si on doit le conserver)
--   drop table if exists public.subject_access_log;

create table if not exists public.subject_access_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  actor_role text not null
    constraint subject_access_log_actor_role_check check (actor_role ~ '^[a-z_]{1,40}$'),
  action text not null
    constraint subject_access_log_action_check check (action in ('view', 'export', 'search')),
  subject_type text not null
    constraint subject_access_log_subject_type_check check (subject_type ~ '^[a-z_]{1,40}$'),
  subject_id uuid,
  row_count integer
    constraint subject_access_log_row_count_check check (row_count is null or row_count >= 0),
  path text not null
    constraint subject_access_log_path_check check (char_length(path) <= 300 and path !~ '[?#@]'),
  created_at timestamptz not null default now(),
  constraint subject_access_log_shape_check check (
    (action = 'view' and subject_id is not null and row_count is null)
    or (action in ('export', 'search') and subject_id is null and row_count is not null)
  )
);

create index if not exists subject_access_log_created_idx on public.subject_access_log (created_at desc);
create index if not exists subject_access_log_subject_idx on public.subject_access_log (subject_type, subject_id, created_at desc);
create index if not exists subject_access_log_actor_idx on public.subject_access_log (actor_user_id, created_at desc);

alter table public.subject_access_log enable row level security;
revoke all on table public.subject_access_log from anon, authenticated;
