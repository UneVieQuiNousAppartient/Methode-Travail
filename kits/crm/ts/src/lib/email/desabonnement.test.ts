// Kit CRM TS (methode-travail) — origine : Vie Solution Web, tests/crm-regles.test.mjs (jeton, secret, lien, en-têtes, memeSecret, masquerCourriel) + tests/desabonnement-page.test.mjs, commit 7873e8f (2026-10-30) + KHI Educ, tests/unit/lcap.test.mjs (jeton) et tests/unit/unsubscribe-route.test.mjs (cas de optOutAddress), commit 2954590 (2026-10-27) ; généralisé : port Vitest, secret de 32 caractères, noms et domaines → exemples ; cas du kit ajoutés.
import { describe, expect, it, vi } from 'vitest';
import {
  entetesDesabonnement,
  jetonDesabonnement,
  jetonValide,
  leadsTable,
  lienDesabonnement,
  likeExact,
  maskEmail,
  memeSecret,
  optOutAddress,
  pageDesabonnement,
  secretDesabonnement,
  unsubscribeSecretSource,
  type OptOutClient,
} from './desabonnement';

const CLE = 'une-cle-de-test-assez-longue-0123456789';
const S32 = 'a'.repeat(32);

describe('jeton', () => {
  it('valide pour la bonne adresse seulement, insensible à la casse', () => {
    const jeton = jetonDesabonnement('lead-1', 'Marie@Exemple.test', CLE);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/); // HMAC-SHA256 en base64url
    expect(jetonValide('lead-1', 'marie@exemple.test', jeton, CLE)).toBe(true);
    expect(jetonValide('lead-1', 'autre@exemple.test', jeton, CLE)).toBe(false);
    expect(jetonValide('lead-2', 'marie@exemple.test', jeton, CLE)).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', jeton, 'une-autre-cle-assez-longue-0123456789')).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', '', CLE)).toBe(false);
    expect(jetonDesabonnement('lead-1', 'marie@exemple.test', '')).toBe('');
  });
  it('jeton altéré, tronqué ou non textuel refusé ; sans secret aucun jeton', () => {
    const t = jetonDesabonnement('lead-1', 'marie@exemple.test', CLE);
    const flip = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    expect(jetonValide('lead-1', 'marie@exemple.test', flip, CLE)).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', t.slice(0, 20), CLE)).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', null, CLE)).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', ['x'], CLE)).toBe(false);
    expect(jetonValide('lead-1', 'marie@exemple.test', t, '')).toBe(false);
  });
  it('ajouté : temps constant — longueurs différentes ou caractères multioctets sans exception', () => {
    const t = jetonDesabonnement('lead-1', 'marie@exemple.test', CLE);
    for (const recu of ['x', t + 'x', 'é'.repeat(43), '😀'.repeat(11)]) {
      expect(() => jetonValide('lead-1', 'marie@exemple.test', recu, CLE)).not.toThrow();
      expect(jetonValide('lead-1', 'marie@exemple.test', recu, CLE)).toBe(false);
    }
  });
});

describe('secret', () => {
  it('UNSUBSCRIBE_SECRET d’abord, CRON_SECRET ensuite, jamais un secret de moins de 32 caractères', () => {
    expect(secretDesabonnement({ UNSUBSCRIBE_SECRET: S32, CRON_SECRET: 'b'.repeat(32) })).toBe(S32);
    expect(secretDesabonnement({ UNSUBSCRIBE_SECRET: 'court', CRON_SECRET: 'b'.repeat(32) })).toBe('b'.repeat(32));
    expect(secretDesabonnement({ CRON_SECRET: 'court' })).toBe('');
    expect(unsubscribeSecretSource({ UNSUBSCRIBE_SECRET: S32 })).toBe('UNSUBSCRIBE_SECRET');
    expect(unsubscribeSecretSource({ UNSUBSCRIBE_SECRET: 'court', CRON_SECRET: 'c'.repeat(40) })).toBe('CRON_SECRET');
    expect(unsubscribeSecretSource({})).toBeNull();
  });
  it('ajouté : 31 caractères (assez pour la seconde source, pas pour le kit) → aucun secret, donc aucun lien', () => {
    const env = { UNSUBSCRIBE_SECRET: 'a'.repeat(31), CRON_SECRET: 'b'.repeat(16) };
    expect(secretDesabonnement(env)).toBe('');
    expect(lienDesabonnement('https://exemple.test', 'lead-1', 'marie@exemple.test', secretDesabonnement(env))).toBe('');
  });
});

