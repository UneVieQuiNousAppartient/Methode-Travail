// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/account-lock.test.ts, commit 508f19a (2026-10-30) ; généralisé : importe account-lock.ts, courriels @exemple.test ; ajoutés : 10e tentative avec bon mot de passe → 429, repli mémoire qui verrouille, casse et espaces, réussite sans effet sur un verrou, codes MFA et de secours sur un même compteur, aucun courriel en clair dans les écritures du faux client.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server-admin', () => ({ getSupabaseAdmin: () => null }));

import { createFakeSupabase, type FakeSupabase } from '@/test-support/fake-supabase';
import { resetSharedCounterAlertForTests } from './abuse-guard';
import {
  ACCOUNT_LOCKED_MESSAGE,
  ACCOUNT_LOGIN_RULE,
  ACCOUNT_MFA_RULE,
  type AccountLockClient,
  accountLockedFor,
  accountLockedResponse,
  accountLockKey,
  attemptAccountLogin,
  type LockReadClient,
  MFA_LOCK_SCOPE,
  normalizeAccountEmail,
  recordBackupCodeResult,
  recordFailedLogin,
  recordFailedMfaCode,
  recordSuccessfulLogin,
  resetAccountLocksForTests,
} from './account-lock';
import { decideHit, type CounterEntry } from './rate-limit-core';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const EMAIL = 'cible@exemple.test';

function readClient(response: { data: unknown; error: { message: string } | null }): AccountLockClient & { eq: ReturnType<typeof vi.fn> } {
  const eq = vi.fn(() => ({ maybeSingle: () => Promise.resolve(response) }));
  return { eq, from: () => ({ select: () => ({ eq }) }), rpc: () => Promise.resolve({ data: null, error: { message: 'non simulée' } }) };
}

/** Faux Supabase dont `hit_rate_limit` applique `decideHit` à la table `rate_limit_hits` (horloge fournie). */
function sharedFake(clock: { now: number }): FakeSupabase & { lockClient: AccountLockClient } {
  const fake = createFakeSupabase(
    { rate_limit_hits: [] },
    {
      rpc: {
        hit_rate_limit: (args, f) => {
          const rows = f.tables.rate_limit_hits;
          const row = rows.find((r) => r.key === args.p_key);
          const existing: CounterEntry | undefined = row
            ? {
                count: row.count as number,
                windowStart: Date.parse(row.window_start as string),
                blockedUntil: row.blocked_until ? Date.parse(row.blocked_until as string) : 0,
              }
            : undefined;
          const rule = { limit: args.p_limit as number, windowMs: (args.p_window_seconds as number) * 1000, blockMs: (args.p_block_seconds as number) * 1000 };
          const d = decideHit(existing, clock.now, rule);
          const next = {
            key: args.p_key,
            count: d.entry.count,
            window_start: new Date(d.entry.windowStart).toISOString(),
            blocked_until: d.entry.blockedUntil ? new Date(d.entry.blockedUntil).toISOString() : null,
          };
          if (row) Object.assign(row, next);
          else rows.push(next);
          return { data: { blocked: d.blocked, retry_after: d.retryAfterSeconds }, error: null };
        },
      },
    },
  );
  return Object.assign(fake, { lockClient: fake.client as unknown as AccountLockClient });
}

beforeEach(() => {
  resetSharedCounterAlertForTests();
  resetAccountLocksForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('accountLockKey', () => {
  it('même compte quelle que soit la casse ou les espaces ; empreinte de 64 caractères, sans le courriel', () => {
    const key = accountLockKey('team-login', '  Cible@Exemple.TEST ');
    expect(key).toBe(accountLockKey('team-login', EMAIL));
    expect(accountLockKey('team-login', 'ci ble@exemple.test\t')).toBe(key);
    expect(normalizeAccountEmail(' A b@Exemple.test ')).toBe('ab@exemple.test');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('cible');
  });

  it('un compteur distinct par portée (connexion ≠ codes ≠ espace client)', () => {
    expect(accountLockKey('team-login', EMAIL)).not.toBe(accountLockKey('client-login', EMAIL));
    expect(accountLockKey('team-login', EMAIL)).not.toBe(accountLockKey(MFA_LOCK_SCOPE, EMAIL));
  });
});

describe('règles', () => {
  it('mot de passe : 9 échecs tolérés, 1 h de fenêtre, 1 h de blocage ; codes : 4 tolérés, 15 min, 15 min', () => {
    expect(ACCOUNT_LOGIN_RULE).toEqual({ limit: 9, windowMs: 3_600_000, blockMs: 3_600_000 });
    expect(ACCOUNT_MFA_RULE).toEqual({ limit: 4, windowMs: 900_000, blockMs: 900_000 });
  });

  it('429 avec Retry-After et message [à adapter] par défaut', async () => {
    const response = accountLockedResponse(120);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('120');
    expect(await response.json()).toEqual({ ok: false, error: ACCOUNT_LOCKED_MESSAGE });
    expect(ACCOUNT_LOCKED_MESSAGE).toContain('[à adapter]');
  });
});

describe('recordFailedLogin (repli en mémoire, base absente)', () => {
  it('le 10e échec dans l’heure bloque le compte 1 h ; les 9 premiers non ; le verrou tombe à son délai', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = accountLockKey('client-login', EMAIL);
    const results: number[] = [];
    for (let i = 0; i < 10; i += 1) results.push(await recordFailedLogin(key, { client: null, now: NOW + i * 1000 }));
    expect(results.slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(results[9]).toBe(3600);
    expect(await accountLockedFor(key, { client: null, now: NOW + 10_000 })).toBeGreaterThan(3500);
    expect(await accountLockedFor(key, { client: null, now: NOW + 9_000 + 3_600_000 + 1 })).toBe(0);
    error.mockRestore();
  });

  it('base injoignable (erreur à chaque appel) → le repli mémoire verrouille aussi, et la lecture le voit', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = readClient({ data: null, error: { message: 'injoignable' } });
    const key = accountLockKey('team-login', EMAIL);
    for (let i = 0; i < 10; i += 1) await recordFailedLogin(key, { client: broken, now: NOW + i });
    expect(await accountLockedFor(key, { client: broken, now: NOW + 100 })).toBe(3600);
    const attempt = await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: async () => true }, { client: broken, now: NOW + 200 });
    expect(attempt.ok).toBe(false);
    expect(!attempt.ok && attempt.response?.status).toBe(429);
    error.mockRestore();
  });
});

