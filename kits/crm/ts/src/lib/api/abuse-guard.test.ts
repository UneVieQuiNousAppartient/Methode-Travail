// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/abuse-guard.test.ts + shared-abuse-guard.test.ts, commit 508f19a (2026-10-30) ; généralisé : les deux fichiers réunis, domaine → exemple.test, libellé HMAC du kit ; tests Turnstile → turnstile.test.ts, empreinte « visiteur » retirée avec le code (lot 2) ; cas du kit ajoutés en fin de fichier.
import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  enforceAbuseGuard,
  enforceSharedAbuseGuard,
  getFingerprint,
  hashRateLimitKey,
  hitSharedCounter,
  IP_ONLY_FACTOR,
  purgeSharedCounters,
  RATE_LIMIT_KEY_LABEL,
  readJsonBodyWithLimit,
  resetSharedCounterAlertForTests,
  SHARED_COUNTER_TIMEOUT_MS,
  SHARED_FALLBACK_ALERT_INTERVAL_MS,
  validateFormRequest,
  validateJsonRequest,
  type RpcClient,
} from './abuse-guard';

// Compteur partagé (RPC hit_rate_limit) avec ouverture en cas de panne, et lecture
// du corps plafonnée même sans content-length.

const policy = { scope: 'test-shared', limit: 2, windowMs: 60_000, blockMs: 120_000 };
const KEY = 'a'.repeat(64);

function request(ip = '203.0.113.7', ua = 'robot/1.0') {
  return new NextRequest('https://exemple.test/api/leads', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'user-agent': ua },
  });
}

// Faux client : la fonction `rpc` reste un mock inspectable (calls) tout en satisfaisant RpcClient.
type FakeClient = RpcClient & { rpc: ReturnType<typeof vi.fn> };
function fake(rpc: ReturnType<typeof vi.fn>): FakeClient {
  return { rpc } as unknown as FakeClient;
}

function rpcReturning(...results: Array<{ data: unknown; error: { message: string } | null }>) {
  const rpc = vi.fn();
  for (const result of results) rpc.mockResolvedValueOnce(result);
  return fake(rpc);
}

describe('hitSharedCounter', () => {
  beforeEach(() => resetSharedCounterAlertForTests());
  afterEach(() => vi.restoreAllMocks());

  it('passe les paramètres en secondes à la RPC et lit sa réponse', async () => {
    const client = rpcReturning({ data: { blocked: true, retry_after: 90 }, error: null });
    const result = await hitSharedCounter(KEY, { limit: 5, windowMs: 600_000, blockMs: 900_500 }, { client });
    expect(result).toEqual({ blocked: true, retryAfterSeconds: 90, degraded: false });
    expect(client.rpc).toHaveBeenCalledWith('hit_rate_limit', {
      p_key: KEY,
      p_limit: 5,
      p_window_seconds: 600,
      p_block_seconds: 901,
    });
  });

  it('RPC en erreur : la mémoire prend le relais (et bloque au-delà de la limite), une seule alerte', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fake(vi.fn().mockResolvedValue({ data: null, error: { message: 'function does not exist' } }));
    const rule = { limit: 2, windowMs: 60_000, blockMs: 120_000 };
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await hitSharedCounter(KEY, rule, { client, now: 1000 + i }));
    expect(results.map((r) => [r.blocked, r.degraded])).toEqual([[false, true], [false, true], [true, true]]);
    expect(results[2].retryAfterSeconds).toBe(120);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('repli sur le compteur en mémoire');
  });

  it('RPC qui lève, réponse inattendue, Supabase absent : jamais d’exception, repli mémoire', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rule = { limit: 10, windowMs: 60_000, blockMs: 60_000 };
    const throwing = fake(vi.fn().mockRejectedValue(new Error('fetch failed')));
    expect(await hitSharedCounter(KEY, rule, { client: throwing })).toMatchObject({ blocked: false, degraded: true });
    const odd = rpcReturning({ data: [{ blocked: false }], error: null });
    expect(await hitSharedCounter(KEY, rule, { client: odd })).toMatchObject({ blocked: false, degraded: true });
    expect(await hitSharedCounter(KEY, rule, { client: null })).toMatchObject({ blocked: false, degraded: true });
  });

  it('RPC plus lente que le délai : repli mémoire sans attendre la réponse', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const slow = fake(vi.fn(() => new Promise(() => {})));
    const started = Date.now();
    const result = await hitSharedCounter(KEY, { limit: 1, windowMs: 1000, blockMs: 1000 }, { client: slow, timeoutMs: 20 });
    expect(result.degraded).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('enforceSharedAbuseGuard', () => {
  beforeEach(() => resetSharedCounterAlertForTests());
  afterEach(() => vi.restoreAllMocks());

  it('compteur IP seule (limite ×IP_ONLY_FACTOR) puis IP + user-agent ; 429 avec Retry-After', async () => {
    const client = rpcReturning(
      { data: { blocked: false, retry_after: 0 }, error: null },
      { data: { blocked: true, retry_after: 42 }, error: null },
    );
    const response = await enforceSharedAbuseGuard(request(), policy, { client });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('42');
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc.mock.calls[0][1].p_limit).toBe(policy.limit * IP_ONLY_FACTOR);
    expect(client.rpc.mock.calls[1][1].p_limit).toBe(policy.limit);
    // Les clés envoyées sont des empreintes, jamais l'IP en clair.
    for (const [, args] of client.rpc.mock.calls) {
      expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
      expect(args.p_key).not.toContain('203.0.113.7');
    }
  });

  it('IP seule bloquée : le second compteur n’est pas sollicité', async () => {
    const client = rpcReturning({ data: { blocked: true, retry_after: 7 }, error: null });
    const response = await enforceSharedAbuseGuard(request(), policy, { client });
    expect(response?.status).toBe(429);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('base en panne : la garde en mémoire bloque à la 3e requête, sans erreur 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fake(vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } }));
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await enforceSharedAbuseGuard(request('198.51.100.9'), policy, { client });
      statuses.push(response?.status ?? 200);
    }
    expect(statuses).toEqual([200, 200, 429]);
    // Panne détectée au premier compteur : le second va directement en mémoire.
    expect(client.rpc).toHaveBeenCalledTimes(3);
  });
});

