// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/health/verdict.test.ts (bloc « battement du tick »), commit 508f19a (2026-10-30) ; généralisé : courriel d'exemple sur un domaine réservé ; écrit pour le kit : écriture et lecture contre le faux Supabase.
import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test-support/fake-supabase';
import { HEARTBEAT_TABLE, NOM_TICK, enregistrerBattement, ligneBattement, lireDernierTick, messageErreurTick } from './heartbeat';
import { verdictTick } from './verdict';

const startedAt = new Date('2026-01-15T14:00:00.000Z');
const finishedAt = new Date('2026-01-15T14:00:05.000Z');

describe('battement du tick (ligne et message)', () => {
  it('succès : last_error null ; échec : message borné', () => {
    expect(ligneBattement('tick', { startedAt, finishedAt, ok: true, error: 'ignoré' })).toEqual({
      name: 'tick',
      last_started_at: startedAt.toISOString(),
      last_finished_at: finishedAt.toISOString(),
      last_ok: true,
      last_error: null,
    });
    expect(ligneBattement('tick', { startedAt, finishedAt, ok: false, error: 'x'.repeat(500) }).last_error).toHaveLength(200);
    expect(ligneBattement('tick', { startedAt, finishedAt, ok: false, error: null }).last_error).toBe('erreur');
  });
  it('message d’erreur : jamais le texte d’une exception', () => {
    expect(messageErreurTick({ exception: new RangeError('marie@exemple.test') })).toBe('exception : RangeError');
    expect(messageErreurTick({ exception: 'texte brut' })).toBe('exception : inconnue');
    expect(messageErreurTick({ moteurIndisponible: true })).toContain('indisponible');
    expect(messageErreurTick({ reglesEnErreur: [['a', 1], ['b', 3]] })).toBe('a : 1 erreur(s) · b : 3 erreur(s)');
    expect(messageErreurTick({})).toBeNull();
  });
});

describe('écriture et lecture (faux Supabase)', () => {
  it('aucune ligne → null (le verdict dit panne) ; après un passage → relu, une seule ligne écrasée', async () => {
    const fake = createFakeSupabase({ [HEARTBEAT_TABLE]: [] });
    expect(await lireDernierTick(fake.client)).toBeNull();
    expect(verdictTick(null, finishedAt).niveau).toBe('panne');

    expect(await enregistrerBattement(fake.client, NOM_TICK, { startedAt, finishedAt, ok: false, error: 'a : 1 erreur(s)' })).toBe(true);
    expect(await enregistrerBattement(fake.client, NOM_TICK, { startedAt, finishedAt, ok: true, error: null })).toBe(true);
    expect(fake.tables[HEARTBEAT_TABLE]).toHaveLength(1);
    expect(await lireDernierTick(fake.client)).toEqual({ lastFinishedAt: finishedAt.toISOString(), lastOk: true });
  });
  it('écriture en échec → false, sans lever ; lecture en échec → lève (repli « injoignable » côté route)', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = createFakeSupabase({}, { failTables: [HEARTBEAT_TABLE] });
    expect(await enregistrerBattement(fake.client, NOM_TICK, { startedAt, finishedAt, ok: true, error: null })).toBe(false);
    await expect(lireDernierTick(fake.client)).rejects.toThrow(/cron_heartbeats/);
    erreur.mockRestore();
  });
});