describe('lien et en-têtes', () => {
  it('https seulement ; en-têtes RFC 2369 + 8058 ; rien sans lien', () => {
    const lien = lienDesabonnement('https://exemple.test', 'lead-1', 'marie@exemple.test', CLE);
    expect(lien).toMatch(/^https:\/\/exemple\.test\/api\/desabonnement\?l=lead-1&t=/);
    expect(lienDesabonnement('http://localhost:3000', 'lead-1', 'marie@exemple.test', CLE)).toBe('');
    expect(entetesDesabonnement(lien)).toEqual({ 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(entetesDesabonnement('')).toEqual({});
    expect(entetesDesabonnement('/api/desabonnement?l=x')).toEqual({});
  });
  it('ajouté : http:// ou adresse avec chemin refusés comme base ; l et t vérifiables', () => {
    expect(lienDesabonnement('http://exemple.test', 'lead-1', 'marie@exemple.test', CLE)).toBe('');
    expect(lienDesabonnement('https://exemple.test/sous', 'lead-1', 'marie@exemple.test', CLE)).toBe('');
    const u = new URL(lienDesabonnement('https://exemple.test', 'lead 1', 'marie@exemple.test', CLE));
    expect(jetonValide(u.searchParams.get('l'), 'marie@exemple.test', u.searchParams.get('t'), CLE)).toBe(true);
  });
  it('memeSecret', () => {
    expect(memeSecret('abc', 'abc')).toBe(true);
    expect(memeSecret('abc', 'abd')).toBe(false);
    expect(memeSecret('', '')).toBe(false);
    expect(memeSecret('abc', 'abcd')).toBe(false);
  });
  it('maskEmail', () => {
    expect(maskEmail('marie.tremblay@exemple.test')).toBe('m•••@exemple.test');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('sans-arobase')).toBe('');
  });
  it('likeExact échappe \\ % _ ; leadsTable : nom sûr ou « leads »', () => {
    expect(likeExact('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
    expect(leadsTable({})).toBe('leads');
    expect(leadsTable({ LCAP_LEADS_TABLE: 'crm_leads' })).toBe('crm_leads');
    expect(leadsTable({ LCAP_LEADS_TABLE: 'leads; drop table x' })).toBe('leads');
  });
});

// Faux client minimal : enregistre les appels et applique les filtres sur un tableau en mémoire.
type Row = { id: string; email: string; email_opt_out_at: string | null; email_opt_out_source?: string | null };
function fakeLeads(rows: Row[]) {
  const calls: string[] = [];
  const likeToRegex = (p: string) =>
    new RegExp(`^${p.replace(/\\(.)|([%_])|([.*+?^${}()|[\]])/g, (_m, esc, joker, special) => (esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : joker === '%' ? '.*' : joker === '_' ? '.' : `\\${special}`))}$`, 'i');
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Partial<Row> | null = null;
      const run = () => {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (patch) for (const r of hit) Object.assign(r, patch);
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: (_c: string) => q,
        update: (p: Partial<Row>) => ((patch = p), q),
        eq: (c: keyof Row, v: string) => (filters.push((r) => r[c] === v), q),
        neq: (c: keyof Row, v: string) => (filters.push((r) => r[c] !== v), q),
        is: (c: keyof Row, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
        in: (c: keyof Row, v: string[]) => (filters.push((r) => v.includes(String(r[c]))), q),
        ilike: (c: keyof Row, p: string) => (calls.push(`ilike:${p}`), filters.push((r) => likeToRegex(p).test(String(r[c] ?? ''))), q),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
      };
      return q;
    },
    rpc: async () => ({ data: { blocked: false, retry_after: 0 }, error: null }),
  };
  return { client, calls, rows };
}

describe('optOutAddress', () => {
  const NOW = new Date('2026-10-30T12:00:00Z');
  it('ajouté : toutes les fiches de la même adresse (casse ignorée), jamais une autre ; idempotent', async () => {
    const db = fakeLeads([
      { id: 'a', email: 'Marie@Exemple.test', email_opt_out_at: null },
      { id: 'b', email: 'MARIE@exemple.TEST', email_opt_out_at: null },
      { id: 'c', email: 'paul@exemple.test', email_opt_out_at: null },
      { id: 'd', email: 'marie@exemple.test', email_opt_out_at: '2026-01-01T00:00:00Z', email_opt_out_source: 'admin' },
    ]);
    const r = await optOutAddress(db.client as unknown as OptOutClient, { id: 'a', email: 'Marie@Exemple.test' }, 'lien', { now: NOW });
    expect(r.lead_ids.sort()).toEqual(['a', 'b']);
    expect(db.rows.find((x) => x.id === 'c')?.email_opt_out_at).toBeNull();
    expect(db.rows.find((x) => x.id === 'd')).toMatchObject({ email_opt_out_at: '2026-01-01T00:00:00Z', email_opt_out_source: 'admin' });
    expect(db.rows.find((x) => x.id === 'b')).toMatchObject({ email_opt_out_at: NOW.toISOString(), email_opt_out_source: 'lien' });
    expect((await optOutAddress(db.client as unknown as OptOutClient, { id: 'a', email: 'marie@exemple.test' }, 'lien', { now: NOW })).lead_ids).toEqual([]);
  });
  it('ajouté : % et _ échappés — « m_rie%@… » ne désabonne pas d’autres adresses', async () => {
    const db = fakeLeads([
      { id: 'a', email: 'm_rie%@exemple.test', email_opt_out_at: null },
      { id: 'b', email: 'marie@exemple.test', email_opt_out_at: null },
      { id: 'c', email: 'mxrieZZ@exemple.test', email_opt_out_at: null },
    ]);
    const r = await optOutAddress(db.client as unknown as OptOutClient, { id: 'a', email: 'm_rie%@exemple.test' }, 'one-click', { now: NOW });
    expect(r.lead_ids).toEqual(['a']);
    expect(db.calls).toContain('ilike:m\\_rie\\%@exemple.test');
  });
  it('table en paramètre ; source inconnue → exception', async () => {
    const db = fakeLeads([{ id: 'a', email: 'x@exemple.test', email_opt_out_at: null }]);
    await optOutAddress(db.client as unknown as OptOutClient, { id: 'a', email: 'x@exemple.test' }, 'admin', { table: 'crm_leads' });
    expect(db.calls[0]).toBe('from:crm_leads');
    await expect(optOutAddress(db.client as unknown as OptOutClient, { id: 'a' }, 'autre' as 'lien')).rejects.toThrow(/inconnue/);
  });
  it('erreur sur la fiche elle-même → exception', async () => {
    const err = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: null, error: { message: 'panne' } }) }) }) }) }) };
    await expect(optOutAddress(err as unknown as OptOutClient, { id: 'a', email: 'x@exemple.test' }, 'lien')).rejects.toThrow('panne');
    vi.restoreAllMocks();
  });
});