describe('attemptAccountLogin (base joignable, faux Supabase)', () => {
  it('9 échecs tolérés, le 10e pose le verrou ; la tentative suivante, même avec le BON mot de passe → 429 sans vérifier', async () => {
    const clock = { now: NOW };
    const fake = sharedFake(clock);
    const wrong = async () => false;
    for (let i = 0; i < 9; i += 1) {
      clock.now = NOW + i * 1000;
      const r = await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: wrong }, { client: fake.lockClient, now: clock.now });
      expect(r).toEqual({ ok: false, response: null });
    }
    clock.now = NOW + 9_000;
    const tenth = await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: wrong }, { client: fake.lockClient, now: clock.now });
    expect(!tenth.ok && tenth.response?.status).toBe(429);

    resetAccountLocksForTests(); // autre instance : seule la base sait que le compte est verrouillé
    const verify = vi.fn(async () => true);
    clock.now = NOW + 10_000;
    const good = await attemptAccountLogin({ scope: 'team-login', email: ' CIBLE@exemple.test', verify }, { client: fake.lockClient, now: clock.now });
    expect(good.ok).toBe(false);
    if (good.ok || !good.response) throw new Error('429 attendu');
    expect(good.response.status).toBe(429);
    expect(Number(good.response.headers.get('Retry-After'))).toBeGreaterThan(3500);
    expect(verify).not.toHaveBeenCalled();
  });

  it('aucun courriel en clair dans la clé ni dans les écritures et appels du faux client', async () => {
    const clock = { now: NOW };
    const fake = sharedFake(clock);
    for (let i = 0; i < 11; i += 1) {
      await attemptAccountLogin({ scope: 'team-login', email: 'Cible@Exemple.test', verify: async () => false }, { client: fake.lockClient, now: NOW });
    }
    await recordFailedMfaCode(accountLockKey(MFA_LOCK_SCOPE, EMAIL), { client: fake.lockClient, now: NOW });
    const everything = JSON.stringify({ tables: fake.tables, queries: fake.queries, writes: fake.writes, rpc: fake.rpcCalls }).toLowerCase();
    expect(fake.rpcCalls.length).toBeGreaterThan(0);
    expect(everything).not.toContain('cible');
    expect(everything).not.toContain('exemple.test');
    for (const row of fake.tables.rate_limit_hits) expect(row.key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('une réussite ne lève jamais un verrou', () => {
  it('verrou posé (mémoire) : une réussite enregistrée ne le lève pas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = accountLockKey('team-login', EMAIL);
    for (let i = 0; i < 10; i += 1) await recordFailedLogin(key, { client: null, now: NOW });
    recordSuccessfulLogin(key);
    expect(await accountLockedFor(key, { client: null, now: NOW + 1000 })).toBeGreaterThan(0);
    error.mockRestore();
  });

  it('une réussite ne remet pas le compteur à zéro : 9 échecs, une réussite, 1 échec → verrou', async () => {
    const clock = { now: NOW };
    const fake = sharedFake(clock);
    for (let i = 0; i < 9; i += 1) await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: async () => false }, { client: fake.lockClient, now: NOW });
    expect(await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: async () => true }, { client: fake.lockClient, now: NOW })).toEqual({ ok: true });
    const last = await attemptAccountLogin({ scope: 'team-login', email: EMAIL, verify: async () => false }, { client: fake.lockClient, now: NOW });
    expect(!last.ok && last.response?.status).toBe(429);
  });
});

