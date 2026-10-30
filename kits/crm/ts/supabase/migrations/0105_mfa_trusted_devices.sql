-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261109_mfa_trusted_devices.sql (tables, RLS, revoke), commit 508f19a (2026-10-30) + kit CRM JS (methode-travail), kits/crm/auth/supabase/migrations/0004_mfa_trusted_devices.sql (public.mfa_session_ok), commit 545da4e (2026-10-21) ; généralisé : colonne `reason` ('device' | 'backup_code') et clé (user_id, session_id, reason) pour la session de récupération des codes de secours, seule « device » rend une session de confiance ; politique modifiée seulement si elle existe (bloc DO).
--
-- APPLIQUER 0104 AVANT 0105 (cette migration modifie la politique posée par 0104).
--
-- « Se souvenir de cet appareil pendant 30 jours » (src/lib/auth/mfa-trust.ts) :
--   1. après un code juste (session aal2), case cochée : une ligne dans mfa_trusted_devices (empreinte SHA-256
--      d'un jeton aléatoire de 32 octets, jamais le jeton) et un témoin httpOnly « <id>.<jeton> » (chemin des
--      routes MFA, SameSite=Strict), valable 30 jours ;
--   2. connexion suivante sur cet appareil (session aal1, facteur inscrit) : le témoin est présenté ; s'il est
--      valide pour CE compte, la session Supabase en cours (claim session_id) est inscrite dans
--      mfa_trusted_sessions avec reason = 'device', jusqu'à l'échéance de l'appareil ;
--   3. le serveur (src/lib/auth/team-session.ts) et la base (public.mfa_session_ok()) acceptent alors
--      « aal2 OU session de confiance », et seulement si le compte a encore un facteur vérifié.
--
-- Session de récupération (codes de secours, src/lib/auth/mfa-backup-codes.ts et 0109) : une ligne
-- reason = 'backup_code' (device_id null permis), valable une heure, sert UNIQUEMENT à réinscrire un facteur.
-- Elle ne satisfait JAMAIS la double vérification, ni côté serveur ni dans mfa_session_ok().
--
-- Retrait : « Oublier cet appareil » / « Oublier tous les appareils » (revoked_at) ; supprimer le compte efface
-- tout (on delete cascade). Aucune politique sur les deux tables : lues et écrites par le serveur seulement
-- (service_role), et par mfa_session_ok() (security definer).
--
-- Idempotente (if not exists, drop … if exists). Prévue pour un projet neuf : une table mfa_trusted_sessions
-- d'une autre forme (clé session_id seule, sans reason) doit être migrée à la main avant.
-- NON APPLIQUÉE par le kit.
--
-- Vérification (lecture seule) — attendu : qual = (SELECT mfa_session_ok() AS mfa_session_ok) pour chaque table protégée :
--   select tablename, permissive, qual from pg_policies
--    where schemaname = 'public' and policyname = 'authenticated requires aal2' order by 1;
-- Vérification de la fonction — attendu : prosecdef = true, proconfig = {search_path=""} :
--   select prosecdef, proconfig from pg_proc where oid = 'public.mfa_session_ok()'::regprocedure;
-- Utilisateur simulé (transaction annulée, comme dans 0104) : aal1 ordinaire → 0 ; session de confiance
-- (device) → 1 ; aal2 → 1 ; appareil retiré → 0 ; ligne backup_code seule → 0 ; compte sans facteur vérifié → 0 ;
-- lecture directe des deux tables depuis « authenticated » → « permission denied ».
--
-- Retour arrière (urgence) — reprend la règle de 0104 (aal2 seulement), pour chaque table :
--   alter policy "authenticated requires aal2" on public.<table>
--       using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

create table if not exists public.mfa_trusted_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    token_hash text not null unique,
    label text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_used_at timestamptz,
    revoked_at timestamptz
);
create index if not exists mfa_trusted_devices_user_idx on public.mfa_trusted_devices (user_id);
alter table public.mfa_trusted_devices enable row level security;

create table if not exists public.mfa_trusted_sessions (
    user_id uuid not null references auth.users (id) on delete cascade,
    session_id uuid not null,
    reason text not null default 'device',
    device_id uuid references public.mfa_trusted_devices (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    primary key (user_id, session_id, reason)
);
alter table public.mfa_trusted_sessions drop constraint if exists mfa_trusted_sessions_reason_check;
alter table public.mfa_trusted_sessions add constraint mfa_trusted_sessions_reason_check
    check (reason in ('device', 'backup_code'));
-- Un appareil est obligatoire pour une session « device » ; seule une session « backup_code » peut s'en passer.
alter table public.mfa_trusted_sessions drop constraint if exists mfa_trusted_sessions_device_check;
alter table public.mfa_trusted_sessions add constraint mfa_trusted_sessions_device_check
    check (device_id is not null or reason = 'backup_code');
create index if not exists mfa_trusted_sessions_session_idx on public.mfa_trusted_sessions (session_id);
create index if not exists mfa_trusted_sessions_device_idx on public.mfa_trusted_sessions (device_id);
create index if not exists mfa_trusted_sessions_expires_idx on public.mfa_trusted_sessions (expires_at);
alter table public.mfa_trusted_sessions enable row level security;

-- Double vérification satisfaite pour la requête en cours : session aal2, OU session de confiance d'un APPAREIL
-- (reason = 'device', appareil du même compte, non retiré, échéances non passées) d'un compte qui a encore un
-- facteur vérifié. Une ligne 'backup_code' n'ouvre rien. security definer : lit les deux tables sans politique ;
-- search_path vide : noms complets partout.
create or replace function public.mfa_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
        or (
            exists (
                select 1
                  from public.mfa_trusted_sessions s
                  join public.mfa_trusted_devices d on d.id = s.device_id
                 where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                   and s.user_id = auth.uid()
                   and s.reason = 'device'
                   and s.expires_at > now()
                   and d.user_id = auth.uid()
                   and d.revoked_at is null
                   and d.expires_at > now()
            )
            -- La confiance remplace le code, jamais l'inscription : sans facteur vérifié, elle ne compte pas.
            and exists (
                select 1 from auth.mfa_factors f
                 where f.user_id = auth.uid() and f.status = 'verified'
            )
        );
$$;
revoke all on function public.mfa_session_ok() from public, anon;
grant execute on function public.mfa_session_ok() to authenticated;

-- Défense en profondeur : RLS sans politique ferme déjà ces tables ; aucun droit non plus (refus explicite).
revoke all on public.mfa_trusted_devices from anon, authenticated;
revoke all on public.mfa_trusted_sessions from anon, authenticated;

-- La politique restrictive de 0104 accepte désormais aussi une session de confiance. « alter policy » (pas
-- drop + create) : même politique, seule la condition change, sans instant sans règle.
do $$
begin
    if exists (
        select 1 from pg_policies
         where schemaname = 'public' and tablename = 'profiles' and policyname = 'authenticated requires aal2'
    ) then
        alter policy "authenticated requires aal2" on public.profiles
            using ((select public.mfa_session_ok())) with check ((select public.mfa_session_ok()));
    end if;
end
$$;
-- [à adapter] Même ligne pour chaque autre table protégée dans 0104 :
-- alter policy "authenticated requires aal2" on public.<table>
--     using ((select public.mfa_session_ok())) with check ((select public.mfa_session_ok()));
