// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/turnstile.test.mjs, commit 2954590 (2026-10-27) (sections 1, 2, 3 et 5) + VieSolution-CSF, src/lib/api/abuse-guard.test.ts (clé absente : alerte et 503), commit 508f19a (2026-10-30) ; généralisé : port Vitest ; sections 4 (routes du projet) et 6 (route d'administration du projet) non reprises ; cas du kit ajoutés (nom d'hôte, délai).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  probeTurnstileSecret,
  resetTurnstileForTests,
  siteverify,
  TURNSTILE_TIMEOUT_MS,
  turnstileGuard,
  turnstileHealth,
  turnstileMode,
  turnstileVerdict,
  verifyTurnstile,
  type TurnstileHealth,
} from './turnstile';

type Call = { url: string; body: string; signal?: AbortSignal | null };
type FakeFetch = ((url: string, init: RequestInit) => Promise<Response>) & { calls: Call[] };
const record = (respond: () => Response): FakeFetch => {
  const f = (async (url: string, init: RequestInit) => {
    f.calls.push({ url: String(url), body: String(init?.body || ''), signal: init?.signal });
    return respond();
  }) as FakeFetch;
  f.calls = [];
  return f;
};
const cf = (success: boolean, codes: string[] = [], extra: Record<string, unknown> = {}) =>
  record(() => new Response(JSON.stringify({ success, 'error-codes': codes, ...extra }), { status: 200 }));
const raw = (status: number, text: string) => record(() => new Response(text, { status }));
const boom = (async () => {
  throw new Error('ETIMEDOUT');
}) as unknown as FakeFetch;

let logs: string[] = [];
beforeEach(() => {
  resetTurnstileForTests();
  logs = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '));
  });
  vi.stubEnv('TURNSTILE_SECRET_KEY', undefined);
  vi.stubEnv('TURNSTILE_ENFORCE', undefined);
  vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', undefined);
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const secret = () => vi.stubEnv('TURNSTILE_SECRET_KEY', '0x-secret-test');

