// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source n'avait pas de test du serveur du poste d'appel) ; faux Supabase L0.
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeUuid, type FakeRpcResult, type Row } from '@/test-support/fake-supabase';
import { CONFIG_APPELS_EXEMPLE as config } from './regles';
import {
  SQL_ABSENT,
  RefusAppel,
  auteurNormalise,
  apercuAppel,
  confirmerAppel,
  lireBilan,
  lireFile,
  lireSaisieAppel,
  type AccesAppels,
  type OptionsAppels,
} from './server';

type Acteur = { id: string; chef: boolean; nom: string };
const acces: AccesAppels<Acteur> = {
  perimetre: (a) => (a.chef ? { tout: true } : { responsable: a.id }),
  auteur: (a) => a.nom,
};
const options: OptionsAppels<Acteur> = { config, acces };

const ALICE = { id: fakeUuid(901), chef: false, nom: 'Alice' };
const BRUNO = { id: fakeUuid(902), chef: false, nom: 'Bruno' };
const CHEF = { id: fakeUuid(903), chef: true, nom: 'Chef' };
const maintenant = new Date('2026-10-29T16:00:00Z'); // jeudi midi à Toronto

const L1 = fakeUuid(1);
const L2 = fakeUuid(2);
const L3 = fakeUuid(3);
const LP = fakeUuid(4);

function base(rpc?: (args: Record<string, unknown>) => FakeRpcResult) {
  const leads: Row[] = [
    { id: L1, first_name: 'Julie', last_name: 'Roy', phone: '555', email: 'j@x.ca', status: 'nouveau', owner_id: ALICE.id, archived_at: null },
    { id: L2, first_name: 'Marc', last_name: null, phone: null, email: null, status: 'contacte', owner_id: BRUNO.id, archived_at: null },
    { id: L3, first_name: 'Ancien', last_name: null, phone: null, email: null, status: 'nouveau', owner_id: ALICE.id, archived_at: '2026-10-01T00:00:00Z' },
    { id: LP, first_name: 'Pro', last_name: 'Tégé', phone: null, email: null, status: 'client', owner_id: ALICE.id, archived_at: null },
  ];
  const tasks: Row[] = [
    { id: fakeUuid(11), title: 'Appeler Julie', due_at: '2026-10-29T13:00:00Z', status: 'open', lead_id: L1 },
    { id: fakeUuid(12), title: 'Appeler Marc', due_at: '2026-10-28T13:00:00Z', status: 'open', lead_id: L2 },
    { id: fakeUuid(13), title: 'Archivé', due_at: '2026-10-29T13:00:00Z', status: 'open', lead_id: L3 },
    { id: fakeUuid(14), title: 'Fait', due_at: '2026-10-29T13:00:00Z', status: 'done', lead_id: L1 },
    { id: fakeUuid(15), title: 'Client', due_at: '2026-10-30T13:00:00Z', status: 'open', lead_id: LP },
  ];
  return createFakeSupabase(
    { leads, tasks, activities: [] },
    {
      relations: { tasks: { leads: { table: 'leads', foreignKey: 'lead_id' } } },
      rpc: rpc ? { record_call_result: (args) => rpc(args) } : undefined,
    },
  );
}

describe('lireSaisieAppel', () => {
  it('identifiants UUID obligatoires dans le corps ; notes en texte', () => {
    expect(lireSaisieAppel({ leadId: L1, taskId: fakeUuid(11), resultat: 'rdv', confirm: true })).toMatchObject({ leadId: L1, confirm: true });
    expect(lireSaisieAppel({ leadId: L1, taskId: fakeUuid(11), resultat: 'rdv' })?.confirm).toBe(false);
    expect(lireSaisieAppel({ leadId: 'x', taskId: fakeUuid(11) })).toBeNull();
    expect(lireSaisieAppel({ leadId: L1, taskId: fakeUuid(11), notes: 42 })).toBeNull();
    expect(lireSaisieAppel({ leadId: L1, taskId: fakeUuid(11), notes: 'x'.repeat(10_000) })).toBeNull();
    expect(lireSaisieAppel([L1])).toBeNull();
    expect(lireSaisieAppel(null)).toBeNull();
  });
});

