// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/health/verdict.test.ts, commit 508f19a (2026-10-30) ; généralisé : tests de l'agenda retirés, tick jamais passé → panne, CRON_SECRET dans la liste des variables ; écrit pour le kit : aucune valeur de secret dans un verdict, avecDelai → injoignable après DELAI_CONTROLE_MS, Turnstile, URL du site, mode jeton et double vérification lus dans l'environnement.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TurnstileHealth } from '@/lib/api/turnstile';
import {
  CRON_SECRET_LONGUEUR_MIN,
  DELAI_CONTROLE_MS,
  SECRET_LONGUEUR_MIN,
  VARIABLES_ATTENDUES,
  avecDelai,
  controleInjoignable,
  controlesEnvironnement,
  etatModeJeton,
  etatSiteUrl,
  etatVariables,
  verdictBase,
  verdictGlobal,
  verdictMfa,
  verdictModeJeton,
  verdictSiteUrl,
  verdictTick,
  verdictTurnstile,
  verdictVariables,
  type Controle,
} from './verdict';
import * as module from './verdict';

const NOW = new Date('2026-01-15T15:00:00.000Z');
const ilYA = (heures: number) => new Date(NOW.getTime() - heures * 3600 * 1000).toISOString();
const sante = (h: Partial<TurnstileHealth>): TurnstileHealth => ({
  mode: 'verify',
  site_key: true,
  secret: 'ok',
  last_problem: null,
  production: true,
  ...h,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('verdictTick (vert ≤ 2 h, jaune > 2 h, rouge > 6 h)', () => {
  it('1 h → ok ; 3 h → attention ; 7 h → panne', () => {
    expect(verdictTick({ lastFinishedAt: ilYA(1), lastOk: true }, NOW).niveau).toBe('ok');
    expect(verdictTick({ lastFinishedAt: ilYA(3), lastOk: true }, NOW).niveau).toBe('attention');
    expect(verdictTick({ lastFinishedAt: ilYA(7), lastOk: true }, NOW).niveau).toBe('panne');
  });
  it('bornes : 2 h pile → ok ; 6 h pile → attention', () => {
    expect(verdictTick({ lastFinishedAt: ilYA(2), lastOk: true }, NOW).niveau).toBe('ok');
    expect(verdictTick({ lastFinishedAt: ilYA(6), lastOk: true }, NOW).niveau).toBe('attention');
  });
  it('tick jamais passé (aucune ligne) → panne', () => {
    const c = verdictTick(null, NOW);
    expect(c.niveau).toBe('panne');
    expect(c.message).toContain('Aucun passage enregistré');
  });
  it('à l’heure mais last_ok = false → attention « dernier passage en erreur »', () => {
    const c = verdictTick({ lastFinishedAt: ilYA(0.5), lastOk: false }, NOW);
    expect(c.niveau).toBe('attention');
    expect(c.message).toContain('dernier passage en erreur');
  });
  it('en retard ET en erreur → le retard prime (panne après 6 h)', () => {
    expect(verdictTick({ lastFinishedAt: ilYA(8), lastOk: false }, NOW).niveau).toBe('panne');
  });
  it('date illisible ou absente → panne', () => {
    expect(verdictTick({ lastFinishedAt: 'pas une date', lastOk: true }, NOW).niveau).toBe('panne');
    expect(verdictTick({ lastFinishedAt: null, lastOk: null }, NOW).niveau).toBe('panne');
  });
});

describe('verdictGlobal', () => {
  it('renvoie le pire niveau ; liste vide → ok', () => {
    expect(verdictGlobal([])).toBe('ok');
    expect(verdictGlobal([{ niveau: 'ok' }, { niveau: 'attention' }])).toBe('attention');
    expect(verdictGlobal([{ niveau: 'panne' }, { niveau: 'attention' }, { niveau: 'ok' }])).toBe('panne');
  });
});

describe('chaque contrôle en attention ou en panne porte une action ; un contrôle ok n’en porte pas', () => {
  const tous: Controle[] = [
    verdictTick(null, NOW),
    verdictTick({ lastFinishedAt: ilYA(3), lastOk: true }, NOW),
    verdictTick({ lastFinishedAt: ilYA(9), lastOk: true }, NOW),
    verdictTick({ lastFinishedAt: ilYA(1), lastOk: false }, NOW),
    verdictTick({ lastFinishedAt: ilYA(1), lastOk: true }, NOW),
    ...verdictVariables({}),
    ...verdictVariables(Object.fromEntries(VARIABLES_ATTENDUES.map((v) => [v.nom, 'trop-courte' as const]))),
    ...verdictVariables(Object.fromEntries(VARIABLES_ATTENDUES.map((v) => [v.nom, 'presente' as const]))),
    verdictModeJeton(true, true),
    verdictModeJeton(true, false),
    verdictMfa(false),
    verdictMfa(true),
    verdictBase(false),
    verdictBase(true),
    verdictTurnstile(null, NOW.getTime()),
    verdictTurnstile(sante({ secret: 'invalide' }), NOW.getTime()),
    verdictTurnstile(sante({}), NOW.getTime()),
    verdictSiteUrl({ publique: false, source: 'none' }),
    verdictSiteUrl({ publique: true, source: 'vercel' }),
    verdictSiteUrl({ publique: true, source: 'env' }),
    controleInjoignable('x', 'X'),
  ];
  it.each(tous.map((c) => [c.id, c.niveau, c] as const))('%s (%s)', (_id, niveau, c) => {
    if (niveau === 'ok') expect(c.action).toBeNull();
    else expect(c.action && c.action.length).toBeGreaterThan(20);
  });
});

describe('variables : état seulement (présente / trop courte / absente)', () => {
  it('la liste du kit (lots 1 et 2) est celle attendue, CRON_SECRET compris', () => {
    expect(VARIABLES_ATTENDUES.map((v) => v.nom)).toEqual([
      'NEXT_PUBLIC_SITE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'CRON_SECRET',
      'UNSUBSCRIBE_SECRET',
      'TURNSTILE_SECRET_KEY',
      'RESEND_API_KEY',
      'MFA_BACKUP_SECRET',
      'PRIVACY_HASH_SECRET',
    ]);
  });
  it('absente → niveau prévu ; trop courte → même niveau ; présente → ok', () => {
    const etats = etatVariables({ SUPABASE_SERVICE_ROLE_KEY: 'x', CRON_SECRET: 'court', UNSUBSCRIBE_SECRET: 'u'.repeat(SECRET_LONGUEUR_MIN) });
    expect(etats).toMatchObject({ SUPABASE_SERVICE_ROLE_KEY: 'presente', CRON_SECRET: 'trop-courte', UNSUBSCRIBE_SECRET: 'presente', RESEND_API_KEY: 'absente' });
    const controles = verdictVariables(etats);
    const niveau = (nom: string) => controles.find((c) => c.id === `env:${nom}`)?.niveau;
    expect(niveau('SUPABASE_SERVICE_ROLE_KEY')).toBe('ok');
    expect(niveau('CRON_SECRET')).toBe('panne');
    expect(niveau('RESEND_API_KEY')).toBe('panne');
    expect(niveau('TURNSTILE_SECRET_KEY')).toBe('attention');
    expect(controles.find((c) => c.id === 'env:CRON_SECRET')?.message).toContain(`moins de ${CRON_SECRET_LONGUEUR_MIN}`);
  });
  it('espaces seuls → absente ; longueur exacte → présente', () => {
    expect(etatVariables({ CRON_SECRET: '   ' }).CRON_SECRET).toBe('absente');
    expect(etatVariables({ CRON_SECRET: 'c'.repeat(CRON_SECRET_LONGUEUR_MIN) }).CRON_SECRET).toBe('presente');
    expect(etatVariables({ PRIVACY_HASH_SECRET: 'p'.repeat(SECRET_LONGUEUR_MIN - 1) }).PRIVACY_HASH_SECRET).toBe('trop-courte');
  });
  it('liste extensible : une variable du projet s’ajoute', () => {
    const liste = [...VARIABLES_ATTENDUES, { nom: 'MA_CLE', role: 'module du projet', siAbsente: 'attention' as const }];
    expect(verdictVariables(etatVariables({}, liste), liste).at(-1)).toMatchObject({ id: 'env:MA_CLE', niveau: 'attention' });
  });
});

describe('aucune valeur de secret dans un verdict', () => {
  // Valeurs repérables : longues (présentes) ou courtes (trop courtes), toutes distinctes.
  const longues = Object.fromEntries(VARIABLES_ATTENDUES.map((v, i) => [v.nom, `VALEUR-SECRETE-${i}-${'z'.repeat(40)}`]));
  const courtes = Object.fromEntries(VARIABLES_ATTENDUES.map((v, i) => [v.nom, `Sx${i}q`]));
  const valeurs = [...Object.values(longues), ...Object.values(courtes)];
  const sansValeur = (sortie: unknown) => {
    const texte = JSON.stringify(sortie);
    for (const valeur of valeurs) expect(texte).not.toContain(valeur);
  };
  it('états : seulement « presente », « trop-courte » ou « absente »', () => {
    for (const env of [longues, courtes]) {
      const etats = etatVariables(env);
      for (const etat of Object.values(etats)) expect(['presente', 'trop-courte', 'absente']).toContain(etat);
      sansValeur(etats);
    }
  });
  it('contrôles complets de l’environnement (présentes, trop courtes)', () => {
    sansValeur(controlesEnvironnement({ ...longues, ADMIN_MFA_REQUIRED: '1' }));
    sansValeur(controlesEnvironnement({ ...courtes, NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: '1' }));
    expect(verdictGlobal(controlesEnvironnement(longues))).not.toBe('panne');
  });
});

describe('périmètre du module', () => {
  it('aucun verdict d’agenda (retiré du kit, lot 3)', () => {
    expect(Object.keys(module).some((nom) => /google/i.test(nom))).toBe(false);
  });
});

describe('états lus dans l’environnement', () => {
  it('mode jeton (token-mode.ts) : en ligne sur la plateforme → jamais permis ; serveur en production avec le drapeau local → attention', () => {
    expect(etatModeJeton({ VERCEL: '1', ADMIN_TOKEN_MODE_LOCAL: '1', NODE_ENV: 'production' })).toEqual({ permis: false, enLigne: true });
    const local = etatModeJeton({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: '1' });
    expect(local).toEqual({ permis: true, enLigne: true });
    expect(verdictModeJeton(local.permis, local.enLigne).niveau).toBe('attention');
    const dev = etatModeJeton({ NODE_ENV: 'development' });
    expect(verdictModeJeton(dev.permis, dev.enLigne).niveau).toBe('ok');
    expect(verdictModeJeton(false, true).niveau).toBe('ok');
  });
  it('double vérification (ADMIN_MFA_REQUIRED, mfa.ts)', () => {
    const mfa = (env: Record<string, string>) => controlesEnvironnement(env).find((c) => c.id === 'mfa')?.niveau;
    expect(mfa({ ADMIN_MFA_REQUIRED: '1' })).toBe('ok');
    expect(mfa({})).toBe('attention');
    expect(mfa({ ADMIN_MFA_REQUIRED: 'oui' })).toBe('attention');
  });
  it('URL du site (site-url.ts) : déclarée → ok ; repli de l’hébergeur → attention ; rien ou http → panne', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exemple.test');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(verdictSiteUrl(etatSiteUrl()).niveau).toBe('ok');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'mon-projet.exemple.test');
    expect(etatSiteUrl()).toEqual({ publique: true, source: 'vercel' });
    expect(verdictSiteUrl(etatSiteUrl()).niveau).toBe('attention');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(verdictSiteUrl(etatSiteUrl()).niveau).toBe('panne');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(verdictSiteUrl(etatSiteUrl()).niveau).toBe('panne');
  });
  it('Turnstile (turnstileVerdict) : ok, warning → attention, failure → panne', () => {
    expect(verdictTurnstile(sante({}), NOW.getTime()).niveau).toBe('ok');
    expect(verdictTurnstile(null, NOW.getTime()).niveau).toBe('attention');
    expect(verdictTurnstile(sante({ secret: 'injoignable' }), NOW.getTime()).niveau).toBe('attention');
    expect(verdictTurnstile(sante({ secret: 'invalide' }), NOW.getTime()).niveau).toBe('panne');
    expect(verdictTurnstile(sante({ secret: 'test', production: true }), NOW.getTime()).niveau).toBe('panne');
  });
});

describe('avecDelai', () => {
  it('rend la valeur à temps, le repli après le délai ou sur erreur', async () => {
    expect(await avecDelai(Promise.resolve(1), 50, 0)).toBe(1);
    expect(await avecDelai(new Promise<number>((r) => setTimeout(() => r(1), 200)), 20, 0)).toBe(0);
    expect(await avecDelai(Promise.reject(new Error('x')), 50, 0)).toBe(0);
    expect(await avecDelai(() => { throw new Error('sync'); }, 50, 0)).toBe(0);
  });
  it('contrôle qui ne répond jamais → « injoignable » après DELAI_CONTROLE_MS, pas avant', async () => {
    vi.useFakeTimers();
    const repli = controleInjoignable('automatisations', 'Automatisations');
    let fini: Controle | null = null;
    const enCours = avecDelai(new Promise<Controle>(() => {}), DELAI_CONTROLE_MS, repli).then((c) => {
      fini = c;
      return c;
    });
    await vi.advanceTimersByTimeAsync(DELAI_CONTROLE_MS - 1);
    expect(fini).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    const resultat = await enCours;
    expect(resultat).toBe(repli);
    expect(resultat.niveau).toBe('attention');
    expect(resultat.message).toContain('Vérification impossible');
  });
});