describe('1. modes', () => {
  it("sans clé : off, rien n'est vérifié ni appelé", async () => {
    const never = cf(true);
    expect(turnstileMode()).toBe('off');
    expect((await verifyTurnstile('x', '1.2.3.4', { fetchImpl: never })).ok).toBe(true);
    expect(never.calls).toHaveLength(0);
  });
  it('clé seule : verify, jeton absent encore accepté (formulaires pas équipés)', async () => {
    secret();
    const never = cf(true);
    expect(turnstileMode()).toBe('verify');
    expect((await verifyTurnstile('', '1.2.3.4', { fetchImpl: never })).ok).toBe(true);
    expect(never.calls).toHaveLength(0);
  });
  it('verify : bon jeton → accepté, secret et IP envoyés à Cloudflare', async () => {
    secret();
    const good = cf(true);
    const r = await verifyTurnstile('jeton-valide', '203.0.113.9', { fetchImpl: good });
    expect(r).toEqual({ ok: true });
    expect(good.calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(good.calls[0].body).toMatch(/secret=0x-secret-test/);
    expect(good.calls[0].body).toMatch(/remoteip=203\.0\.113\.9/);
  });
  it('verify : jeton faux → refusé avec le code Cloudflare', async () => {
    secret();
    expect(await verifyTurnstile('jeton-faux', '203.0.113.9', { fetchImpl: cf(false, ['invalid-input-response']) })).toEqual({ ok: false, reason: 'invalid-input-response' });
  });
  it('verify : jeton démesuré → refusé sans appel', async () => {
    secret();
    const never = cf(true);
    expect((await verifyTurnstile('x'.repeat(3000), null, { fetchImpl: never })).ok).toBe(false);
    expect(never.calls).toHaveLength(0);
  });
  it('Cloudflare injoignable → on laisse passer (journalisé)', async () => {
    secret();
    expect(await verifyTurnstile('jeton', null, { fetchImpl: boom })).toEqual({ ok: true, skipped: 'injoignable' });
    expect(logs.some((l) => l.startsWith('[turnstile]') && l.includes('ETIMEDOUT'))).toBe(true);
  });
});

describe('2. qui est en faute : configuration et Cloudflare laissent passer, le visiteur est refusé', () => {
  beforeEach(secret);
  const verdictOf = async (fetchImpl: FakeFetch) => {
    logs.length = 0;
    const r = await verifyTurnstile('jeton', '203.0.113.9', { fetchImpl });
    return { r, log: logs.join('\n') };
  };
  const lastProblem = async () => (await turnstileHealth({ fetchImpl: cf(false, ['invalid-input-response']) })).last_problem;

  it('invalid-input-secret → accepté (config), journal « CONFIGURATION », incident noté sans le secret', async () => {
    const v = await verdictOf(cf(false, ['invalid-input-secret']));
    const lp = await lastProblem();
    expect(v.r).toEqual({ ok: true, skipped: 'config' });
    expect(v.log).toMatch(/^\[turnstile\] CONFIGURATION/m);
    expect(lp?.kind).toBe('config');
    expect(lp?.codes.join()).toBe('invalid-input-secret');
    expect(Number.isNaN(Date.parse(lp?.at ?? ''))).toBe(false);
    expect(v.log).not.toContain('0x-secret-test');
    expect(JSON.stringify(lp)).not.toContain('0x-secret-test');
  });
  it('missing-input-secret → accepté (config)', async () => {
    const v = await verdictOf(cf(false, ['missing-input-secret']));
    expect(v.r).toEqual({ ok: true, skipped: 'config' });
    expect((await lastProblem())?.codes.join()).toBe('missing-input-secret');
  });
  it('internal-error → accepté (cloudflare), journal « CLOUDFLARE »', async () => {
    const v = await verdictOf(cf(false, ['internal-error']));
    expect(v.r).toEqual({ ok: true, skipped: 'cloudflare' });
    expect(v.log).toMatch(/^\[turnstile\] CLOUDFLARE/m);
    expect((await lastProblem())?.kind).toBe('cloudflare');
  });
  it.each([
    ['HTTP 500 avec une page HTML', raw(500, '<!DOCTYPE html><html><body>Internal Server Error</body></html>')],
    ['HTTP 200 au corps illisible', raw(200, 'pas du JSON')],
    ['corps JSON « null »', raw(200, 'null')],
    ['HTTP 502 même en JSON', raw(502, JSON.stringify({ success: false, 'error-codes': [] }))],
  ])('%s → accepté (cloudflare)', async (_label, f) => {
    expect((await verdictOf(f)).r).toEqual({ ok: true, skipped: 'cloudflare' });
  });
  it('HTTP 500 : le statut figure dans le journal', async () => {
    expect((await verdictOf(raw(500, '<html>'))).log).toMatch(/^\[turnstile\] CLOUDFLARE .*HTTP 500/m);
  });
  it("clé secrète refusée avec un statut non 2xx → config (la clé d'abord)", async () => {
    expect((await verdictOf(raw(400, JSON.stringify({ success: false, 'error-codes': ['invalid-input-secret'] })))).r).toEqual({ ok: true, skipped: 'config' });
  });
  it.each(['invalid-input-response', 'timeout-or-duplicate', 'bad-request', 'code-inconnu-2027'])('%s → refusé (faute du visiteur)', async (code) => {
    const v = await verdictOf(cf(false, [code]));
    expect(v.r).toEqual({ ok: false, reason: code });
    expect(v.log).not.toMatch(/CONFIGURATION|CLOUDFLARE/);
  });
  it('aucun code et success false → refusé ; success absent → refusé', async () => {
    expect((await verdictOf(cf(false, []))).r).toEqual({ ok: false, reason: 'invalide' });
    expect((await verdictOf(raw(200, JSON.stringify({ 'error-codes': [] })))).r.ok).toBe(false);
  });
  it('enforce : jeton absent → refusé (absent) sans appel ; clé secrète refusée → accepté quand même', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const never = cf(true);
    expect(turnstileMode()).toBe('enforce');
    expect(await verifyTurnstile(undefined, null, { fetchImpl: never })).toEqual({ ok: false, reason: 'absent' });
    expect(never.calls).toHaveLength(0);
    expect((await verdictOf(cf(false, ['invalid-input-secret']))).r).toEqual({ ok: true, skipped: 'config' });
  });
});