describe('codes MFA et codes de secours (même compteur)', () => {
  const key = accountLockKey(MFA_LOCK_SCOPE, EMAIL);

  it('4 codes faux tolérés en 15 min, le 5e verrouille 15 min', async () => {
    const fake = sharedFake({ now: NOW });
    const results: number[] = [];
    for (let i = 0; i < 5; i += 1) results.push(await recordFailedMfaCode(key, { client: fake.lockClient, now: NOW }));
    expect(results).toEqual([0, 0, 0, 0, 900]);
    expect(await accountLockedFor(key, { client: fake.lockClient, now: NOW + 1000 })).toBeGreaterThan(890);
  });

  it('codes de secours : chaque `invalid` compte ; 2 codes à 6 chiffres + 3 codes de secours faux → verrou', async () => {
    const fake = sharedFake({ now: NOW });
    const opts = { client: fake.lockClient, now: NOW };
    await recordFailedMfaCode(key, opts);
    await recordFailedMfaCode(key, opts);
    expect(await recordBackupCodeResult(key, { ok: false, reason: 'invalid' }, opts)).toBe(0);
    expect(await recordBackupCodeResult(key, { ok: false, reason: 'invalid' }, opts)).toBe(0);
    expect(await recordBackupCodeResult(key, { ok: false, reason: 'invalid' }, opts)).toBe(900);
  });

  it('5 codes de secours faux seuls → verrou ; les refus qui ne sont pas des essais ne comptent pas', async () => {
    const fake = sharedFake({ now: NOW });
    const opts = { client: fake.lockClient, now: NOW };
    for (const reason of ['secret_missing', 'no_session', 'db_error', 'incomplete'] as const) {
      expect(await recordBackupCodeResult(key, { ok: false, reason }, opts)).toBe(0);
    }
    expect(await recordBackupCodeResult(key, { ok: true, recoveryExpiresAt: new Date(NOW).toISOString() }, opts)).toBe(0);
    expect(fake.rpcCalls).toHaveLength(0);
    const results: number[] = [];
    for (let i = 0; i < 5; i += 1) results.push(await recordBackupCodeResult(key, { ok: false, reason: 'invalid' }, opts));
    expect(results).toEqual([0, 0, 0, 0, 900]);
  });

  it('un code de secours accepté ne lève pas le verrou posé', async () => {
    const fake = sharedFake({ now: NOW });
    const opts = { client: fake.lockClient, now: NOW };
    for (let i = 0; i < 5; i += 1) await recordFailedMfaCode(key, opts);
    await recordBackupCodeResult(key, { ok: true, recoveryExpiresAt: new Date(NOW).toISOString() }, opts);
    recordSuccessfulLogin(key);
    expect(await accountLockedFor(key, { client: null, now: NOW + 1000 })).toBeGreaterThan(0);
    expect(await accountLockedFor(key, { client: fake.lockClient, now: NOW + 1000 })).toBeGreaterThan(0);
  });
});

describe('accountLockedFor (lecture partagée, ne compte rien)', () => {
  const key = accountLockKey('team-login', 'a@exemple.test');

  it('blocage en cours dans la base → secondes restantes ; lit la bonne ligne', async () => {
    const client = readClient({ data: { blocked_until: new Date(NOW + 120_000).toISOString() }, error: null });
    expect(await accountLockedFor(key, { client, now: NOW })).toBe(120);
    expect(client.eq).toHaveBeenCalledWith('key', key);
  });

  it('aucune ligne, blocage nul ou échu → 0', async () => {
    expect(await accountLockedFor(key, { client: readClient({ data: null, error: null }), now: NOW })).toBe(0);
    expect(await accountLockedFor(key, { client: readClient({ data: { blocked_until: null }, error: null }), now: NOW })).toBe(0);
    const past = new Date(NOW - 1000).toISOString();
    expect(await accountLockedFor(key, { client: readClient({ data: { blocked_until: past }, error: null }), now: NOW })).toBe(0);
  });

  it('panne ou délai dépassé → ouverture (0), une alerte dans les journaux, jamais d’exception', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await accountLockedFor(key, { client: readClient({ data: null, error: { message: 'boom' } }), now: NOW })).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    const slow = { ...readClient({ data: null, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise<never>(() => {}) }) }) }) };
    expect(await accountLockedFor(key, { client: slow, now: NOW, timeoutMs: 5 })).toBe(0);
    error.mockRestore();
  });

  it('client réel : la lecture passe par abortSignal (requête annulée au délai)', async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const abortSignal = vi.fn(() => ({ maybeSingle }));
    const read: LockReadClient = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn(), abortSignal }) }) }) };
    const client: AccountLockClient = { ...read, rpc: () => Promise.resolve({ data: null, error: null }) };
    expect(await accountLockedFor(key, { client, now: NOW })).toBe(0);
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
