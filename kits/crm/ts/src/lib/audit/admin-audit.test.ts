// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/integrations/admin-audit.test.ts, commit 508f19a (2026-10-30) ; généralisé : actions du catalogue du kit, acteur sans courriel, faux client du kit ; ajoutés : action hors catalogue, meta filtrée, base en erreur, date invalide refusée.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditActor } from '@/lib/auth/types';
import { clientIp } from '@/lib/api/request-ip';
import { createFakeSupabase, fakeUuid } from '@/test-support/fake-supabase';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_FAMILIES,
  AUDIT_TABLE,
  actorKey,
  audit,
  auditActionsOf,
  auditRow,
  ipOf,
  listAudit,
  parseAuditFilters,
  sanitizeMeta,
} from './admin-audit';

const MEMBER: AuditActor = { kind: 'member', userId: fakeUuid(1), role: 'admin' };
const SYSTEM: AuditActor = { kind: 'system', name: 'purge-conservation' };

afterEach(() => vi.restoreAllMocks());
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('catalogue fermé', () => {
  it('chaque action a un libellé et appartient à une famille ; chaque famille couvre une action', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action].length).toBeGreaterThan(3);
      expect(AUDIT_FAMILIES.some((family) => action.startsWith(family.prefix))).toBe(true);
    }
    for (const family of AUDIT_FAMILIES) expect(auditActionsOf(family.prefix).length).toBeGreaterThan(0);
  });

  it('action hors catalogue : erreur de type ET refus à l’exécution (rien n’est écrit)', async () => {
    quiet();
    const fake = createFakeSupabase({ [AUDIT_TABLE]: [] });
    // @ts-expect-error — « lead.export_all » n'est pas dans AUDIT_ACTIONS.
    const ok = await audit(fake.client, { actor: MEMBER, action: 'lead.export_all' });
    expect(ok).toBe(false);
    expect(fake.writes).toHaveLength(0);
    // @ts-expect-error — idem pour la fonction pure.
    expect(auditRow({ actor: MEMBER, action: 'drop table' })).toBeNull();
  });
});

describe('auditRow', () => {
  it('ligne bornée, meta objet seulement, IP du premier relais, acteur sans courriel', () => {
    const row = auditRow(
      { actor: MEMBER, action: 'team.add', target_type: 't'.repeat(50), target_id: 'x', meta: [] as unknown as Record<string, unknown> },
      { headers: new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }) },
    );
    expect(row).toMatchObject({ actor: `member:${fakeUuid(1)}`, actor_role: 'admin', action: 'team.add', target_id: 'x', meta: {}, ip: '203.0.113.5' });
    expect(row?.target_type).toHaveLength(40);
    expect(auditRow({ actor: SYSTEM, action: 'retention.purge' })?.actor).toBe('system:purge-conservation');
  });

  it('acteur invalide (identifiant non uuid, nom de tâche avec un @) → rien', () => {
    expect(actorKey({ kind: 'member', userId: 'marie@exemple.test', role: 'admin' })).toBeNull();
    expect(actorKey({ kind: 'system', name: 'a@exemple.test' })).toBeNull();
    expect(auditRow({ actor: { kind: 'member', userId: 'pas-un-uuid', role: 'admin' }, action: 'auth.login' })).toBeNull();
  });

  it('cible : une adresse courriel n’est jamais écrite', () => {
    expect(auditRow({ actor: MEMBER, action: 'record.delete', target_type: 'lead', target_id: 'marie@exemple.test' })?.target_id).toBe('[retiré]');
    // Adresse placée pour que la coupe à 100 caractères lui retire son point : cherchée AVANT la coupe.
    const long = `${'x'.repeat(90)} marie@exemple.test`;
    expect(auditRow({ actor: MEMBER, action: 'record.delete', target_type: 'lead', target_id: long })?.target_id).toBe('[retiré]');
  });
});

describe('meta filtrée', () => {
  it('clés email / Token / secret / password / code retirées, sans tenir compte de la casse, y compris imbriquées', () => {
    const meta = sanitizeMeta({
      email: 'marie@exemple.test',
      Token: 'abc',
      SECRET: 's',
      password: 'p',
      Code: '123456',
      accessToken: 't',
      user_email: 'x',
      mot_de_passe: 'y',
      fields: ['name', 'role'],
      remaining_codes: 7,
      nested: { deep: { refresh_token: 'r', ok: 1, note: 'écrire à marie@exemple.test' } },
      list: [{ password: 'p', keep: true }],
    });
    expect(meta).toEqual({ fields: ['name', 'role'], remaining_codes: 7, nested: { deep: { ok: 1, note: '[retiré]' } }, list: [{ keep: true }] });
    expect(JSON.stringify(meta)).not.toMatch(/exemple\.test|abc|123456/);
  });

  it('meta passée à audit() est filtrée avant l’écriture', async () => {
    const fake = createFakeSupabase({ [AUDIT_TABLE]: [] });
    expect(await audit(fake.client, { actor: MEMBER, action: 'team.add', meta: { email: 'marie@exemple.test', Token: 'x', role: 'employe' } })).toBe(true);
    expect(fake.tables[AUDIT_TABLE][0].meta).toEqual({ role: 'employe' });
  });

  it('profondeur bornée, valeurs non sérialisables neutralisées', () => {
    const meta = sanitizeMeta({ a: { b: { c: { d: { e: { f: 1 } } } } }, n: Number.NaN, f: () => 1, d: new Date(0) });
    expect(JSON.stringify(meta)).toContain('[tronqué]');
    expect(meta.n).toBeNull();
    expect(meta.f).toBeNull();
    expect(meta.d).toBeNull();
  });
});