describe('readJsonBodyWithLimit', () => {
  function streamed(text: string) {
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 4096) controller.enqueue(bytes.slice(i, i + 4096));
        controller.close();
      },
    });
    return new Request('https://exemple.test/api/leads', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  }

  it('un corps de 40 Ko sans content-length est refusé (413)', async () => {
    const request = streamed(JSON.stringify({ values: { message: 'x'.repeat(40 * 1024) } }));
    expect(request.headers.get('content-length')).toBeNull();
    const result = await readJsonBodyWithLimit(request, 32 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      expect(await result.response.json()).toEqual({ ok: false, error: 'Payload too large.' });
    }
  });

  it('plafond par défaut : 32 Ko', async () => {
    const result = await readJsonBodyWithLimit(streamed(JSON.stringify({ x: 'y'.repeat(33 * 1024) })));
    expect(result.ok).toBe(false);
  });

  it('corps valide : même objet que request.json()', async () => {
    const payload = { values: { name: 'Évelyne Tremblay', email: 'e@example.com' }, source: 'contact' };
    expect(await readJsonBodyWithLimit(streamed(JSON.stringify(payload)), 16 * 1024)).toEqual({ ok: true, body: payload });
  });

  it('JSON invalide, corps vide ou absent : body null (comme request.json().catch(() => null))', async () => {
    expect(await readJsonBodyWithLimit(streamed('{pas du json'), 1024)).toEqual({ ok: true, body: null });
    expect(await readJsonBodyWithLimit(streamed(''), 1024)).toEqual({ ok: true, body: null });
    expect(await readJsonBodyWithLimit(new Request('https://exemple.test/x', { method: 'POST' }), 1024)).toEqual({
      ok: true,
      body: null,
    });
  });
});

describe('empreintes HMAC et IPv6 /64', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('HMAC-SHA256 avec une clé dérivée de RATE_LIMIT_PEPPER : 64 caractères hexadécimaux, pas un SHA-256 nu', () => {
    vi.stubEnv('RATE_LIMIT_PEPPER', 'poivre-de-test');
    const key = createHmac('sha256', 'poivre-de-test').update(RATE_LIMIT_KEY_LABEL).digest();
    const expected = createHmac('sha256', key).update('api-leads:203.0.113.7').digest('hex');
    expect(getFingerprint(request(), 'api-leads')).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(expected).not.toBe(createHash('sha256').update('api-leads:203.0.113.7').digest('hex'));
  });

  it('change avec le secret ; repli sur CRON_SECRET puis SUPABASE_SERVICE_ROLE_KEY', () => {
    vi.stubEnv('RATE_LIMIT_PEPPER', 'secret-a');
    const a = hashRateLimitKey('x');
    vi.stubEnv('RATE_LIMIT_PEPPER', 'secret-b');
    expect(hashRateLimitKey('x')).not.toBe(a);
    vi.stubEnv('RATE_LIMIT_PEPPER', '');
    vi.stubEnv('CRON_SECRET', 'secret-a');
    expect(hashRateLimitKey('x')).toBe(a);
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret-a');
    expect(hashRateLimitKey('x')).toBe(a);
  });

  it('sans aucun secret : clé aléatoire de l’instance, stable d’un appel à l’autre', () => {
    vi.stubEnv('RATE_LIMIT_PEPPER', '');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const first = hashRateLimitKey('x');
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRateLimitKey('x')).toBe(first);
  });

  it('deux adresses IPv6 du même /64 ont la même empreinte ; un autre /64 non', () => {
    vi.stubEnv('RATE_LIMIT_PEPPER', 'p');
    const a = request('2001:db8:abcd:12::1');
    const b = request('2001:db8:abcd:12:ffff:1:2:3');
    const c = request('2001:db8:abcd:13::1');
    expect(getFingerprint(a, 's')).toBe(getFingerprint(b, 's'));
    expect(getFingerprint(a, 's')).not.toBe(getFingerprint(c, 's'));
  });
});

