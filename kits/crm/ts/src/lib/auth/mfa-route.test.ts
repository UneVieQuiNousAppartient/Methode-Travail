// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source n'a pas de test propre à mfa-route.ts ; cas tirés de son contrat : garde des routes MFA, 403 codé, 429 réécrit, verrou de compte des codes).
import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { TOKEN_MODE_REFUSED_MESSAGE } from '@/lib/admin/token-mode';
import { createFakeSupabase, fakeUuid } from '@/test-support/fake-supabase';
import { MFA_MESSAGES } from './mfa';
import { type AccountLockClient, resetAccountLocksForTests } from '@/lib/api/account-lock';
import {
  MFA_ACCOUNT_LOCKED_MESSAGE,
  MFA_THROTTLED_MESSAGE,
  TOKEN_MODE_MESSAGE,
  getMfaSession,
  mfaAccountLock,
  mfaLockKey,
  mfaRefusal,
  mfaThrottled,
  recordBackupCodeAttempt,
  recordMfaCodeFailure,
} from './mfa-route';

const USER = { id: fakeUuid(1), email: 'employe@exemple.test', factors: [{ id: 'f1', status: 'verified' as const }] };
const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const TOKEN = jwt({ sub: USER.id, aal: 'aal1', session_id: fakeUuid(9) });

const fake = () =>
  createFakeSupabase({ team_allowlist: [{ email: USER.email, role: 'employe' }] }, { auth: { users: [USER], sessions: [{ token: TOKEN, userId: USER.id }] } });
const request = (method: string, path: string, token: string | null = TOKEN) =>
  new Request(`https://crm.exemple.test${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('getMfaSession', () => {
  it('membre inscrit en aal1 : la route du code est atteinte (la double vérification n’y bloque pas), jeton rendu', async () => {
    const result = await getMfaSession(request('POST', '/api/admin/mfa/verify'), { db: fake().client });
    expect('session' in result).toBe(true);
    if (!('session' in result)) return;
    expect(result.session.accessToken).toBe(TOKEN);
    expect(result.session.member.mfa).toMatchObject({ satisfied: false, code: 'mfa_required' });
    expect(result.finalize(NextResponse.json({})).headers.get('cache-control')).toBe('no-store');
  });

  it('sans jeton → 401 ; matrice revérifiée (route MFA non listée → 403 required_role) ; base absente → 503', async () => {
    const anonymous = await getMfaSession(request('POST', '/api/admin/mfa/verify', null), { db: fake().client });
    expect('error' in anonymous && anonymous.error.status).toBe(401);
    const unlisted = await getMfaSession(request('POST', '/api/admin/mfa/autre'), { db: fake().client });
    expect('error' in unlisted && unlisted.error.status).toBe(403);
    if ('error' in unlisted) expect(await unlisted.error.json()).toMatchObject({ required_role: 'admin' });
    const noDb = await getMfaSession(request('POST', '/api/admin/mfa/verify'), { db: null });
    expect('error' in noDb && noDb.error.status).toBe(503);
  });
});

describe('réponses', () => {
  it('mfaRefusal : 403 + code, message tiré de MFA_MESSAGES', async () => {
    const response = mfaRefusal('mfa_enrollment_required');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: MFA_MESSAGES.mfa_enrollment_required, code: 'mfa_enrollment_required' });
  });

  it('mfaThrottled : même statut, même Retry-After, message en français', async () => {
    const original = NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '120' } });
    const response = mfaThrottled(original);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(await response.json()).toEqual({ ok: false, error: MFA_THROTTLED_MESSAGE });
    expect(mfaThrottled(NextResponse.json({}, { status: 429 })).headers.get('retry-after')).toBeNull();
  });

  it('message « mode jeton » : celui de token-mode.ts', () => {
    expect(TOKEN_MODE_MESSAGE).toBe(TOKEN_MODE_REFUSED_MESSAGE);
  });
});

// Verrou de compte des routes du code (account-lock.ts) : codes à 6 chiffres et codes de secours sur un compteur.
describe('verrou de compte des codes', () => {
  const member = { email: USER.email };
  const lockedFake = () => {
    const rows: Array<Record<string, unknown>> = [];
    const f = createFakeSupabase(
      { rate_limit_hits: rows },
      {
        rpc: {
          hit_rate_limit: (args, self) => {
            const table = self.tables.rate_limit_hits;
            let row = table.find((r) => r.key === args.p_key);
            if (!row) table.push((row = { key: args.p_key, count: 0, blocked_until: null }));
            row.count = (row.count as number) + 1;
            const blocked = (row.count as number) > (args.p_limit as number);
            if (blocked) row.blocked_until = new Date(Date.now() + (args.p_block_seconds as number) * 1000).toISOString();
            return { data: { blocked, retry_after: blocked ? (args.p_block_seconds as number) : 0 }, error: null };
          },
        },
      },
    );
    return { fake: f, client: f.client as unknown as AccountLockClient };
  };

  it('4 codes faux tolérés, le 5e → 429 no-store ; ensuite le compte est refusé avant toute vérification', async () => {
    resetAccountLocksForTests();
    const { client, fake: f } = lockedFake();
    for (let i = 0; i < 4; i += 1) expect(await recordMfaCodeFailure(member, { client })).toBeNull();
    const fifth = await recordMfaCodeFailure(member, { client });
    expect(fifth?.status).toBe(429);
    expect(fifth?.headers.get('cache-control')).toBe('no-store');
    expect(fifth?.headers.get('retry-after')).toBe('900');
    expect(await fifth?.json()).toEqual({ ok: false, error: MFA_ACCOUNT_LOCKED_MESSAGE });
    resetAccountLocksForTests();
    expect((await mfaAccountLock(member, { client }))?.status).toBe(429);
    expect(JSON.stringify(f.tables)).not.toContain('exemple.test');
  });

  it('codes de secours `invalid` sur le même compteur ; même clé quelle que soit la casse du courriel', async () => {
    resetAccountLocksForTests();
    const { client } = lockedFake();
    expect(mfaLockKey({ email: ' Employe@Exemple.TEST' })).toBe(mfaLockKey(member));
    await recordMfaCodeFailure(member, { client });
    for (let i = 0; i < 3; i += 1) expect(await recordBackupCodeAttempt(member, { ok: false, reason: 'invalid' }, { client })).toBeNull();
    expect((await recordBackupCodeAttempt({ email: 'EMPLOYE@exemple.test' }, { ok: false, reason: 'invalid' }, { client }))?.status).toBe(429);
    expect(await mfaAccountLock({ email: 'autre@exemple.test' }, { client })).toBeNull();
  });
});