describe('3. garde : 403 { detail, code, reason }, messages sans « recharger »', () => {
  beforeEach(secret);
  const post = (body: unknown) =>
    new NextRequest('https://exemple.test/api/demande', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const guardOut = async (body: { turnstile_token?: unknown }, lang: 'fr' | 'en', fetchImpl?: FakeFetch) => {
    const res = await turnstileGuard(post(body), body, { lang, fetchImpl });
    return res ? { status: res.status, out: (await res.json()) as { detail: string; code: string; reason: string } } : null;
  };

  it('absent (fr/en) → 403, reason « absent », patienter puis renvoyer', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const fr = await guardOut({}, 'fr');
    const en = await guardOut({}, 'en');
    expect(fr).toMatchObject({ status: 403, out: { code: 'turnstile', reason: 'absent' } });
    expect(fr?.out.detail).toBe("La vérification de sécurité n'est pas encore terminée. Patientez quelques secondes (cochez la case si elle apparaît), puis cliquez de nouveau sur le bouton d'envoi : vos réponses sont conservées.");
    expect(en?.out.detail).toBe('The security check is not finished yet. Wait a few seconds (tick the box if it appears), then click the submit button again: your answers are kept.');
  });
  it('refusé (fr/en) → 403, reason « refuse », cliquer de nouveau sur Envoyer', async () => {
    const fr = await guardOut({ turnstile_token: 'faux' }, 'fr', cf(false, ['timeout-or-duplicate']));
    const en = await guardOut({ turnstile_token: 'faux' }, 'en', cf(false, ['invalid-input-response']));
    expect(fr).toMatchObject({ status: 403, out: { code: 'turnstile', reason: 'refuse' } });
    expect(fr?.out.detail).toBe("La vérification de sécurité a expiré ou n'a pas abouti. Cliquez de nouveau sur le bouton d'envoi : vos réponses sont conservées.");
    expect(en?.out.detail).toBe('The security check expired or did not complete. Click the submit button again: your answers are kept.');
  });
  it('aucun message ne fait recharger la page', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const all = [await guardOut({}, 'fr'), await guardOut({}, 'en'), await guardOut({ turnstile_token: 'x' }, 'fr', cf(false, ['bad-request']))]
      .map((x) => x?.out.detail ?? '')
      .join('\n');
    expect(all).not.toMatch(/recharg|reload|refresh|actualis/i);
  });
  it('garde : clé secrète refusée ou Cloudflare en panne → la requête continue (null)', async () => {
    expect(await guardOut({ turnstile_token: 'x' }, 'fr', cf(false, ['invalid-input-secret']))).toBeNull();
    expect(await guardOut({ turnstile_token: 'x' }, 'fr', raw(500, '<html>'))).toBeNull();
  });
});

describe('clé absente (première source : alerte et refus 503)', () => {
  it('en production : laisse passer, UNE erreur dans les journaux par instance', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await verifyTurnstile(undefined, null)).toEqual({ ok: true, skipped: 'off' });
    expect(await verifyTurnstile('jeton', null)).toEqual({ ok: true, skipped: 'off' });
    expect(logs.filter((l) => l.includes('TURNSTILE_SECRET_KEY absente en production'))).toHaveLength(1);
  });
  it('hors production : aucune alerte', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await verifyTurnstile(undefined, null);
    expect(logs).toHaveLength(0);
  });
  it('TURNSTILE_ENFORCE=1 sans clé : garde → 503, jamais d’ouverture silencieuse', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const never = cf(true);
    const req = new NextRequest('https://exemple.test/api/demande', { method: 'POST' });
    const res = await turnstileGuard(req, { turnstile_token: 'jeton' }, { fetchImpl: never });
    expect(res?.status).toBe(503);
    expect(((await res?.json()) as { reason: string }).reason).toBe('indisponible');
    expect(never.calls).toHaveLength(0);
  });
  it('TURNSTILE_ENFORCE=1 sans clé : la santé dit « failure » (ajouté pour le kit)', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const h = await turnstileHealth({ now: 0 });
    expect(h.enforce_sans_cle).toBe(true);
    expect(turnstileVerdict(h).level).toBe('failure');
  });
});

