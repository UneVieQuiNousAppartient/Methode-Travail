// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/csp.test.ts, commit 508f19a (2026-10-30) + Vie Solution Web, tests/csp.test.mjs, commit 7873e8f (2026-10-30) ; généralisé : tests portés et dédoublonnés ; tiers propres au projet (mesure d'audience, WebAssembly, connecteur) retirés avec le code ; cas du kit ajoutés (mode, Supabase, extra).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContentSecurityPolicy, cspHeader, cspHeaderName, cspMode, cspSource, summarizeCspReports } from './csp';

// La politique lit l'environnement à chaque appel : pas de rechargement de module nécessaire.
afterEach(() => vi.unstubAllEnvs());
const prod = () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '');
};

describe('CSP — directives (reprises des deux sources)', () => {
  it('autorise Turnstile, interdit l’encadrement et les objets, et envoie les rapports', () => {
    prod();
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://challenges.cloudflare.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('report-uri /api/csp-rapport');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('*.supabase.co');
    expect(csp).toContain("form-action 'self';");
  });

  it('aucun domaine tiers invité hors Turnstile (et Supabase s’il est configuré)', () => {
    prod();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const tiers = buildContentSecurityPolicy().match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(new Set(tiers)).toEqual(new Set(['https://challenges.cloudflare.com']));
    expect(buildContentSecurityPolicy()).not.toContain('ws:');
  });

  it('actif : upgrade-insecure-requests ; observation : le reste identique, sans lui', () => {
    prod();
    const actif = buildContentSecurityPolicy({ mode: 'actif' });
    expect(actif).toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy({ mode: 'observation' })).toBe(actif.replace('upgrade-insecure-requests; ', ''));
  });
});

describe('CSP — exception du mode développement', () => {
  it('« unsafe-eval » et ws: seulement sous NODE_ENV=development hors Vercel ; jamais en production', () => {
    prod();
    expect(buildContentSecurityPolicy()).not.toContain("'unsafe-eval'");
    vi.stubEnv('NODE_ENV', 'development');
    const dev = buildContentSecurityPolicy({ mode: 'actif' });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toMatch(/connect-src [^;]*ws:/);
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('jamais sur Vercel, même si NODE_ENV y vaut development par erreur (VERCEL=1)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    expect(buildContentSecurityPolicy()).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy()).not.toContain('ws:');
  });
});

describe('summarizeCspReports', () => {
  it('résume un rapport csp-report sans chaîne de requête ni chemin de la ressource bloquée', () => {
    const summary = summarizeCspReports({
      'csp-report': {
        'document-uri': 'https://exemple.test/diagnostic?email=jean%40exemple.test#x',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://tiers.example.com/pixel.js?id=123',
      },
    });
    expect(summary).toEqual([{ directive: 'script-src-elem', blocked: 'https://tiers.example.com', page: '/diagnostic' }]);
    expect(JSON.stringify(summary)).not.toContain('jean');
  });

  it('lit le format Reporting API (tableau) et ignore les entrées invalides', () => {
    const summary = summarizeCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://exemple.test/', effectiveDirective: 'img-src', blockedURL: 'inline' } },
      null,
      'texte',
    ]);
    expect(summary).toEqual([{ directive: 'img-src', blocked: 'inline', page: '/' }]);
  });

  it('entrées sans rapport → rien (cas de la seconde source)', () => {
    for (const bad of [null, 42, 'texte', {}, [], { 'csp-report': 'x' }]) expect(summarizeCspReports(bad)).toEqual([]);
  });

  it('rapport avec ?token=… → page sans requête ; chemin et directive coupés court ; 10 rapports au plus', () => {
    const [s] = summarizeCspReports({ 'csp-report': { 'document-uri': `https://exemple.test/${'a'.repeat(500)}?token=secret`, 'effective-directive': 'x'.repeat(100) } });
    expect(s.page.length).toBe(120);
    expect(s.directive.length).toBe(40);
    expect(JSON.stringify(s)).not.toContain('token');
    expect(summarizeCspReports(Array.from({ length: 30 }, () => ({ body: { effectiveDirective: 'img-src' } })))).toHaveLength(10);
  });
});

