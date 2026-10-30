// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/unsubscribe-route.test.mjs (cas seulement : GET sans effet, POST, un clic, déjà désabonné, lien invalide, débit), commit 2954590 (2026-10-27) ; généralisé : écrit en Vitest pour la route du kit, base simulée par vi.mock de server-admin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetSharedCounterAlertForTests } from '@/lib/api/abuse-guard';
import { DESABONNEMENT_ABUSE_POLICY } from '@/lib/api/abuse-policies';
import { jetonDesabonnement } from '@/lib/email/desabonnement';

type Row = { id: string; email: string; email_opt_out_at: string | null; email_opt_out_source?: string | null; lang?: string | null };
const state: { rows: Row[]; rpcBlocked: boolean; down: boolean } = { rows: [], rpcBlocked: false, down: false };

// Faux client : mêmes chaînes que le vrai (from/select/eq/maybeSingle, update/eq/is/select, ilike/neq/is, in, rpc).
function fakeClient() {
  const likeToRegex = (p: string) =>
    new RegExp(`^${p.replace(/\\(.)|([%_])|([.*+?^${}()|[\]])/g, (_m, esc, joker, special) => (esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : joker === '%' ? '.*' : joker === '_' ? '.' : `\\${special}`))}$`, 'i');
  return {
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Partial<Row> | null = null;
      const run = () => {
        if (state.down) return { data: null, error: { message: 'base en panne' } };
        const hit = state.rows.filter((r) => filters.every((f) => f(r)));
        if (patch) for (const r of hit) Object.assign(r, patch);
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: () => q,
        update: (p: Partial<Row>) => ((patch = p), q),
        eq: (c: keyof Row, v: string) => (filters.push((r) => r[c] === v), q),
        neq: (c: keyof Row, v: string) => (filters.push((r) => r[c] !== v), q),
        is: (c: keyof Row, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
        in: (c: keyof Row, v: string[]) => (filters.push((r) => v.includes(String(r[c]))), q),
        ilike: (c: keyof Row, p: string) => (filters.push((r) => likeToRegex(p).test(String(r[c] ?? ''))), q),
        maybeSingle: async () => {
          const r = run();
          return r.error ? r : { data: r.data?.[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
      };
      return q;
    },
    rpc: async () => ({ data: { blocked: state.rpcBlocked, retry_after: state.rpcBlocked ? 60 : 0 }, error: null }),
  };
}
let configured = true;
vi.mock('@/lib/supabase/server-admin', () => ({ getSupabaseAdmin: () => (configured ? fakeClient() : null) }));

const { GET, POST } = await import('./route');

const SECRET = 's'.repeat(40);
const ID = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'marie@exemple.test';
const url = (id = ID, t = jetonDesabonnement(id, EMAIL, SECRET)) => `https://exemple.test/api/desabonnement?l=${id}&t=${t}`;
const get = (u = url(), ip = '192.0.2.10') => new NextRequest(u, { headers: { 'x-vercel-forwarded-for': ip } });
const post = (u = url(), body = '', ip = '192.0.2.10') =>
  new NextRequest(u, { method: 'POST', body, headers: { 'x-vercel-forwarded-for': ip, 'content-type': 'application/x-www-form-urlencoded' } });

beforeEach(() => {
  configured = true;
  resetSharedCounterAlertForTests();
  state.rows = [
    { id: ID, email: 'Marie@Exemple.test', email_opt_out_at: null },
    { id: AUTRE, email: 'marie@exemple.test', email_opt_out_at: null },
    { id: '33333333-3333-4333-8333-333333333333', email: 'paul@exemple.test', email_opt_out_at: null },
  ];
  state.rpcBlocked = false;
  state.down = false;
  vi.stubEnv('UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('SITE_NAME', 'Entreprise Exemple');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemple.test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/desabonnement', () => {
  it('lien valide → page de confirmation (200), formulaire POST, rien n’est modifié', async () => {
    const res = await GET(get());
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(html).toContain('<form method="post"');
    expect(html).toContain('Entreprise Exemple');
    expect(html).not.toContain('marie@exemple.test');
    expect(state.rows.every((r) => r.email_opt_out_at === null)).toBe(true);
  });
  it('déjà désabonné → page « déjà », sans formulaire', async () => {
    state.rows[0].email_opt_out_at = '2026-09-01T16:00:00Z';
    const html = await (await GET(get())).text();
    expect(html).toContain('Désabonnement déjà enregistré');
    expect(html).not.toContain('<form');
  });
  it.each([
    ['jeton d’une autre adresse', url(ID, jetonDesabonnement(ID, 'autre@exemple.test', SECRET))],
    ['jeton faux', url(ID, 'faux')],
    ['identifiant mal formé', url('pas-un-uuid', 'x')],
    ['fiche inconnue', url('44444444-4444-4444-8444-444444444444')],
    ['paramètres absents', 'https://exemple.test/api/desabonnement'],
  ])('%s → 400, page dans les deux langues', async (_l, u) => {
    const res = await GET(get(u));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Lien invalide');
    expect(html).toContain('Invalid link');
  });
  it('secret trop court → aucun lien accepté (400)', async () => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'court');
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(get())).status).toBe(400);
  });
  it('Supabase absent → 503 ; base en panne → 503', async () => {
    configured = false;
    expect((await GET(get())).status).toBe(503);
    configured = true;
    state.down = true;
    expect((await GET(get())).status).toBe(503);
  });
  it('débit limité → 429', async () => {
    state.rpcBlocked = true;
    expect((await GET(get())).status).toBe(429);
  });
});

describe('POST /api/desabonnement', () => {
  it('bouton de la page → « C’est fait », toutes les fiches de l’adresse désabonnées (source « lien »), pas les autres', async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("C'est fait");
    expect(state.rows.filter((r) => r.email_opt_out_at).map((r) => r.id).sort()).toEqual([ID, AUTRE]);
    expect(state.rows[0].email_opt_out_source).toBe('lien');
    expect(state.rows[2].email_opt_out_at).toBeNull();
  });
  it('RFC 8058 « List-Unsubscribe=One-Click » → 200 sans page, source « one-click »', async () => {
    const res = await POST(post(url(), 'List-Unsubscribe=One-Click'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(state.rows[0].email_opt_out_source).toBe('one-click');
    expect(state.rows[1].email_opt_out_source).toBe('one-click');
  });
  it('déjà désabonné → date et source d’origine gardées', async () => {
    state.rows[0].email_opt_out_at = '2026-09-01T16:00:00Z';
    state.rows[0].email_opt_out_source = 'admin';
    const html = await (await POST(post())).text();
    expect(html).toContain('Désabonnement déjà enregistré');
    expect(state.rows[0]).toMatchObject({ email_opt_out_at: '2026-09-01T16:00:00Z', email_opt_out_source: 'admin' });
  });
  it('jeton invalide → 400 (page) ou 400 vide (un clic), rien de modifié', async () => {
    expect((await POST(post(url(ID, 'faux')))).status).toBe(400);
    const r = await POST(post(url(ID, 'faux'), 'List-Unsubscribe=One-Click'));
    expect(r.status).toBe(400);
    expect(await r.text()).toBe('');
    expect(state.rows.every((x) => x.email_opt_out_at === null)).toBe(true);
  });
  it('corps démesuré : lecture arrêtée, traité comme un POST de page (pas un « un clic »)', async () => {
    const res = await POST(post(url(), 'List-Unsubscribe=One-Click' + 'x'.repeat(5000)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("C'est fait");
    expect(state.rows[0].email_opt_out_source).toBe('lien');
  });
  it('débit : page limitée au-delà de la politique en mémoire (base absente) — l’appareil est bloqué', async () => {
    configured = false;
    const statuses: number[] = [];
    for (let i = 0; i < DESABONNEMENT_ABUSE_POLICY.limit + 1; i++) statuses.push((await POST(post(url(), '', '198.51.100.77'))).status);
    expect(statuses.at(-1)).toBe(429);
  });
});
