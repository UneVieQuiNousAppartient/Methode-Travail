-- Kit CRM (methode-travail) — origine : KHI Educ, supabase/migrations/20261021_mfa_trusted_devices.sql (version finale, facteur exigé), oct. 2026. À adapter : voir BRIQUE.md.
-- Appareils de confiance de la double authentification — « se souvenir de cet appareil pendant 30 jours »
-- pour l'équipe et les espaces clients. Idempotente. À appliquer APRÈS 0003 (elle modifie ses politiques).
--
-- Principe (lib/mfaTrust.js) :
--   1. après un code juste (session aal2), case cochée : POST /v1/auth/mfa/trust crée une ligne dans
--      mfa_trusted_devices (empreinte SHA-256 d'un jeton aléatoire de 32 octets, jamais le jeton) et pose
--      le témoin httpOnly TRUST_COOKIE (= <id>.<jeton>), valable 30 jours ;
--   2. connexion suivante sur cet appareil (session aal1, facteur inscrit) : POST /v1/auth/mfa/trusted-session
--      présente le témoin ; s'il est valide pour CE compte, la session Supabase en cours (claim session_id du
--      jeton) est inscrite dans mfa_trusted_sessions jusqu'à l'échéance de l'appareil ;
--   3. la base (public.mfa_session_ok(), ci-dessous) et le serveur (lib/authServer.js) acceptent alors
--      « aal2 OU session de confiance ». Le témoin seul n'ouvre rien : il faut aussi le mot de passe (ou Google)
--      du compte, et la confiance ne vaut que pour la session ouverte sur l'appareil qui l'a présenté.
-- Retrait : « Oublier cet appareil » / « Oublier tous les appareils » (revoked_at) ; supprimer le compte efface
-- tout (on delete cascade). Aucune politique sur les deux tables : lues et écrites par le serveur seulement
-- (service_role), et par mfa_session_ok() (security definer).
--
-- Retour arrière (urgence) — reprend la règle de 0003 (aal2 seulement), pour chaque table :
--   alter policy "authenticated requires aal2" on public.<table>
--       using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');
--
-- Vérification (lecture seule) — attendu : une ligne par table, RESTRICTIVE, qual = (SELECT mfa_session_ok() AS mfa_session_ok) :
--   select tablename, permissive, qual from pg_policies
--    where schemaname = 'public' and policyname = 'authenticated requires aal2' order by 1;
-- Vérification sur un utilisateur simulé (transaction annulée, comme dans 0003) : session aal1 ordinaire → 0 ;
-- session de confiance → 1 ; aal2 → 1 ; appareil retiré → 0 ; session de confiance d'un compte sans facteur
-- vérifié → 0 ; lecture directe des deux tables depuis « authenticated » → « permission denied ».

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
    session_id uuid primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    device_id uuid not null references public.mfa_trusted_devices (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
create index if not exists mfa_trusted_sessions_user_idx on public.mfa_trusted_sessions (user_id);
create index if not exists mfa_trusted_sessions_device_idx on public.mfa_trusted_sessions (device_id);
alter table public.mfa_trusted_sessions enable row level security;

-- Double authentification satisfaite pour la requête en cours : session aal2, ou session inscrite comme
-- session de confiance (appareil non retiré, échéance non passée) d'un compte qui a encore un facteur
-- vérifié. security definer : lit les deux tables sans politique ; search_path vide : noms complets partout.
create or replace function public.mfa_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
        or exists (
            select 1
              from public.mfa_trusted_sessions s
              join public.mfa_trusted_devices d on d.id = s.device_id
             where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
               and s.user_id = auth.uid()
               and s.expires_at > now()
               and d.revoked_at is null
               and d.expires_at > now()
        )
        -- La confiance ne vaut que si le compte a encore un facteur vérifié (même règle que lib/mfa.js :
        -- elle remplace le code, jamais l'inscription). Sans ce garde-fou, retirer son dernier facteur
        -- laisserait une session de confiance ouvrir les données sans double authentification.
        and exists (
            select 1 from auth.mfa_factors f
             where f.user_id = auth.uid() and f.status = 'verified'
        );
$$;
revoke all on function public.mfa_session_ok() from public, anon;
grant execute on function public.mfa_session_ok() to authenticated;
-- Défense en profondeur : RLS sans politique ferme déjà ces tables ; aucun droit non plus (refus explicite).
revoke all on public.mfa_trusted_devices from anon, authenticated;
revoke all on public.mfa_trusted_sessions from anon, authenticated;

-- Les politiques restrictives de 0003 acceptent désormais aussi une session de confiance. « alter policy »
-- (pas drop + create) : même politique, seule la condition change, sans instant sans règle.
alter policy "authenticated requires aal2" on public.profiles
    using ((select public.mfa_session_ok())) with check ((select public.mfa_session_ok()));
-- Même ligne pour chaque autre table protégée dans 0003 :
-- alter policy "authenticated requires aal2" on public.<table>
--     using ((select public.mfa_session_ok())) with check ((select public.mfa_session_ok()));
