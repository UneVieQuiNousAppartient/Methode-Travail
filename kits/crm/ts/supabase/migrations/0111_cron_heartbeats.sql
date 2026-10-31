-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261111_cron_heartbeats.sql, commit 508f19a (2026-10-30) ; généralisé : contrainte de longueur sur last_error, vérifications et retour arrière ajoutés, historique retiré.
--
-- Dernier passage des tâches planifiées (src/lib/health/heartbeat.ts), lu par le point de santé (verdict.ts).
--
-- CONTENU
-- 1. public.cron_heartbeats : une ligne par tâche (`name`, ex. `tick`), écrasée à chaque passage : heure de début,
--    heure de fin, résultat, message d'erreur court et générique (jamais de donnée personnelle, 200 caractères au
--    plus). Un verrou de tâche supprimé en fin de passage ne garde rien : c'est ici que le passage laisse sa trace.
--    Aucune donnée de client.
-- 2. RLS activée SANS politique, aucun droit pour anon ni authenticated : lue et écrite côté serveur seulement
--    (service_role). Aucune fonction.
--
-- Idempotente (if not exists). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : appliquée projet par projet, à
-- l'installation.
--
-- VÉRIFICATIONS (après application)
--   select relrowsecurity from pg_class where oid = 'public.cron_heartbeats'::regclass;            -- true
--   select count(*) from pg_policies where tablename = 'cron_heartbeats';                         -- 0
--   select has_table_privilege('anon', 'public.cron_heartbeats', 'select');                       -- false
--   select has_table_privilege('authenticated', 'public.cron_heartbeats', 'select');              -- false
--
-- RETOUR ARRIÈRE (le point de santé affiche alors « vérification impossible » pour les automatisations)
--   drop table if exists public.cron_heartbeats;

create table if not exists public.cron_heartbeats (
  name text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_ok boolean,
  last_error text check (last_error is null or char_length(last_error) <= 200)
);

alter table public.cron_heartbeats enable row level security;
revoke all on public.cron_heartbeats from anon, authenticated;
