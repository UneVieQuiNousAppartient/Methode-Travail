-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261027_rate_limits.sql, commit 508f19a (2026-10-30) ; généralisé : en-tête réécrit (historique du projet retiré), corps SQL repris tel quel.
--
-- Compteur anti-abus partagé entre les instances Vercel (src/lib/api/abuse-guard.ts).
-- Sans lui, chaque instance compte dans sa propre mémoire : la limite réelle est multipliée par le
-- nombre d'instances chaudes.
--
-- CONTENU
-- 1. public.rate_limit_hits : une ligne par compteur. `key` = empreinte HMAC-SHA256 en hexadécimal,
--    avec un secret serveur : portée + IP (IPv6 ramenée au /64), ou portée + IP + user-agent.
--    Calculée côté serveur : AUCUNE IP, aucun identifiant ni aucune donnée personnelle en clair
--    (contrainte de format). RLS active, aucune politique, aucun droit pour anon ni authenticated.
-- 2. public.hit_rate_limit(p_key, p_limit, p_window_seconds, p_block_seconds) → jsonb
--    {"blocked": bool, "retry_after": int} : même logique que `decideHit`
--    (src/lib/api/rate-limit-core.ts) — le blocage en cours se vérifie avant la fin de fenêtre,
--    une fenêtre échue repart à 1, au-delà de la limite on bloque `p_block_seconds`.
--    Atomique : un seul `insert … on conflict … do update` (verrou de ligne implicite). Fenêtre
--    plafonnée à 1 h (3600 s) pour que la purge ne remette jamais un compteur vivant à zéro.
--    Purge occasionnelle (≈ 1 appel sur 100), BORNÉE à 500 lignes, des lignes dont la fenêtre a
--    commencé il y a plus d'une heure et qui ne sont plus bloquées.
--    `security definer`, search_path fixé, exécutable par service_role seulement.
-- 3. public.purge_rate_limit_hits(p_max) → integer : même purge, par lots de 1 000, au plus p_max
--    lignes (50 000 au maximum), à appeler chaque heure par une tâche planifiée (`purgeSharedCounters`,
--    route protégée par src/lib/cron/auth.ts) : la purge est garantie sans pg_cron.
--
-- Idempotente (if not exists / create or replace). FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI :
-- à appliquer projet par projet, par la personne responsable. Tant qu'elle n'est pas appliquée, le
-- code retombe sur le compteur en mémoire (qui limite quand même) : rien ne casse.

create table if not exists public.rate_limit_hits (
  key text primary key
    constraint rate_limit_hits_key_check check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count integer not null
    constraint rate_limit_hits_count_check check (count >= 0),
  blocked_until timestamptz
);

create index if not exists idx_rate_limit_hits_window_start on public.rate_limit_hits (window_start);

alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from anon, authenticated;

create or replace function public.hit_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row public.rate_limit_hits%rowtype;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'hit_rate_limit: clé invalide (empreinte SHA-256 hexadécimale attendue)';
  end if;
  if p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600
     or p_block_seconds is null or p_block_seconds < 1 or p_block_seconds > 86400 then
    raise exception 'hit_rate_limit: paramètres invalides';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- Purge occasionnelle : fenêtre commencée il y a plus d'une heure (donc échue, la fenêtre étant
  -- plafonnée à 1 h) et blocage terminé.
  if random() < 0.01 then
    delete from public.rate_limit_hits
    where key in (
      select h.key from public.rate_limit_hits h
      where h.window_start < v_now - interval '1 hour'
        and (h.blocked_until is null or h.blocked_until <= v_now)
      limit 500
    );
  end if;

  insert into public.rate_limit_hits as h (key, window_start, count, blocked_until)
  values (p_key, v_now, 1, null)
  on conflict (key) do update set
    -- Toutes les expressions lisent l'ANCIENNE ligne (h.*) : l'ordre des colonnes est sans effet.
    window_start = case
      when h.blocked_until > v_now then h.window_start
      when v_now - h.window_start > v_window then v_now
      else h.window_start
    end,
    count = case
      when h.blocked_until > v_now then h.count
      when v_now - h.window_start > v_window then 1
      else h.count + 1
    end,
    blocked_until = case
      when h.blocked_until > v_now then h.blocked_until
      when v_now - h.window_start > v_window then null
      when h.count + 1 > p_limit then v_now + make_interval(secs => p_block_seconds)
      else null
    end
  returning h.* into v_row;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return jsonb_build_object(
      'blocked', true,
      'retry_after', greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer)
    );
  end if;

  return jsonb_build_object('blocked', false, 'retry_after', 0);
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer, integer) to service_role;

create or replace function public.purge_rate_limit_hits(p_max integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_max integer := least(greatest(coalesce(p_max, 5000), 1), 50000);
  v_batch integer;
  v_total integer := 0;
begin
  loop
    delete from public.rate_limit_hits
    where key in (
      select h.key from public.rate_limit_hits h
      where h.window_start < v_now - interval '1 hour'
        and (h.blocked_until is null or h.blocked_until <= v_now)
      limit least(1000, v_max - v_total)
    );
    get diagnostics v_batch = row_count;
    v_total := v_total + v_batch;
    exit when v_batch = 0 or v_total >= v_max;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.purge_rate_limit_hits(integer) from public, anon, authenticated;
grant execute on function public.purge_rate_limit_hits(integer) to service_role;
