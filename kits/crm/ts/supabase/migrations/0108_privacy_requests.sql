-- Kit CRM TS (methode-travail) — origine : KHI Educ, app/v1/admin/privacy/route.js (registre privacy_requests : kind, email_hash, summary), commit 1a02685 (2026-10-30) + Vie Solution Web, src/lib/crm/effacement.ts (une empreinte par adresse effacée, statut, identifiant de clé), commit 59e389a (2026-10-30) ; généralisé : table sans préfixe, acteur sans courriel (contrainte), empreinte HMAC contrainte, index unique par adresse effacée.
--
-- Registre des demandes Loi 25 (src/lib/privacy/effacement.ts) : accès et effacement.
-- JAMAIS le courriel : seulement son EMPREINTE (HMAC-SHA256, secret PRIVACY_HASH_SECRET ou UNSUBSCRIBE_SECRET,
-- 64 caractères hexadécimaux, contrainte). L'empreinte d'une adresse effacée reste pour ne plus jamais lui écrire.
--
-- CONTENU
-- public.privacy_requests (kind 'access' | 'erase', email_hash, actor, summary, created_at) ;
--   actor   : « member:<uuid> » ou « system:<nom> » (contrainte), jamais un courriel ;
--   summary : objet JSON — statut (in_progress / partial / done), identifiant court de la clé, nombres de
--             lignes par table ; jamais de contenu.
-- Index unique partiel : UNE ligne 'erase' par empreinte (une relance de l'effacement la réutilise).
-- RLS activée SANS politique, aucun droit pour anon ni authenticated : service_role seulement.
--
-- Idempotente (if not exists). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : à appliquer projet par projet.
--
-- VÉRIFICATIONS (après application)
--   select relrowsecurity from pg_class where oid = 'public.privacy_requests'::regclass;          -- true
--   select count(*) from pg_policies where tablename = 'privacy_requests';                       -- 0
--   select has_table_privilege('authenticated', 'public.privacy_requests', 'select');            -- false
--   insert into public.privacy_requests (kind, email_hash, actor)
--     values ('erase', 'quelqu.un@exemple.test', 'system:test');                                  -- refusé (format)
--
-- RETOUR ARRIÈRE — ATTENTION : supprimer cette table perd les empreintes des personnes effacées, qui
-- recevraient de nouveau des relances si leur adresse revenait. Exporter les empreintes d'abord.
--   drop table if exists public.privacy_requests;

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint privacy_requests_kind_check check (kind in ('access', 'erase')),
  email_hash text not null
    constraint privacy_requests_email_hash_check check (email_hash ~ '^[0-9a-f]{64}$'),
  actor text not null
    constraint privacy_requests_actor_check
    check (actor ~ '^(member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|system:[a-z0-9_-]{1,60})$'),
  summary jsonb not null default '{}'::jsonb
    constraint privacy_requests_summary_check check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now()
);

create unique index if not exists privacy_requests_erase_hash_uidx on public.privacy_requests (email_hash) where kind = 'erase';
create index if not exists privacy_requests_created_idx on public.privacy_requests (created_at desc);

alter table public.privacy_requests enable row level security;
revoke all on table public.privacy_requests from anon, authenticated;