describe('ajoutés pour le kit : mode, Supabase exact, origines tierces, routes à politique propre', () => {
  it('CSP_MODE absente ou inconnue → observation (Report-Only) ; actif → bloquante', () => {
    vi.stubEnv('CSP_MODE', '');
    expect(cspMode()).toBe('observation');
    expect(cspHeader().key).toBe('Content-Security-Policy-Report-Only');
    vi.stubEnv('CSP_MODE', 'bloquer');
    expect(cspHeaderName()).toBe('Content-Security-Policy-Report-Only');
    vi.stubEnv('CSP_MODE', ' Actif ');
    expect(cspMode()).toBe('actif');
    expect(cspHeader().key).toBe('Content-Security-Policy');
  });

  it('origine Supabase exacte (https + wss), jamais le joker ; absente → aucune origine Supabase', () => {
    prod();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefgh.supabase.co');
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/connect-src [^;]*https:\/\/abcdefgh\.supabase\.co wss:\/\/abcdefgh\.supabase\.co/);
    expect(csp).not.toContain('*.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(buildContentSecurityPolicy()).not.toContain('supabase');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'pas une url');
    expect(buildContentSecurityPolicy()).not.toContain('supabase');
  });

  it('CSP_EXTRA_ORIGINS : origines https exactes ajoutées ; valeurs larges ou mal écrites ignorées', () => {
    prod();
    vi.stubEnv('CSP_EXTRA_ORIGINS', 'https://cdn.exemple.test, https://*.tiers.test  * https: http://pas-sur.test https://chemin.test/x javascript:alert(1)');
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.exemple\.test/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.tiers\.test/);
    expect(csp).not.toMatch(/ \*( |;)/);
    expect(csp).not.toMatch(/ https:( |;)/);
    expect(csp).not.toContain('pas-sur.test');
    expect(csp).not.toContain('chemin.test');
    expect(csp).not.toContain('javascript');
  });

  it('cspSource : tout le site par défaut ; routes à politique propre exclues', () => {
    expect(new RegExp(`^${cspSource()}$`).test('/api/oauth/authorize')).toBe(true);
    const pattern = new RegExp(`^${cspSource(['api/oauth/authorize', '/api/retour.google'])}$`);
    for (const path of ['/', '/contact', '/api/leads', '/api/oauth/token']) expect(pattern.test(path), path).toBe(true);
    for (const path of ['/api/oauth/authorize', '/api/oauth/authorize?x=1', '/api/retour.google']) expect(pattern.test(path), path).toBe(false);
    expect(pattern.test('/api/retourXgoogle')).toBe(true);
  });
});

describe('next.config.exemple.mjs — en-tête de la CSP', () => {
  type Rule = { source: string; headers: Array<{ key: string; value: string }> };
  const load = async (): Promise<Rule[]> => {
    vi.resetModules();
    // @ts-expect-error -- next.config.exemple.mjs est du JavaScript sans déclaration de types ; seul `headers()` est lu ici.
    const { default: config } = await import('../../../next.config.exemple.mjs');
    return config.headers();
  };

  it('observation par défaut : Report-Only seulement, jamais eval, rapports envoyés', async () => {
    prod();
    vi.stubEnv('CSP_MODE', '');
    const keys = (await load()).flatMap((r) => r.headers.map((h) => h.key));
    expect(keys).toContain('Content-Security-Policy-Report-Only');
    expect(keys).not.toContain('Content-Security-Policy');
  });

  it('CSP_MODE=actif : Content-Security-Policy (bloquante), sans Report-Only', async () => {
    prod();
    vi.stubEnv('CSP_MODE', 'actif');
    const headers = (await load()).flatMap((r) => r.headers);
    const csp = headers.find((h) => h.key === 'Content-Security-Policy');
    expect(headers.some((h) => h.key === 'Content-Security-Policy-Report-Only')).toBe(false);
    expect(csp?.value).not.toContain("'unsafe-eval'");
    expect(csp?.value).toContain('report-uri /api/csp-rapport');
    expect((await load()).map((r) => r.headers.map((h) => h.key))).toContainEqual(expect.arrayContaining(['X-Frame-Options', 'X-Content-Type-Options']));
  });
});
