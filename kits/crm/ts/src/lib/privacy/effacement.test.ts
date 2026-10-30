// Kit CRM TS (methode-travail) — origine : écrit pour le kit (les sources n'avaient pas de test de l'orchestration d'effacement ; règles tirées de Vie Solution Web, src/lib/crm/effacement.ts, commit 59e389a, et de KHI Educ, app/v1/admin/privacy/route.js, commit 1a02685).
import { describe, expect, it } from 'vitest';
import type { AuditActor } from '@/lib/auth/types';
import { createFakeSupabase, fakeUuid, type FakeOptions, type Row } from '@/test-support/fake-supabase';
import { empreinteCourriel } from './conservation';
import { MANUAL_ERASURE_STEPS, PRIVACY_REQUESTS_TABLE, accessPerson, erasePerson, erasedHashes, mayContact } from './effacement';

const SECRET = 'k'.repeat(32);
const ENV = { PRIVACY_HASH_SECRET: SECRET, EMAIL_FROM: 'Équipe <bonjour@exemple.test>' };
const ACTOR: AuditActor = { kind: 'member', userId: fakeUuid(1), role: 'admin' };

function setup(extra: Partial<Record<string, Row[]>> = {}, options: FakeOptions = {}) {
  let n = 100;
  const tables: Record<string, Row[]> = {
    leads: [
      { id: 'lead-1', email: 'marie@exemple.test' },
      { id: 'lead-1b', email: 'Marie@Exemple.test' },
      { id: 'lead-2', email: 'paul@exemple.test' },
      { id: 'lead-3', email: 'mariexb@exemple.test' },
      { id: 'lead-4', email: 'marie_b@exemple.test' },
    ],
    lead_activities: [
      { id: 'a1', lead_id: 'lead-1' },
      { id: 'a2', lead_id: 'lead-2' },
      { id: 'a3', lead_id: 'lead-1b' },
    ],
    lead_tasks: [{ id: 't1', lead_id: 'lead-2' }],
    email_messages: [
      { id: 'm1', lead_id: 'lead-1', from_email: 'bonjour@exemple.test', to_email: 'marie@exemple.test' },
      { id: 'm2', lead_id: null, from_email: 'marie@exemple.test', to_email: 'bonjour@exemple.test' },
      { id: 'm3', lead_id: null, from_email: 'paul@exemple.test', to_email: 'bonjour@exemple.test' },
      { id: 'm4', lead_id: null, from_email: 'mariexb@exemple.test', to_email: 'bonjour@exemple.test' },
    ],
    bookings: [
      { id: 'b1', email: 'marie@exemple.test' },
      { id: 'b2', email: 'paul@exemple.test' },
    ],
    team_allowlist: [{ email: 'admin@exemple.test' }],
    [PRIVACY_REQUESTS_TABLE]: [],
    ...(extra as Record<string, Row[]>),
  };
  return createFakeSupabase(tables, {
    defaults: { [PRIVACY_REQUESTS_TABLE]: () => ({ id: fakeUuid((n += 1)), created_at: '2026-10-30T00:00:00Z' }) },
    unique: { [PRIVACY_REQUESTS_TABLE]: ['kind', 'email_hash'] },
    ...options,
  });
}

const ids = (rows: Row[]) => rows.map((row) => row.id);