describe('page de désabonnement (cas de la troisième source)', () => {
  const O = { site: 'Entreprise Exemple', siteUrl: 'https://exemple.test', email: 'marie@exemple.test', action: '/api/desabonnement?l=x&t=y' };

  it('français : textes, bouton et adresse masquée', () => {
    const h = pageDesabonnement('confirmer', { ...O, lang: 'fr' });
    expect(h).toContain('<html lang="fr">');
    expect(h).toContain('<title>Ne plus recevoir de relances — Entreprise Exemple</title>');
    expect(h).toContain('Vous recevez des relances par courriel de Entreprise Exemple au sujet de votre demande (adresse ');
    expect(h).toContain('>Me désabonner des relances</button>');
    expect(h).toContain('action="/api/desabonnement?l=x&amp;t=y"');
    expect(h).not.toContain('marie@exemple.test');
    expect(h).toContain('m•••@exemple.test');
    expect(h).toContain('noindex');
  });
  it('anglais : page, bouton, date et adresse en anglais', () => {
    const h = pageDesabonnement('confirmer', { ...O, lang: 'en' });
    expect(h).toContain('<html lang="en">');
    expect(h).toContain('>Unsubscribe from follow-ups</button>');
    expect(h).toContain('You receive follow-up emails from Entreprise Exemple about your request (address ');
    expect(h).not.toMatch(/Vous|relances/);
    expect(pageDesabonnement('deja', { ...O, lang: 'en', depuis: '2026-10-20T15:00:00Z' })).toContain('Since October 20, 2026, you no longer receive');
    expect(pageDesabonnement('deja', { ...O, lang: 'fr', depuis: '2026-10-20T15:00:00Z' })).toContain('Depuis le 20 octobre 2026');
    expect(pageDesabonnement('fait', { ...O, lang: 'en' })).toContain('<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">Done</h1>');
  });
  it('lien invalide ou panne : les deux langues, sans bouton ; textes échappés', () => {
    const h = pageDesabonnement('invalide', { ...O, lang: 'les-deux' });
    expect(h).toContain('Lien invalide');
    expect(h).toContain('Invalid link');
    expect(h).toContain('<section lang="en"');
    expect(h).not.toContain('<form');
    expect(pageDesabonnement('erreur', { ...O, lang: 'les-deux' })).toContain('Unsubscribing is not possible right now');
    expect(pageDesabonnement('fait', { ...O, lang: 'fr', site: '<b>' })).not.toContain('<b>');
  });
  it('ajouté : courriel de contact après l’action seulement ; aucun domaine sans adresse publique', () => {
    expect(pageDesabonnement('fait', { ...O, lang: 'fr', contactEmail: 'equipe@exemple.test' })).toContain('mailto:equipe@exemple.test');
    expect(pageDesabonnement('confirmer', { ...O, lang: 'fr', contactEmail: 'equipe@exemple.test' })).not.toContain('mailto:');
    expect(pageDesabonnement('fait', { ...O, lang: 'fr', siteUrl: '' })).not.toMatch(/https?:\/\//);
  });
});
