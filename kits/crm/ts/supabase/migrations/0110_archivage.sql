-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261110_archivage.sql, commit 508f19a (2026-10-30) ; généralisé : leads seulement (rendez-vous en commentaire [à adapter]), vérifications et retour arrière ajoutés, historique retiré.
--
-- Archivage des leads (src/lib/archivage/archivage.ts).
--
-- CONTENU
-- 1. public.leads.archived_at (timestamptz, null = actif). Un lead archivé est masqué des listes de travail (listes,
--    recherche, tableau du jour, compteurs, relances, automatisations), jamais effacé : il reste dans les
--    statistiques, l'export, le journal d'accès, et l'effacement Loi 25 reste possible. Désarchivage : geste de
--    l'admin, ou automatique quand la personne remplit un nouveau formulaire (`doitDesarchiver`).
-- 2. Index partiel sur les leads actifs (les listes de travail lisent presque toujours ce cas).
-- RLS inchangée : colonne ajoutée à une table déjà protégée, lue côté serveur (service_role). Aucune fonction,
-- aucun droit nouveau.
--
-- [à adapter] : la table des demandes s'appelle `public.leads` ici (comme 0102) ; si le projet en a une autre,
-- remplacer le nom partout, ainsi que ARCHIVAGE_TABLES dans garde-archivage.test.ts.
-- [à adapter] Rendez-vous (si le projet les archive aussi ; règle « annulé ou passé » à écrire côté serveur) :
--   alter table public.appointments add column if not exists archived_at timestamptz;
--   create index if not exists appointments_actifs_slot_idx on public.appointments (slot_at desc) where archived_at is null;
--
-- Dépend de : public.leads (table du projet, avec created_at). Idempotente (if not exists). FOURNIE PAR LE KIT,
-- JAMAIS APPLIQUÉE PAR LUI : appliquée projet par projet, à l'installation.
--
-- VÉRIFICATIONS (après application)
--   select data_type from information_schema.columns
--     where table_schema = 'public' and table_name = 'leads' and column_name = 'archived_at';  -- timestamp with time zone
--   select indexdef from pg_indexes where indexname = 'leads_actifs_created_idx';             -- … WHERE (archived_at IS NULL)
--   select relrowsecurity from pg_class where oid = 'public.leads'::regclass;                  -- inchangé (true attendu)
--
-- RETOUR ARRIÈRE (perd l'état d'archivage : les archivés réapparaissent dans les listes)
--   drop index if exists public.leads_actifs_created_idx;
--   alter table public.leads drop column if exists archived_at;

alter table public.leads add column if not exists archived_at timestamptz;

comment on column public.leads.archived_at is
  'Archivé le (null = actif). Masqué des listes de travail, jamais effacé : statistiques, export et effacement le voient.';

create index if not exists leads_actifs_created_idx on public.leads (created_at desc) where archived_at is null;