describe('lireFile — périmètre injecté', () => {
  it('un membre limité ne voit que ses fiches, sans archivés ni tâches terminées', async () => {
    const fake = base();
    const f = await lireFile(fake.client, ALICE, options, maintenant);
    expect(f.duJour.map((e) => e.titre)).toEqual(['Appeler Julie']);
    expect(f.aVenir.map((e) => e.titre)).toEqual(['Client']);
    expect(f.enRetard).toEqual([]);
    expect(fake.queries[0].filters).toContainEqual({ op: 'eq', column: 'leads.owner_id', value: ALICE.id });
  });
  it('le périmètre « tout » voit toute l’équipe', async () => {
    const f = await lireFile(base().client, CHEF, options, maintenant);
    expect(f.enRetard.map((e) => e.titre)).toEqual(['Appeler Marc']);
    expect(f.duJour.map((e) => e.titre)).toEqual(['Appeler Julie']);
  });
  it('périmètre illisible : refus, jamais « tout » par défaut', async () => {
    const mauvais = { ...options, acces: { ...acces, perimetre: () => ({ responsable: ' ' }) } };
    await expect(lireFile(base().client, ALICE, mauvais, maintenant)).rejects.toMatchObject({ status: 403 });
  });
});

describe('lireBilan', () => {
  it('appels de l’acteur, aujourd’hui', async () => {
    const fake = base();
    fake.tables.activities = [
      { type: 'appel', title: 'Appel — RDV pris', author: 'Alice', occurred_at: '2026-10-29T14:00:00Z' },
      { type: 'appel', title: 'Appel — RDV pris', author: 'Bruno', occurred_at: '2026-10-29T14:00:00Z' },
      { type: 'appel', title: 'Appel — Pas de réponse', author: 'Alice', occurred_at: '2026-10-28T14:00:00Z' },
    ];
    const b = await lireBilan(fake.client, ALICE, options, maintenant);
    expect(b.appels).toBe(1);
    expect(b.parResultat.rdv).toBe(1);
  });
});