describe('annulation au délai et réarmement de l’alerte', () => {
  beforeEach(() => resetSharedCounterAlertForTests());
  afterEach(() => vi.restoreAllMocks());

  it('passe un AbortSignal à la requête quand le client le permet', async () => {
    let received: AbortSignal | undefined;
    const builder = {
      then: (resolve: (value: unknown) => void) => resolve({ data: { blocked: false, retry_after: 0 }, error: null }),
      abortSignal: vi.fn((signal: AbortSignal) => {
        received = signal;
        return Promise.resolve({ data: { blocked: false, retry_after: 0 }, error: null });
      }),
    };
    const client = fake(vi.fn(() => builder));
    const result = await hitSharedCounter(KEY, { limit: 1, windowMs: 1000, blockMs: 1000 }, { client, timeoutMs: 50 });
    expect(result.degraded).toBe(false);
    expect(builder.abortSignal).toHaveBeenCalledTimes(1);
    expect(received).toBeInstanceOf(AbortSignal);
  });

  it('panne qui dure : une alerte, puis une nouvelle après 15 minutes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rule = { limit: 100, windowMs: 60_000, blockMs: 60_000 };
    await hitSharedCounter(KEY, rule, { client: null, now: 0 });
    await hitSharedCounter(KEY, rule, { client: null, now: 60_000 });
    await hitSharedCounter(KEY, rule, { client: null, now: SHARED_FALLBACK_ALERT_INTERVAL_MS - 1 });
    expect(error).toHaveBeenCalledTimes(1);
    await hitSharedCounter(KEY, rule, { client: null, now: SHARED_FALLBACK_ALERT_INTERVAL_MS });
    expect(error).toHaveBeenCalledTimes(2);
    expect(SHARED_FALLBACK_ALERT_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});

describe('purgeSharedCounters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('appelle la RPC de purge et renvoie le nombre de lignes', async () => {
    const client = rpcReturning({ data: 42, error: null });
    expect(await purgeSharedCounters(client)).toBe(42);
    expect(client.rpc).toHaveBeenCalledWith('purge_rate_limit_hits', { p_max: 5000 });
  });

  it('migration absente ou exception : null, jamais d’erreur', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await purgeSharedCounters(rpcReturning({ data: null, error: { message: 'absente' } }))).toBeNull();
    expect(await purgeSharedCounters(fake(vi.fn().mockRejectedValue(new Error('réseau'))))).toBeNull();
  });
});

