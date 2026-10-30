// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source n'a pas de test propre à mfa-route.ts ; cas tirés de son contrat : garde des routes MFA, 403 codé, 429 réécrit).
import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { TOKEN_MODE_REFUSED_MESSAGE } from '@/lib/admin/token-mode';
import { createFakeSupabase, fakeUuid } from '@/test-support/fake-supabase';
import { MFA_MESSAGES } from './mfa';
import { MFA_THROTTLED_MESSAGE, TOKEN_MODE_MESSAGE, getMfaSession, mfaRefusal, mfaThrottled } from './mfa-route';

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