describe('5. santé : sonde de la clé secrète (cache 10 min) et lecture ok / warning / failure', () => {
  const MIN = 60 * 1000;
  beforeEach(secret);

  it('sonde : invalid-input-response → « ok », jeton de sonde du kit, sans IP ; cache 10 min ; puis nouvel appel', async () => {
    const T = 1_000_000_000;
    const probeOk = cf(false, ['invalid-input-response']);
    expect(await probeTurnstileSecret({ fetchImpl: probeOk, now: T })).toBe('ok');
    expect(probeOk.calls).toHaveLength(1);
    expect(probeOk.calls[0].body).toMatch(/response=kit-health-probe/);
    expect(probeOk.calls[0].body).toMatch(/secret=0x-secret-test/);
    expect(probeOk.calls[0].body).not.toMatch(/remoteip/);
    const cached = cf(false, ['invalid-input-secret']);
    expect(await probeTurnstileSecret({ fetchImpl: cached, now: T + 9 * MIN })).toBe('ok');
    expect(cached.calls).toHaveLength(0);
    expect(await probeTurnstileSecret({ fetchImpl: cached, now: T + 10 * MIN })).toBe('invalide');
    expect(cached.calls).toHaveLength(1);
  });
  it.each([
    ['missing-input-secret', cf(false, ['missing-input-secret']), 'invalide'],
    ['succès sans marque de test', cf(true), 'ok'],
    ['clé de TEST (succès)', cf(true, [], { metadata: { result_with_testing_key: true } }), 'test'],
    ['clé de TEST (échec)', cf(false, ['invalid-input-response'], { metadata: { result_with_testing_key: true } }), 'test'],
    ['bad-request', cf(false, ['bad-request']), 'ok'],
    ['exception', boom, 'injoignable'],
    ['HTTP 500', raw(500, '<html>'), 'injoignable'],
    ['corps illisible', raw(200, 'oops'), 'injoignable'],
    ['internal-error', cf(false, ['internal-error']), 'injoignable'],
  ])('sonde : %s → « %s »', async (_label, fetchImpl, want) => {
    expect(await probeTurnstileSecret({ fetchImpl, now: 5 })).toBe(want);
  });
  it('sonde : clé secrète changée → nouvel appel sans attendre le cache', async () => {
    await probeTurnstileSecret({ fetchImpl: cf(false, ['invalid-input-secret']), now: 0 });
    vi.stubEnv('TURNSTILE_SECRET_KEY', '0x-autre-secret');
    const rekey = cf(false, ['invalid-input-response']);
    expect(await probeTurnstileSecret({ fetchImpl: rekey, now: MIN })).toBe('ok');
    expect(rekey.calls).toHaveLength(1);
  });
  it('health : { mode, site_key, secret, last_problem, production } seulement, jamais le secret', async () => {
    vi.stubEnv('TURNSTILE_ENFORCE', '1');
    const h = await turnstileHealth({ fetchImpl: cf(false, ['invalid-input-response']), now: 0 });
    expect(Object.keys(h)).toEqual(['mode', 'site_key', 'secret', 'last_problem', 'production']);
    expect(h).toMatchObject({ mode: 'enforce', site_key: false, secret: 'ok' });
    expect(JSON.stringify(h)).not.toContain('secret-test');
  });
  it('health : sans clé → mode off, secret null, aucun appel à Cloudflare', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', undefined);
    const offCalls = cf(true);
    const hOff = await turnstileHealth({ fetchImpl: offCalls, now: 0 });
    expect(hOff.mode).toBe('off');
    expect(hOff.secret).toBeNull();
    expect(offCalls.calls).toHaveLength(0);
    expect(turnstileVerdict(hOff).level).toBe('warning');
  });

  const H = (over: Partial<TurnstileHealth>): TurnstileHealth => ({ mode: 'verify', site_key: true, secret: 'ok', last_problem: null, production: false, ...over });
  it('verdicts', () => {
    expect(turnstileVerdict(H({}))).toEqual({ level: 'ok', problem: null });
    expect(turnstileVerdict(H({ secret: 'invalide' })).level).toBe('failure');
    expect(turnstileVerdict(H({ mode: 'enforce', secret: 'invalide', site_key: false })).level).toBe('failure');
    expect(turnstileVerdict(H({ site_key: false })).level).toBe('warning');
    expect(turnstileVerdict(H({ site_key: false })).problem).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
    expect(turnstileVerdict(H({ mode: 'enforce', site_key: false })).level).toBe('failure');
    expect(turnstileVerdict(H({ secret: 'injoignable' })).level).toBe('warning');
    const incident = { at: '2026-09-26T12:00:00.000Z', kind: 'cloudflare' as const, codes: ['internal-error'] };
    expect(turnstileVerdict(H({ last_problem: incident }), Date.parse('2026-09-27T11:00:00.000Z')).level).toBe('warning');
    expect(turnstileVerdict(H({ last_problem: incident }), Date.parse('2026-09-27T12:30:00.000Z')).level).toBe('ok');
    expect(turnstileVerdict(H({ secret: 'test', production: true })).level).toBe('failure');
    expect(turnstileVerdict(H({ secret: 'test', production: false })).level).toBe('warning');
    expect(turnstileVerdict(H({ secret: 'test' })).problem).toMatch(/TEST/);
  });
  it('siteverify : réponse brute { status, json, success, error_codes, hostname, challenge_ts, testing_key }', async () => {
    const pairOk = cf(true, [], { hostname: 'exemple.test', challenge_ts: '2026-09-26T15:00:00.000Z' });
    expect(await siteverify('t', null, { fetchImpl: pairOk })).toEqual({
      status: 200, json: true, success: true, error_codes: [], hostname: 'exemple.test', challenge_ts: '2026-09-26T15:00:00.000Z', testing_key: false,
    });
  });
});