describe('audit() ne lève jamais', () => {
  it('base en erreur → false, sans lever ; base absente → false', async () => {
    const error = quiet();
    const failing = createFakeSupabase({}, { failTables: [AUDIT_TABLE] });
    await expect(audit(failing.client, { actor: MEMBER, action: 'auth.login' })).resolves.toBe(false);
    await expect(audit(null, { actor: MEMBER, action: 'auth.login' })).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it('exception du client (réseau) → false, sans lever', async () => {
    quiet();
    const throwing = { from: () => ({ insert: async () => { throw new Error('fetch failed'); } }) } as never;
    await expect(audit(throwing, { actor: MEMBER, action: 'auth.logout' })).resolves.toBe(false);
  });

  it('succès → true, une ligne écrite', async () => {
    const fake = createFakeSupabase({ [AUDIT_TABLE]: [] });
    expect(await audit(fake.client, { actor: MEMBER, action: 'auth.login' })).toBe(true);
    expect(fake.tables[AUDIT_TABLE]).toHaveLength(1);
  });
});

describe('IP', () => {
  it('même extraction que l’anti-abus (premier relais, repli x-real-ip, sinon null)', () => {
    expect(ipOf).toBe(clientIp);
    expect(clientIp({ headers: new Headers({ 'x-real-ip': ' 198.51.100.2 ' }) })).toBe('198.51.100.2');
    expect(clientIp({ headers: new Headers() })).toBeNull();
    expect(clientIp(null)).toBeNull();
  });
});

describe('parseAuditFilters', () => {
  const parse = (query: string) => parseAuditFilters(new URLSearchParams(query));

  it('action inconnue refusée, famille et action exacte admises, bornes de pagination', () => {
    expect(parse('action=drop%20table').ok).toBe(false);
    expect(parse('action=team%25').ok).toBe(false);
    expect(parse('action=team.')).toMatchObject({ ok: true, filters: { action: 'team.' } });
    expect(parse('action=auth.login')).toMatchObject({ ok: true, filters: { action: 'auth.login' } });
    expect(parse('limit=9999&offset=-4')).toMatchObject({ ok: true, filters: { limit: 200, offset: 0 } });
    for (const family of AUDIT_FAMILIES) expect(parse(`action=${encodeURIComponent(family.prefix)}`).ok).toBe(true);
  });

  it('date invalide refusée (jamais ignorée en silence)', () => {
    for (const bad of ['pas-une-date', '2026-02-31', '2026-13-01', '31/10/2026', '2026-10-30T25:00']) {
      expect(parse(`since=${encodeURIComponent(bad)}`)).toMatchObject({ ok: false });
      expect(parse(`until=${encodeURIComponent(bad)}`)).toMatchObject({ ok: false });
    }
    expect(parse('since=2026-11-01&until=2026-10-01')).toMatchObject({ ok: false });
    expect(parse('since=2026-10-01&until=2026-10-30T12:00:00Z')).toMatchObject({ ok: true, filters: { since: '2026-10-01T00:00:00.000Z' } });
  });

  it('acteur : format member:/system: seulement (jamais un courriel)', () => {
    expect(parse('actor=marie%40exemple.test').ok).toBe(false);
    expect(parse(`actor=member:${fakeUuid(1)}`)).toMatchObject({ ok: true, filters: { actor: `member:${fakeUuid(1)}` } });
  });
});

describe('listAudit', () => {
  const row = (action: string, created_at = '2026-10-30T00:00:00Z') => ({ id: 1, actor: `member:${fakeUuid(1)}`, actor_role: 'admin', action, target_type: null, target_id: null, meta: {}, ip: null, created_at });

  it('famille : liste explicite (pas de like) — « _ » et « % » ne sont jamais des jokers', async () => {
    const fake = createFakeSupabase({ [AUDIT_TABLE]: [row('team.add'), row('teamXadd'), row('mfa.device_trust'), row('mfaXdevice_trust'), row('auth.login')] });
    expect(auditActionsOf('team.')).toEqual(['team.add', 'team.remove', 'team.role_change']);
    expect((await listAudit(fake.client, { action: 'team.' })).items.map((r) => r.action)).toEqual(['team.add']);
    expect((await listAudit(fake.client, { action: 'mfa.' })).items.map((r) => r.action)).toEqual(['mfa.device_trust']);
    expect(fake.ilikes).toEqual([]);
  });

  it('période et total ; base en erreur → lève (pas de liste vide trompeuse)', async () => {
    const fake = createFakeSupabase({ [AUDIT_TABLE]: [row('auth.login', '2026-09-01T00:00:00Z'), row('auth.logout', '2026-10-15T00:00:00Z')] });
    const result = await listAudit(fake.client, { since: '2026-10-01T00:00:00.000Z' });
    expect(result).toMatchObject({ total: 1, items: [{ action: 'auth.logout' }] });
    await expect(listAudit(createFakeSupabase({}, { failTables: [AUDIT_TABLE] }).client, {})).rejects.toThrow(AUDIT_TABLE);
  });
});