describe('enforceAbuseGuard', () => {
  function from(ip: string, userAgent: string, language = 'fr') {
    return new NextRequest('https://exemple.test/api/leads', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, 'user-agent': userAgent, 'accept-language': language },
    });
  }
  const policy = (name: string) => ({ scope: `test-${name}-${Math.random()}`, limit: 3, windowMs: 60_000, blockMs: 60_000 });
  const statuses = (requests: NextRequest[], p: ReturnType<typeof policy>) =>
    requests.map((r) => enforceAbuseGuard(r, p)?.status ?? 200);

  it('l’empreinte par IP seule ignore le user-agent et la langue ; celle du second palier les distingue', () => {
    expect(getFingerprint(from('203.0.113.7', 'robot/1', 'fr'), 's')).toBe(getFingerprint(from('203.0.113.7', 'robot/2', 'en'), 's'));
    expect(getFingerprint(from('203.0.113.7', 'a'), 's')).not.toBe(getFingerprint(from('203.0.113.8', 'a'), 's'));
    expect(getFingerprint(from('203.0.113.7', 'robot/1'), 's', true)).not.toBe(getFingerprint(from('203.0.113.7', 'robot/2'), 's', true));
  });

  it('un même appareil est bloqué (429) au-delà de la limite de la politique', () => {
    const p = policy('appareil');
    expect(statuses(Array.from({ length: 5 }, () => from('198.51.100.9', 'robot/1')), p)).toEqual([200, 200, 200, 429, 429]);
  });

  it('changer de user-agent à chaque requête ne contourne pas la limite par IP (limite × IP_ONLY_FACTOR)', () => {
    const p = policy('rotation');
    const ipLimit = p.limit * IP_ONLY_FACTOR;
    const result = statuses(Array.from({ length: ipLimit + 2 }, (_, i) => from('198.51.100.10', `robot/${i}`)), p);
    expect(result.slice(0, ipLimit).every((s) => s === 200)).toBe(true);
    expect(result.slice(ipLimit)).toEqual([429, 429]);
  });

  it('les appareils d’un même réseau ne se bloquent pas entre eux sous la limite par IP (atelier sur un même Wi-Fi)', () => {
    const p = policy('atelier');
    const requests = ['tel-1', 'tel-2', 'tel-3', 'tel-4'].flatMap((ua) => [from('192.0.2.1', ua), from('192.0.2.1', ua), from('192.0.2.1', ua)]);
    expect(statuses(requests, p).every((s) => s === 200)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// Ajoutés pour le kit.
// ---------------------------------------------------------------------------------------------------
describe('repli mémoire : la base injoignable ne fait jamais tout passer (écart n° 3)', () => {
  beforeEach(() => resetSharedCounterAlertForTests());
  afterEach(() => vi.restoreAllMocks());

  it('délai par défaut de 800 ms (constante exportée)', () => {
    expect(SHARED_COUNTER_TIMEOUT_MS).toBe(800);
  });

  it('base qui ne répond jamais : le compteur en mémoire bloque au-delà de la limite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const slow = fake(vi.fn(() => new Promise(() => {})));
    const rule = { limit: 2, windowMs: 60_000, blockMs: 60_000 };
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await hitSharedCounter(KEY, rule, { client: slow, timeoutMs: 10, now: 5000 + i }));
    expect(results.map((r) => [r.blocked, r.degraded])).toEqual([[false, true], [false, true], [true, true]]);
  });

  it('garde partagée, base lente : 429 à la 3e requête du même appareil', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const slow = fake(vi.fn(() => new Promise(() => {})));
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await enforceSharedAbuseGuard(request('192.0.2.77'), policy, { client: slow, timeoutMs: 10 });
      statuses.push(response?.status ?? 200);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('message 429 personnalisable (ex. texte français)', async () => {
    const client = rpcReturning({ data: { blocked: true, retry_after: 5 }, error: null });
    const response = await enforceSharedAbuseGuard(request(), policy, { client, message: 'Trop de requêtes.' });
    expect(await response?.json()).toEqual({ ok: false, error: 'Trop de requêtes.' });
  });
});

describe('taille du corps (validateJsonRequest, validateFormRequest)', () => {
  const req = (headers: Record<string, string>) => new NextRequest('https://exemple.test/api/x', { method: 'POST', headers });

  it('content-length au-delà du plafond → 413 avant toute lecture', () => {
    expect(validateJsonRequest(req({ 'content-type': 'application/json', 'content-length': String(33 * 1024) }))?.status).toBe(413);
    expect(validateJsonRequest(req({ 'content-type': 'application/json', 'content-length': '100' }), { maxBytes: 50 })?.status).toBe(413);
    expect(validateJsonRequest(req({ 'content-type': 'application/json', 'content-length': '100' }))).toBeNull();
  });

  it('type de contenu non JSON → 415 (sauf si non exigé)', () => {
    expect(validateJsonRequest(req({ 'content-type': 'text/plain' }))?.status).toBe(415);
    expect(validateJsonRequest(req({ 'content-type': 'text/plain' }), { requireJsonContentType: false })).toBeNull();
  });

  it('formulaire : multipart seul par défaut, urlencoded sur option, plafond 256 Ko', () => {
    expect(validateFormRequest(req({ 'content-type': 'application/x-www-form-urlencoded' }))?.status).toBe(415);
    expect(validateFormRequest(req({ 'content-type': 'application/x-www-form-urlencoded' }), { allowUrlEncoded: true })).toBeNull();
    expect(validateFormRequest(req({ 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(257 * 1024) }))?.status).toBe(413);
  });
});
