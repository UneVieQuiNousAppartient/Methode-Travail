// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source n'a pas de test de mfa-supabase.ts ; cas tirés de son contrat : adresses de Supabase Auth, nom de facteur en conflit, erreurs traduites).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  challengeAndVerify,
  enrollTotp,
  factorName,
  isFactorGoneError,
  isWrongCodeError,
  MFA_ERROR_MESSAGES,
  mfaErrorMessage,
  qrDataUrl,
  signOutSession,
  unenrollFactor,
  unverifiedTotp,
} from './mfa-supabase';

const config = { url: 'https://projet.supabase.test/', anonKey: 'cle-publique' };

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };

/** Faux fetch : chaque appel consomme la réponse suivante ; les appels sont journalisés. */
function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const next = responses.shift();
    if (!next) throw new Error('aucune réponse prévue');
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enrollTotp', () => {
  it('POST /auth/v1/factors avec le jeton du membre, l’émetteur et un nom daté → { id, qr, secret }', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC' } } }]);
    const result = await enrollTotp('jeton', { fetchImpl, config, issuer: 'Mon CRM', now: new Date('2026-10-21T12:00:00Z') });
    expect(result).toEqual({ data: { id: 'f1', qr: `data:image/svg+xml;utf8,${encodeURIComponent('<svg/>')}`, secret: 'ABC' }, error: null });
    expect(calls[0].url).toBe('https://projet.supabase.test/auth/v1/factors');
    expect(calls[0].headers).toMatchObject({ apikey: 'cle-publique', Authorization: 'Bearer jeton' });
    expect(calls[0].body).toMatchObject({ factor_type: 'totp', issuer: 'Mon CRM' });
  });

  it('émetteur par défaut : MFA_ISSUER puis SITE_NAME', async () => {
    vi.stubEnv('MFA_ISSUER', '');
    vi.stubEnv('SITE_NAME', 'Site du projet');
    const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { id: 'f1', totp: {} } }]);
    await enrollTotp('jeton', { fetchImpl, config });
    expect(calls[0].body?.issuer).toBe('Site du projet');
  });

  it('nom déjà pris dans la minute → second essai avec les secondes', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 422, body: { error_code: 'mfa_factor_name_conflict' } },
      { status: 200, body: { id: 'f2', totp: { qr_code: 'data:image/png;base64,xx', secret: 'S' } } },
    ]);
    const result = await enrollTotp('jeton', { fetchImpl, config, now: new Date('2026-10-21T12:00:05Z') });
    expect(result.data?.id).toBe('f2');
    expect(result.data?.qr).toBe('data:image/png;base64,xx');
    expect(calls).toHaveLength(2);
    expect(calls[1].body?.friendly_name).not.toBe(calls[0].body?.friendly_name);
  });

  it('configuration absente → missing_config sans appel ; réseau en panne → network', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const none = fakeFetch([]);
    expect(await enrollTotp('jeton', { fetchImpl: none.fetchImpl })).toEqual({ data: null, error: { code: 'missing_config', status: 500 } });
    expect(none.calls).toHaveLength(0);
    const down = fakeFetch([new Error('ECONNRESET')]);
    expect((await enrollTotp('jeton', { fetchImpl: down.fetchImpl, config })).error).toEqual({ code: 'network', status: 0 });
  });
});