describe('erasePerson — effacement complet', () => {
  it('efface fiches, lignes rattachées et lignes par adresse ; rien d’autre ; bilan en nombres seulement', async () => {
    const fake = setup();
    const result = await erasePerson(fake.client, ' Marie@Exemple.test ', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: true, bilan: { leads: 2, lead_activities: 2, email_messages: 2, bookings: 1 } });
    if (result.ok) expect(result.manual).toBe(MANUAL_ERASURE_STEPS);
    expect(ids(fake.tables.leads)).toEqual(['lead-2', 'lead-3', 'lead-4']);
    expect(ids(fake.tables.lead_activities)).toEqual(['a2']);
    expect(ids(fake.tables.lead_tasks)).toEqual(['t1']);
    expect(ids(fake.tables.email_messages)).toEqual(['m3', 'm4']);
    expect(ids(fake.tables.bookings)).toEqual(['b2']);
    const [request] = fake.tables[PRIVACY_REQUESTS_TABLE];
    expect(request).toMatchObject({ kind: 'erase', email_hash: empreinteCourriel('marie@exemple.test', SECRET), actor: `member:${fakeUuid(1)}`, summary: { status: 'done' } });
    expect(JSON.stringify(fake.tables[PRIVACY_REQUESTS_TABLE])).not.toContain('marie');
  });

  it('« _ » dans l’adresse : motif échappé, l’adresse voisine (« mariexb ») n’est pas touchée', async () => {
    const fake = setup();
    const result = await erasePerson(fake.client, 'marie_b@exemple.test', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: true, bilan: { leads: 1 } });
    expect(fake.ilikes).toContain('marie\\_b@exemple.test');
    expect(ids(fake.tables.leads)).toContain('lead-3');
    expect(ids(fake.tables.email_messages)).toContain('m4');
  });

  it('injection par « " », « , », « ) » : aucune autre ligne touchée', async () => {
    for (const email of ['x",id.neq."0@exemple.test', 'x),id.neq.(0@exemple.test', 'x,from_email.eq.paul@exemple.test']) {
      const fake = setup();
      const before = JSON.stringify({ ...fake.tables, [PRIVACY_REQUESTS_TABLE]: [] });
      const result = await erasePerson(fake.client, email, { actor: ACTOR, env: ENV });
      expect(result).toMatchObject({ ok: true, bilan: { leads: 0, email_messages: 0, bookings: 0 } });
      expect(JSON.stringify({ ...fake.tables, [PRIVACY_REQUESTS_TABLE]: [] })).toBe(before);
    }
  });

  it('courriel sans fiche : les lignes par adresse sont effacées et l’empreinte est écrite', async () => {
    const fake = setup({ email_messages: [{ id: 'm9', lead_id: null, from_email: 'sansfiche@exemple.test', to_email: 'bonjour@exemple.test' }] });
    const result = await erasePerson(fake.client, 'sansfiche@exemple.test', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: true, bilan: { leads: 0, email_messages: 1 } });
    expect(fake.tables.email_messages).toEqual([]);
    expect(fake.tables[PRIVACY_REQUESTS_TABLE]).toHaveLength(1);
  });

  it('relancer l’effacement réutilise la même empreinte (une seule ligne par adresse)', async () => {
    const fake = setup();
    await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    const again = await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    expect(again).toMatchObject({ ok: true, bilan: { leads: 0 } });
    expect(fake.tables[PRIVACY_REQUESTS_TABLE].filter((r) => r.kind === 'erase')).toHaveLength(1);
  });
});

describe('erasePerson — empreinte AVANT la première suppression', () => {
  it('la première écriture est l’empreinte', async () => {
    const fake = setup();
    await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    const firstDelete = fake.writes.findIndex((w) => w.kind === 'delete');
    const hashInsert = fake.writes.findIndex((w) => w.kind === 'insert' && w.table === PRIVACY_REQUESTS_TABLE);
    expect(hashInsert).toBe(0);
    expect(firstDelete).toBeGreaterThan(hashInsert);
  });

  it('échec simulé à mi-parcours : effacement partiel, l’empreinte est déjà là et l’adresse reste bloquée', async () => {
    const fake = setup({}, { failTables: ['bookings'] });
    const result = await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: false, code: 'partial' });
    expect(ids(fake.tables.lead_activities)).toEqual(['a2']); // le début a bien été effacé
    expect(fake.tables[PRIVACY_REQUESTS_TABLE]).toEqual([expect.objectContaining({ kind: 'erase', email_hash: empreinteCourriel('marie@exemple.test', SECRET) })]);
    expect(mayContact('marie@exemple.test', await erasedHashes(fake.client), ENV)).toBe(false);
  });

  it('empreinte impossible à écrire → rien n’est effacé', async () => {
    const fake = setup({}, { failTables: [PRIVACY_REQUESTS_TABLE] });
    const result = await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: false, code: 'hash_failed' });
    expect(fake.writes.filter((w) => w.kind === 'delete')).toEqual([]);
  });
});