describe('ajoutés pour le kit (écart n° 7 : délai et nom d’hôte)', () => {
  beforeEach(secret);

  it('délai de 5 s passé à fetch (AbortSignal)', async () => {
    expect(TURNSTILE_TIMEOUT_MS).toBe(5000);
    const good = cf(true);
    await verifyTurnstile('jeton', null, { fetchImpl: good });
    expect(good.calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('délai dépassé (TimeoutError) → « faute de notre côté » : accepté en verify, journalisé', async () => {
    const timeout = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as FakeFetch;
    expect(await verifyTurnstile('jeton', null, { fetchImpl: timeout })).toEqual({ ok: true, skipped: 'injoignable' });
    expect(logs.some((l) => l.includes('timeout'))).toBe(true);
  });
  it('TURNSTILE_EXPECTED_HOSTNAME absente : aucun contrôle du nom d’hôte', async () => {
    expect(await verifyTurnstile('jeton', null, { fetchImpl: cf(true, [], { hostname: 'autre-site.test' }) })).toEqual({ ok: true });
  });
  it('nom d’hôte différent → refusé (403 par la garde) ; nom attendu (casse ignorée, liste) → accepté', async () => {
    vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', 'exemple.test, www.exemple.test');
    expect(await verifyTurnstile('jeton', null, { fetchImpl: cf(true, [], { hostname: 'autre-site.test' }) })).toEqual({ ok: false, reason: 'hostname' });
    expect(await verifyTurnstile('jeton', null, { fetchImpl: cf(true, [], {}) })).toEqual({ ok: false, reason: 'hostname' });
    expect(await verifyTurnstile('jeton', null, { fetchImpl: cf(true, [], { hostname: 'WWW.Exemple.test' }) })).toEqual({ ok: true });
    const req = new NextRequest('https://exemple.test/api/demande', { method: 'POST' });
    const res = await turnstileGuard(req, { turnstile_token: 'jeton' }, { fetchImpl: cf(true, [], { hostname: 'autre-site.test' }) });
    expect(res?.status).toBe(403);
  });
  it('IP lue par request-ip (x-vercel-forwarded-for d’abord)', async () => {
    const good = cf(true);
    const req = new NextRequest('https://exemple.test/api/demande', { method: 'POST', headers: { 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '203.0.113.5' } });
    expect(await turnstileGuard(req, { turnstile_token: 'jeton' }, { fetchImpl: good })).toBeNull();
    expect(good.calls[0].body).toMatch(/remoteip=203\.0\.113\.5/);
  });
});