describe('apercuAppel', () => {
  it('rien n’est écrit, étape lue en base', async () => {
    const fake = base();
    const r = await apercuAppel(fake.client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'message' }, maintenant);
    expect(r.plan.statut).toBeNull();
    expect(r.plan.suivi).toEqual({ titre: 'Rappeler Julie Roy', jour: '2026-10-30', dueAt: '2026-10-30T13:00:00.000Z' });
    expect(fake.writes).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
  });
  it('fiche d’un autre membre : 404 comme une tâche inexistante', async () => {
    await expect(apercuAppel(base().client, ALICE, options, { leadId: L2, taskId: fakeUuid(12), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({
      status: 404,
      message: 'Tâche introuvable.',
    });
    await expect(apercuAppel(base().client, ALICE, options, { leadId: L1, taskId: fakeUuid(99), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('tâche terminée : 409 ; date hors des 12 mois, durée invalide : 400', async () => {
    await expect(apercuAppel(base().client, ALICE, options, { leadId: L1, taskId: fakeUuid(14), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({ status: 409 });
    await expect(
      apercuAppel(base().client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rappeler', rappelLe: '2028-01-01' }, maintenant),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      apercuAppel(base().client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rdv', dureeSecondes: -1 }, maintenant),
    ).rejects.toSatisfy((e: unknown) => e instanceof RefusAppel && e.status === 400);
  });
  it('lead archivé : 404, même message qu’introuvable', async () => {
    await expect(apercuAppel(base().client, ALICE, options, { leadId: L3, taskId: fakeUuid(13), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({
      status: 404,
      message: 'Tâche introuvable.',
    });
  });
});

describe('confirmerAppel', () => {
  it('transmet le plan recalculé, le périmètre et l’auteur à la fonction SQL', async () => {
    const fake = base(() => ({ data: { status: 'perdu' }, error: null }));
    const r = await confirmerAppel(
      fake.client,
      ALICE,
      options,
      { leadId: L1, taskId: fakeUuid(11), resultat: 'pas_interesse', notes: 'Merci', dureeSecondes: 65 },
      maintenant,
    );
    expect(r.resultat).toEqual({ status: 'perdu' });
    expect(fake.rpcCalls[0]).toEqual({
      name: 'record_call_result',
      args: {
        p_actor_id: ALICE.id,
        p_actor_sees_all: false,
        p_author: 'Alice',
        p_lead_id: L1,
        p_task_id: fakeUuid(11),
        p_outcome: 'joint',
        p_title: 'Appel — Pas intéressé',
        p_details: 'Merci\nDurée : 1 min 05 s',
        p_status: 'perdu',
        p_lost_reason: 'pas_interesse',
        p_followup_title: null,
        p_followup_due: null,
      },
    });
  });
  it('étape protégée en base : aucune étape transmise, même pour « pas intéressé »', async () => {
    const fake = base(() => ({ data: {}, error: null }));
    await confirmerAppel(fake.client, ALICE, options, { leadId: LP, taskId: fakeUuid(15), resultat: 'pas_interesse' }, maintenant);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_status: null, p_lost_reason: null });
  });
  it('« tout » : p_actor_id null, p_actor_sees_all true', async () => {
    const fake = base(() => ({ data: {}, error: null }));
    await confirmerAppel(fake.client, CHEF, options, { leadId: L2, taskId: fakeUuid(12), resultat: 'rdv' }, maintenant);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_actor_id: null, p_actor_sees_all: true, p_status: 'rdv' });
  });
  it('fonction absente : 503 ; tâche déjà terminée en base : 409 ; lead d’autrui en base : 404', async () => {
    await expect(confirmerAppel(base().client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({
      status: 503,
      message: SQL_ABSENT,
    });
    const termine = base(() => ({ data: null, error: { message: 'record_call_result: tâche introuvable ou déjà terminée', code: 'P0001' } }));
    await expect(confirmerAppel(termine.client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({ status: 409 });
    const autrui = base(() => ({ data: null, error: { message: 'record_call_result: lead introuvable', code: 'P0002' } }));
    await expect(confirmerAppel(autrui.client, ALICE, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({ status: 404 });
  });
  it('lead archivé : refus AVANT la fonction SQL', async () => {
    const fake = base(() => ({ data: {}, error: null }));
    await expect(confirmerAppel(fake.client, CHEF, options, { leadId: L3, taskId: fakeUuid(13), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({
      status: 404,
      message: 'Tâche introuvable.',
    });
    expect(fake.rpcCalls).toEqual([]);
  });
  it('auteur normalisé une fois : même valeur écrite et cherchée par le bilan', async () => {
    const espace = { ...ALICE, nom: `  ${'A'.repeat(250)}  ` };
    const fake = base(() => ({ data: {}, error: null }));
    await confirmerAppel(fake.client, espace, options, { leadId: L1, taskId: fakeUuid(11), resultat: 'rdv' }, maintenant);
    const ecrit = fake.rpcCalls[0].args.p_author;
    expect(ecrit).toBe('A'.repeat(200));
    fake.tables.activities = [{ type: 'appel', title: 'Appel — RDV pris', author: ecrit, occurred_at: '2026-10-29T14:00:00Z' }];
    expect((await lireBilan(fake.client, espace, options, maintenant)).appels).toBe(1);
    expect(fake.queries.at(-1)?.filters).toContainEqual({ op: 'eq', column: 'author', value: 'A'.repeat(200) });
    expect(auteurNormalise(options, { ...ALICE, nom: '   ' })).toBe('equipe');
  });
  it('lead d’un autre membre : refus AVANT la fonction SQL', async () => {
    const fake = base(() => ({ data: {}, error: null }));
    await expect(confirmerAppel(fake.client, ALICE, options, { leadId: L2, taskId: fakeUuid(12), resultat: 'rdv' }, maintenant)).rejects.toMatchObject({ status: 404 });
    expect(fake.rpcCalls).toEqual([]);
  });
});