describe('challengeAndVerify', () => {
  it('défi puis vérification → nouvelle session aal2', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { id: 'c1' } },
      { status: 200, body: { access_token: 'a2', refresh_token: 'r2', expires_in: 1800, user: { email: 'membre@exemple.test' } } },
    ]);
    const result = await challengeAndVerify('jeton', 'f/1', '123456', { fetchImpl, config });
    expect(result).toEqual({ session: { accessToken: 'a2', refreshToken: 'r2', expiresIn: 1800, email: 'membre@exemple.test' }, error: null });
    expect(calls.map((c) => c.url)).toEqual([
      'https://projet.supabase.test/auth/v1/factors/f%2F1/challenge',
      'https://projet.supabase.test/auth/v1/factors/f%2F1/verify',
    ]);
    expect(calls[1].body).toEqual({ challenge_id: 'c1', code: '123456' });
  });

  it('code faux → erreur reconnue, aucune session', async () => {
    const { fetchImpl } = fakeFetch([{ status: 200, body: { id: 'c1' } }, { status: 422, body: { error_code: 'mfa_verification_failed' } }]);
    const result = await challengeAndVerify('jeton', 'f1', '000000', { fetchImpl, config });
    expect(result.session).toBeNull();
    expect(isWrongCodeError(result.error)).toBe(true);
    expect(mfaErrorMessage(result.error)).toBe(MFA_ERROR_MESSAGES.wrongCode);
  });

  it('défi refusé → pas de vérification ; réponse incomplète → erreur', async () => {
    const refused = fakeFetch([{ status: 404, body: { error_code: 'mfa_factor_not_found' } }]);
    const result = await challengeAndVerify('jeton', 'f1', '123456', { fetchImpl: refused.fetchImpl, config });
    expect(refused.calls).toHaveLength(1);
    expect(isFactorGoneError(result.error)).toBe(true);
    const partial = fakeFetch([{ status: 200, body: { id: 'c1' } }, { status: 200, body: { access_token: 'a2' } }]);
    expect((await challengeAndVerify('jeton', 'f1', '123456', { fetchImpl: partial.fetchImpl, config })).session).toBeNull();
  });
});

describe('retrait et déconnexion', () => {
  it('unenrollFactor : DELETE sans corps, erreur rendue telle quelle', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 200, body: {} }, { status: 403, body: { error_code: 'insufficient_aal' } }]);
    expect(await unenrollFactor('jeton', 'f1', { fetchImpl, config })).toEqual({ error: null });
    expect(calls[0]).toMatchObject({ method: 'DELETE', body: null, url: 'https://projet.supabase.test/auth/v1/factors/f1' });
    expect(await unenrollFactor('jeton', 'f1', { fetchImpl, config })).toEqual({ error: { code: 'insufficient_aal', status: 403 } });
  });

  it('signOutSession : scope=local ; ne lève jamais', async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 204 }, new Error('panne')]);
    expect(await signOutSession('jeton', { fetchImpl, config })).toEqual({ error: null });
    expect(calls[0].url).toBe('https://projet.supabase.test/auth/v1/logout?scope=local');
    expect(await signOutSession('jeton', { fetchImpl, config })).toEqual({ error: { code: 'network', status: 0 } });
  });
});

describe('messages et utilitaires', () => {
  it('le message brut de Supabase n’est jamais montré', () => {
    expect(mfaErrorMessage({ code: 'over_request_rate_limit', status: 429 })).toBe(MFA_ERROR_MESSAGES.rateLimited);
    expect(mfaErrorMessage({ code: null, status: 429 })).toBe(MFA_ERROR_MESSAGES.rateLimited);
    expect(mfaErrorMessage({ code: 'mfa_totp_enroll_not_enabled', status: 422 })).toBe(MFA_ERROR_MESSAGES.unavailable);
    expect(mfaErrorMessage({ code: null, status: 422 })).toBe(MFA_ERROR_MESSAGES.wrongCode);
    expect(mfaErrorMessage(null)).toBe(MFA_ERROR_MESSAGES.generic);
    expect(isWrongCodeError(null)).toBe(false);
    expect(isFactorGoneError({ code: null, status: 404 })).toBe(true);
  });

  it('qrDataUrl, factorName, unverifiedTotp', () => {
    expect(qrDataUrl('')).toBe('');
    expect(qrDataUrl(null)).toBe('');
    expect(factorName(new Date('2026-10-21T12:00:00Z'), false, 'UTC')).toMatch(/^Téléphone ajouté le /);
    expect(
      unverifiedTotp([
        { id: 'a', factor_type: 'totp', status: 'unverified' },
        { id: 'b', factor_type: 'totp', status: 'verified' },
        { id: 'c', factor_type: 'phone', status: 'unverified' },
      ]).map((f) => f.id),
    ).toEqual(['a']);
  });
});