describe('erasePerson — refus', () => {
  it('secret absent → effacement refusé avec un message clair, rien d’écrit', async () => {
    for (const env of [{}, { PRIVACY_HASH_SECRET: 'court' }, { UNSUBSCRIBE_SECRET: 'court' }]) {
      const fake = setup();
      const result = await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env });
      expect(result).toMatchObject({ ok: false, code: 'secret_missing' });
      if (!result.ok) expect(result.message).toMatch(/PRIVACY_HASH_SECRET.*32.*UNSUBSCRIBE_SECRET/);
      expect(fake.writes).toEqual([]);
    }
  });

  it('repli UNSUBSCRIBE_SECRET accepté', async () => {
    const fake = setup();
    expect(await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: { UNSUBSCRIBE_SECRET: 'u'.repeat(32) } })).toMatchObject({ ok: true });
  });

  it('adresse de l’équipe (liste blanche, expéditeur) jamais effacée', async () => {
    for (const email of ['admin@exemple.test', 'BONJOUR@exemple.test']) {
      const fake = setup();
      const result = await erasePerson(fake.client, email, { actor: ACTOR, env: ENV });
      expect(result).toMatchObject({ ok: false, code: 'team_member' });
      expect(fake.writes).toEqual([]);
    }
  });

  it('liste de l’équipe illisible → refus, rien d’écrit', async () => {
    const fake = setup({}, { failTables: ['team_allowlist'] });
    expect(await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV })).toMatchObject({ ok: false, code: 'team_unreadable' });
    expect(fake.writes).toEqual([]);
  });

  it('adresse invalide ou acteur invalide → refus', async () => {
    const fake = setup();
    expect(await erasePerson(fake.client, 'pas-une-adresse', { actor: ACTOR, env: ENV })).toMatchObject({ ok: false, code: 'invalid_email' });
    expect(await erasePerson(fake.client, 'marie@exemple.test', { actor: { kind: 'member', userId: 'x', role: 'admin' }, env: ENV })).toMatchObject({
      ok: false,
      code: 'invalid_actor',
    });
    expect(fake.writes).toEqual([]);
  });
});

describe('relances vers une adresse effacée', () => {
  it('refusées ; les autres adresses restent joignables ; sans secret → refusées par prudence', async () => {
    const fake = setup();
    await erasePerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    const erased = await erasedHashes(fake.client);
    expect(mayContact('Marie@Exemple.test', erased, ENV)).toBe(false);
    expect(mayContact('paul@exemple.test', erased, ENV)).toBe(true);
    expect(mayContact('paul@exemple.test', erased, {})).toBe(false);
    expect(mayContact('pas-une-adresse', erased, ENV)).toBe(false);
  });
});

describe('accessPerson', () => {
  it('rend les données et inscrit la demande au registre (empreinte seulement)', async () => {
    const fake = setup();
    const result = await accessPerson(fake.client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    expect(result).toMatchObject({ ok: true, counts: { leads: 2, email_messages: 2, bookings: 1 } });
    expect(fake.tables[PRIVACY_REQUESTS_TABLE]).toEqual([expect.objectContaining({ kind: 'access', email_hash: empreinteCourriel('marie@exemple.test', SECRET) })]);
    expect(fake.writes.filter((w) => w.kind === 'delete')).toEqual([]);
  });

  it('adresse de l’équipe : lecture limitée à ses fiches ; registre impossible → rien n’est rendu', async () => {
    const team = await accessPerson(setup().client, 'bonjour@exemple.test', { actor: ACTOR, env: ENV });
    expect(team.ok && team.data.scope).toBe('leads_only');
    const failing = await accessPerson(setup({}, { failTables: [PRIVACY_REQUESTS_TABLE] }).client, 'marie@exemple.test', { actor: ACTOR, env: ENV });
    expect(failing).toMatchObject({ ok: false, code: 'register_failed' });
    expect(await accessPerson(setup().client, 'marie@exemple.test', { actor: ACTOR, env: {} })).toMatchObject({ ok: false, code: 'secret_missing' });
  });
});
