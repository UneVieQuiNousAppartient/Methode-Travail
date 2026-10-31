-- Kit CRM TS (methode-travail) — origine : VieSolution-CSF, supabase/migrations/20261112_call_result.sql, commit df3ff89 (2026-10-30) ; généralisé : étapes, étapes protégées et raisons de perte en listes [à adapter], périmètre passé par le serveur (p_actor_id / p_actor_sees_all) et auteur passé en paramètre (plus de lecture d'une table d'utilisateurs du projet), VÉRIFICATIONS et RETOUR ARRIÈRE ajoutés, historique retiré.
--
-- Poste d'appel : résultat d'un appel en UNE transaction (src/lib/appels/server.ts → confirmerAppel).
--
-- CONTENU
-- public.record_call_result(p_actor_id, p_actor_sees_all, p_author, p_lead_id, p_task_id, p_outcome, p_title,
--   p_details, p_status, p_lost_reason, p_followup_title, p_followup_due) → jsonb. Tout ou rien :
--   0. entrées validées (rien n'est écrit si l'une échoue) ;
--   1. lead verrouillé (`for update`) ; un lead archivé (`archived_at`, 0110) répond « introuvable » ; un acteur limité à ses fiches (p_actor_sees_all = false) doit en être le
--      responsable (`owner_id = p_actor_id`), sinon refus — même message que « introuvable » (rien n'est révélé) ;
--   2. tâche courante terminée (`status = 'done'`, `completed_at`), seulement si elle est ouverte ET appartient à ce
--      lead ; sinon erreur « tâche introuvable ou déjà terminée » ;
--   3. activité `appel` (lead_id, type, title, details, outcome, author) ;
--   4. contact : contact_attempts + 1 ; si l'issue est `joint`, last_contacted_at = maintenant et first_contacted_at
--      comblé s'il était vide ;
--   5. étape : p_status (ou, à défaut, l'étape « contacté » pour un lead « nouveau » joint) — JAMAIS de recul depuis
--      une étape protégée (même règle que `avanceeQuandJoint` de regles.ts) ; lost_reason posé quand la nouvelle étape est « perdu », effacé quand l'étape change pour
--      une autre ;
--   6. tâche de suivi facultative ;
--   7. follow_up_at = plus proche échéance des tâches ouvertes du lead (null s'il n'y en a plus).
-- Le plan est calculé par src/lib/appels/regles.ts (planResultat) puis transmis ici, qui réapplique les gardes.
-- `security definer`, search_path fixé, exécutable par service_role SEULEMENT (le serveur, jamais le navigateur).
--
-- [à adapter] AVANT application, aligner sur la configuration du projet (`ConfigAppels`, regles.ts) :
--   - noms des tables `public.leads`, `public.tasks`, `public.activities` et de leurs colonnes (status, owner_id,
--     lost_reason, contact_attempts, first_contacted_at, last_contacted_at, follow_up_at ; tasks.status / due_at /
--     completed_at / lead_id ; activities.outcome / author / occurred_at par défaut à now()) ;
--   - liste des étapes (exemple : nouveau, contacte, rdv, client, perdu) — valeurs de `ConfigAppels.etapes` ;
--   - étapes protégées (exemple : rdv, client) — `ConfigAppels.etapesProtegees` ;
--   - étape « perdu » (exemple : perdu) et raisons de perte (exemple : pas_interesse, sans_reponse, autre) ;
--   - étapes « nouveau » qui passent à « contacté » quand la personne est jointe (exemple : nouveau → contacte) —
--     `ConfigAppels.avanceeQuandJoint` (`depuis` = c_nouvelles, `vers` = c_contacte ; null → c_nouvelles vide) ;
--   - colonne `archived_at` (0110) : si le projet n'a pas l'archivage, retirer la colonne du select et le refus
--     « archivé » de l'étape 1 ;
--   - valeurs des tâches ouvertes / terminées (exemple : open / done).
-- Les issues (`joint`, `message_laisse`, `sans_reponse`) sont celles du kit : ne pas les changer sans regles.ts.
--
-- Dépend de : public.leads, public.tasks, public.activities (tables du projet). Idempotente (create or replace).
-- FOURNIE PAR LE KIT, JAMAIS APPLIQUÉE PAR LUI : appliquée projet par projet, par la personne qui valide, AVANT le
-- déploiement du code qui l'appelle (sinon la confirmation répond 503, sans rien écrire).
--
-- VÉRIFICATIONS (après application)
--   select prosecdef, proconfig from pg_proc where proname = 'record_call_result';
--     -- true, {search_path=public,pg_temp}
--   select has_function_privilege('anon', 'public.record_call_result(uuid, boolean, text, uuid, uuid, text, text, text, text, text, text, timestamptz)', 'execute');
--     -- false (de même pour 'authenticated') ; true pour 'service_role'
--   -- Essai dans une transaction annulée (remplacer les identifiants par une fiche et une tâche ouverte de test) :
--   begin;
--     select public.record_call_result(null, true, 'essai', '<lead>', '<tâche>', 'joint', 'Appel — RDV pris', null,
--                                      'rdv', null, null, null);
--     -- attendu : {"status": "rdv", "status_changed": true, …} (ou status_changed false si l'étape était protégée)
--   rollback;
--
-- RETOUR ARRIÈRE (la confirmation du poste d'appel répond alors 503 ; rien d'autre ne dépend de la fonction)
--   drop function if exists public.record_call_result(uuid, boolean, text, uuid, uuid, text, text, text, text, text, text, timestamptz);

create or replace function public.record_call_result(
  p_actor_id uuid,
  p_actor_sees_all boolean,
  p_author text,
  p_lead_id uuid,
  p_task_id uuid,
  p_outcome text,
  p_title text,
  p_details text,
  p_status text,
  p_lost_reason text,
  p_followup_title text,
  p_followup_due timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- [à adapter] listes alignées sur ConfigAppels (regles.ts).
  c_etapes constant text[] := array['nouveau', 'contacte', 'rdv', 'client', 'perdu'];
  c_protegees constant text[] := array['rdv', 'client'];
  c_perdu constant text := 'perdu';
  c_raisons constant text[] := array['pas_interesse', 'sans_reponse', 'autre'];
  c_nouvelles constant text[] := array['nouveau'];
  c_contacte constant text := 'contacte';
  v_status_before text;
  v_owner_id uuid;
  v_archived_at timestamptz;
  v_joint boolean;
  v_target text;
  v_status_after text;
  v_activity_id uuid;
  v_followup_id uuid;
  v_next timestamptz;
begin
  -- 0. Validation des entrées : rien n'est écrit si l'une échoue.
  if p_lead_id is null or p_task_id is null then
    raise exception 'record_call_result: lead et tâche obligatoires' using errcode = '22023';
  end if;
  if not coalesce(p_actor_sees_all, false) and p_actor_id is null then
    raise exception 'record_call_result: lead introuvable' using errcode = 'P0002';
  end if;
  if p_outcome is null or p_outcome not in ('joint', 'sans_reponse', 'message_laisse') then
    raise exception 'record_call_result: issue inconnue' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' or length(p_title) > 200 then
    raise exception 'record_call_result: titre vide ou trop long' using errcode = '22023';
  end if;
  if p_details is not null and length(p_details) > 5000 then
    raise exception 'record_call_result: notes trop longues' using errcode = '22023';
  end if;
  if p_status is not null and not (p_status = any (c_etapes)) then
    raise exception 'record_call_result: étape inconnue' using errcode = '22023';
  end if;
  if p_lost_reason is not null and (p_status is distinct from c_perdu or not (p_lost_reason = any (c_raisons))) then
    raise exception 'record_call_result: raison de perte invalide' using errcode = '22023';
  end if;
  if (p_followup_title is null) <> (p_followup_due is null)
     or (p_followup_title is not null and (btrim(p_followup_title) = '' or length(p_followup_title) > 200)) then
    raise exception 'record_call_result: tâche de suivi incomplète' using errcode = '22023';
  end if;
  if p_followup_due is not null
     and (p_followup_due < now() - interval '1 day' or p_followup_due > now() + interval '366 days') then
    raise exception 'record_call_result: échéance de suivi hors des 12 prochains mois' using errcode = '22023';
  end if;
  v_joint := p_outcome = 'joint';

  -- 1. Lead verrouillé jusqu'à la fin de la transaction (deux clics simultanés : l'un attend l'autre).
  select status, owner_id, archived_at -- [à adapter] archived_at : 0110
    into v_status_before, v_owner_id, v_archived_at
    from public.leads
   where id = p_lead_id
     for update;
  if not found then
    raise exception 'record_call_result: lead introuvable' using errcode = 'P0002';
  end if;
  if not coalesce(p_actor_sees_all, false) and v_owner_id is distinct from p_actor_id then
    raise exception 'record_call_result: lead introuvable' using errcode = 'P0002';
  end if;
  -- Lead archivé : masqué du travail courant (0110), même refus qu'introuvable.
  if v_archived_at is not null then
    raise exception 'record_call_result: lead introuvable' using errcode = 'P0002';
  end if;

  -- 2. Tâche courante terminée, seulement si elle est encore ouverte et appartient à ce lead.
  update public.tasks
     set status = 'done', completed_at = now()
   where id = p_task_id and lead_id = p_lead_id and status = 'open';
  if not found then
    raise exception 'record_call_result: tâche introuvable ou déjà terminée' using errcode = 'P0001';
  end if;

  -- 3. Activité « appel ».
  insert into public.activities (lead_id, type, title, details, outcome, author)
  values (p_lead_id, 'appel', btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), p_outcome,
          coalesce(nullif(btrim(left(coalesce(p_author, ''), 200)), ''), 'equipe'))
  returning id into v_activity_id;

  -- 5. Étape visée, avec la garde « ne recule jamais » depuis une étape protégée.
  v_target := coalesce(p_status, case when v_joint and v_status_before = any (c_nouvelles) then c_contacte end);
  if v_status_before = any (c_protegees) or v_target = v_status_before then
    v_target := null;
  end if;
  v_status_after := coalesce(v_target, v_status_before);

  -- 4. et 5. Contact et étape, en une écriture.
  update public.leads
     set contact_attempts   = coalesce(contact_attempts, 0) + 1,
         last_contacted_at  = case when v_joint then now() else last_contacted_at end,
         first_contacted_at = case when v_joint and first_contacted_at is null then now() else first_contacted_at end,
         status             = v_status_after,
         lost_reason        = case
                                when v_target is null then lost_reason
                                when v_target = c_perdu then p_lost_reason
                                else null
                              end
   where id = p_lead_id;

  -- 6. Tâche de suivi facultative.
  if p_followup_title is not null then
    insert into public.tasks (lead_id, title, due_at)
    values (p_lead_id, btrim(p_followup_title), p_followup_due)
    returning id into v_followup_id;
  end if;

  -- 7. follow_up_at = plus proche échéance des tâches ouvertes du lead.
  select min(due_at) into v_next
    from public.tasks
   where lead_id = p_lead_id and status = 'open' and due_at is not null;
  update public.leads set follow_up_at = v_next where id = p_lead_id;

  return jsonb_build_object(
    'status', v_status_after,
    'status_changed', v_target is not null,
    'activity_id', v_activity_id,
    'followup_task_id', v_followup_id,
    'follow_up_at', v_next
  );
end;
$$;

comment on function public.record_call_result(uuid, boolean, text, uuid, uuid, text, text, text, text, text, text, timestamptz) is
  'Poste d''appel : résultat d''un appel en une transaction — lead verrouillé et responsable vérifié, tâche terminée, activité « appel », contact, étape (jamais de recul depuis une étape protégée), tâche de suivi, follow_up_at. service_role seulement.';

revoke all on function public.record_call_result(uuid, boolean, text, uuid, uuid, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_call_result(uuid, boolean, text, uuid, uuid, text, text, text, text, text, text, timestamptz) to service_role;
