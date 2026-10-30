-- Kit CRM TS (methode-travail) — origine : KHI Educ, supabase/migrations/20260925_lcap_desabonnement.sql, commit 2954590 (2026-10-27) ; généralisé : en-tête réécrit (routes et fichiers du projet retirés), index sur lower(email) ajouté pour la recherche des autres demandes de l'adresse.
--
-- Loi canadienne anti-pourriel (LCAP) — désabonnement des relances automatiques.
-- Chaque relance porte un lien de désabonnement signé (src/lib/email/desabonnement.ts) et les en-têtes
-- List-Unsubscribe / List-Unsubscribe-Post (RFC 8058). Le clic est traité par src/app/api/desabonnement ;
-- optOutAddress pose ces deux colonnes sur la fiche ET sur toutes les demandes de la même adresse, casse
-- ignorée (la loi vise l'adresse, pas la fiche). Les courriels transactionnels ne sont pas concernés.
--
-- [à adapter] : la table des demandes s'appelle `public.leads` ici ; si le projet en a une autre, remplacer
-- le nom partout ET poser LCAP_LEADS_TABLE. La table doit déjà avoir `id` et `email`.
--
-- Idempotente (add column if not exists, contrainte supprimée puis recréée, create index if not exists).
-- Rien n'est rempli : personne n'est désabonné avant de l'avoir demandé.
-- FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : à appliquer projet par projet, par la personne responsable.

alter table public.leads
    add column if not exists email_opt_out_at timestamptz,
    add column if not exists email_opt_out_source text;

-- Contrainte nommée, recréée : rejouer la migration met la liste des origines à jour.
alter table public.leads drop constraint if exists leads_email_opt_out_source_check;
alter table public.leads add constraint leads_email_opt_out_source_check
    check (email_opt_out_source is null or email_opt_out_source in ('lien', 'one-click', 'admin'));

comment on column public.leads.email_opt_out_at is
    'LCAP : date du désabonnement des relances automatiques (null = abonné). Le premier désabonnement garde sa date.';
comment on column public.leads.email_opt_out_source is
    'LCAP : origine du désabonnement — ''lien'' (page du lien de pied de courriel), ''one-click'' (bouton de la messagerie, RFC 8058) ou ''admin'' (demande reçue par téléphone ou par courriel, saisie par l''équipe).';

-- Liste des adresses désabonnées, relue à chaque passage du moteur de relances (index partiel : petit).
create index if not exists leads_email_opt_out_idx on public.leads (email) where email_opt_out_at is not null;

-- Autres demandes de la même adresse (optOutAddress : ILIKE sans joker), casse ignorée.
create index if not exists leads_email_lower_idx on public.leads (lower(email));
