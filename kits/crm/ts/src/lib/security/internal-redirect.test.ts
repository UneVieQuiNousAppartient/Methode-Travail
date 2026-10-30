// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/internal-redirect.test.ts, commit 508f19a (2026-10-30) ; généralisé : domaine du projet → exemple.test ; ajout « parité » avec les cas de KHI Educ tests/unit/internal-href.test.mjs (commit 2954590).
import { describe, expect, it } from 'vitest';
import { normalizeInternalRedirectPath, refererRedirectPath } from './internal-redirect';

// Espace insécable construite par code : un échappement U+00A0 collé dans la source
// serait réécrit en caractère littéral par certains outils (lint no-irregular-whitespace).
const NBSP = String.fromCharCode(0xa0);
const FALLBACK = '/fallback-sentinelle';
const DASHBOARD = { allowedPrefixes: ['/dashboard'] } as const;
const ESPACE_ET_DASHBOARD = { allowedPrefixes: ['/espace', '/dashboard'] } as const;

// La norme URL retire tab/LF/CR, donc `/<tab>/evil.com` devient `//evil.com`.
const refused: Array<[label: string, value: string | null | undefined]> = [
  ['tabulation entre deux slashs', '/\t/evil.com'],
  ['saut de ligne entre deux slashs', '/\n/evil.com'],
  ['retour chariot entre deux slashs', '/\r/evil.com'],
  ['URL protocole-relative', '//evil.com'],
  ['antislash après le slash', '/\\evil.com'],
  ['point puis double slash (résolu en //evil.com)', '/.//evil.com'],
  ['point-point puis double slash', '/..//evil.com'],
  ['tabulation après un segment point', '/./\t/evil.com'],
  ['schéma javascript:', 'javascript:alert(1)'],
  ['schéma javascript: en casse mixte', 'JaVaScRiPt:alert(1)'],
  ['URL absolue https', 'https://evil.com'],
  ['chaîne vide', ''],
  ['espaces seuls', '   '],
  ['null', null],
  ['undefined', undefined],
  ['espace dans le chemin', '/dash board'],
  ['espace insécable entre deux slashs', `/${NBSP}/evil.com`],
];

const accepted: Array<[label: string, value: string, options?: { allowedPrefixes: readonly string[] }]> = [
  ['racine du dashboard', '/dashboard', DASHBOARD],
  ['dashboard avec requête et ancre', '/dashboard/leads?vue=kanban#x', DASHBOARD],
  ['sous-chemin du dashboard', '/dashboard/crm/abc', DASHBOARD],
  ['dashboard avec requête directe', '/dashboard?x=1', DASHBOARD],
  ['dashboard avec ancre directe', '/dashboard#a', DASHBOARD],
  ['espace partenaire (préfixes espace + dashboard)', '/espace/partenaire', ESPACE_ET_DASHBOARD],
  ['chemin interne sans option de préfixe', '/merci'],
];

describe('normalizeInternalRedirectPath — valeurs refusées', () => {
  it.each(refused)('renvoie le repli — %s', (_label, value) => {
    expect(normalizeInternalRedirectPath(value, FALLBACK)).toBe(FALLBACK);
  });

  it.each(refused)('renvoie le repli même avec un préfixe autorisé — %s', (_label, value) => {
    expect(normalizeInternalRedirectPath(value, FALLBACK, DASHBOARD)).toBe(FALLBACK);
  });

  it('refuse un préfixe qui n’est qu’un début de segment (/dashboardevil)', () => {
    expect(normalizeInternalRedirectPath('/dashboardevil', FALLBACK, DASHBOARD)).toBe(FALLBACK);
  });

  it('refuse un chemin hors des préfixes autorisés', () => {
    expect(normalizeInternalRedirectPath('/espace', FALLBACK, DASHBOARD)).toBe(FALLBACK);
  });

  it('refuse une sortie du préfixe par remontée de répertoire (/dashboard/../espace)', () => {
    // Le résultat est jugé après résolution : `/dashboard/../espace` devient `/espace`.
    expect(normalizeInternalRedirectPath('/dashboard/../espace', FALLBACK, DASHBOARD)).toBe(FALLBACK);
  });

  it.each([42, true, {}, ['/dashboard'], { toString: () => '/dashboard' }])(
    'renvoie le repli sans lever pour une valeur non textuelle (JSON inattendu) — %o',
    (value) => {
      expect(normalizeInternalRedirectPath(value as unknown as string, FALLBACK, DASHBOARD)).toBe(FALLBACK);
    },
  );
});

describe('normalizeInternalRedirectPath — valeurs acceptées', () => {
  it.each(accepted)('renvoie la valeur telle quelle — %s', (_label, value, options) => {
    expect(normalizeInternalRedirectPath(value, FALLBACK, options)).toBe(value);
  });

  it('retire les espaces autour de la valeur avant de la juger', () => {
    expect(normalizeInternalRedirectPath('  /dashboard/leads  ', FALLBACK, DASHBOARD)).toBe('/dashboard/leads');
  });

  it('résout les segments point d’un chemin resté dans le préfixe', () => {
    expect(normalizeInternalRedirectPath('/dashboard/./leads', FALLBACK, DASHBOARD)).toBe('/dashboard/leads');
  });

  // Propriété de sécurité, pas seulement une égalité de chaînes : quel que soit le
  // résultat renvoyé (accepté OU repli), un navigateur qui le résout doit rester
  // sur notre origine.
  it('toute valeur renvoyée reste sur l’origine du site une fois résolue comme une URL', () => {
    const origin = 'https://exemple.test';
    const inputs = [
      ...accepted.map(([, value]) => value),
      ...refused.map(([, value]) => value),
      '/dashboard/%2F%2Fevil.com',
      '/dashboard?next=//evil.com',
      '/dashboard#//evil.com',
    ];

    for (const value of inputs) {
      for (const options of [undefined, DASHBOARD, ESPACE_ET_DASHBOARD]) {
        const result = normalizeInternalRedirectPath(value, '/dashboard', options);
        expect(new URL(result, origin).origin, `entrée ${JSON.stringify(value)}`).toBe(origin);
        expect(result.startsWith('//'), `entrée ${JSON.stringify(value)}`).toBe(false);
      }
    }
  });

  it('les valeurs acceptées par le module sont toutes à la même origine après résolution', () => {
    const origin = 'https://exemple.test';
    for (const [, value, options] of accepted) {
      const result = normalizeInternalRedirectPath(value, FALLBACK, options);
      expect(result).not.toBe(FALLBACK);
      expect(new URL(result, origin).origin).toBe(origin);
    }
  });
});

describe('refererRedirectPath', () => {
  const ORIGIN = 'https://exemple.test';

  it('URL complète du même site → chemin + filtres', () => {
    expect(refererRedirectPath('https://exemple.test/dashboard/testimonials?status=pending&q=a', ORIGIN, FALLBACK, DASHBOARD)).toBe(
      '/dashboard/testimonials?status=pending&q=a',
    );
  });

  it('le fragment (#…) n’est pas repris', () => {
    expect(refererRedirectPath('https://exemple.test/dashboard/leads?x=1#carte', ORIGIN, FALLBACK, DASHBOARD)).toBe('/dashboard/leads?x=1');
  });

  it.each([
    ['autre site', 'https://exemple-malveillant.test/dashboard/testimonials'],
    ['même hôte, autre protocole', 'http://exemple.test/dashboard/testimonials'],
    ['même hôte, autre port', 'https://exemple.test:8443/dashboard/testimonials'],
    ['sous-domaine', 'https://evil.exemple.test/dashboard/testimonials'],
    ['hors du préfixe autorisé', 'https://exemple.test/temoignages'],
    ['chemin seul (pas une URL)', '/dashboard/testimonials'],
    ['schéma exécutable', 'javascript:alert(1)'],
    ['vide', ''],
    ['absent', null],
    ['absent (undefined)', undefined],
  ])('refusé : %s → repli', (_label, referer) => {
    expect(refererRedirectPath(referer, ORIGIN, FALLBACK, DASHBOARD)).toBe(FALLBACK);
  });
});

// Parité : cas de `internal-href.test.mjs` (source en ligne 1) (liens cliquables d'un texte généré) appliqués à ce module.
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const BS = ch(92);

describe('normalizeInternalRedirectPath — parité avec la seconde source (liens internes)', () => {
  it.each([
    ['/admin', '/admin'],
    ['/admin/leads?x=1#y', '/admin/leads?x=1#y'],
    ['/./evil.com', '/evil.com'],
    ['/a/../b', '/b'],
    ['/?//x', '/?//x'],
    ['/#//x', '/#//x'],
    ['/%5Cevil.com', '/%5Cevil.com'],
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com'],
  ])('accepté et normalisé : %s → %s', (raw, want) => {
    const got = normalizeInternalRedirectPath(raw, FALLBACK);
    expect(got).toBe(want);
    expect(new URL(got, 'https://exemple.test/admin').origin).toBe('https://exemple.test');
  });

  it.each([
    '/..//evil.com', '/.//evil.com', '/a/..//evil.com', '/%2e%2e//evil.com', '/%2e//evil.com',
    '/..//evil.com?a=1', '/..///evil.com', '/%2E%2E//evil.com',
    '//evil.com', `/${BS}evil.com`, `${BS}${BS}evil.com`, `/${ch(9)}/evil.com`, `/${ch(10)}/evil.com`,
    '/ /evil.com', `/${ch(0xa0)}/evil.com`, `/${ch(0x2028)}/evil.com`, `/${ch(0)}/evil.com`, `/${ch(127)}/evil.com`,
    'javascript:alert(1)', 'https://evil.com', 'evil.com', '  //evil.com', '%2F%2Fevil.com',
  ])('refusé : %j', (raw) => {
    expect(normalizeInternalRedirectPath(raw, FALLBACK)).toBe(FALLBACK);
  });

  it('tout ce qui est accepté reste sur le site, quelle que soit la page courante', () => {
    const tricky = [`/${ch(0x200b)}/evil.com`, `/${ch(0xff0f, 0xff0f)}evil.com`, `/${ch(0x2215, 0x2215)}evil.com`, '/..%2F%2Fevil.com', '/%2e%2e%2f%2fevil.com'];
    for (const raw of tricky) {
      const got = normalizeInternalRedirectPath(raw, '/');
      expect(got.startsWith('/') && !got.startsWith('//'), `${JSON.stringify(raw)} → ${got}`).toBe(true);
      for (const page of ['https://exemple.test/admin', 'https://exemple.test/admin/leads/x/y', 'https://exemple.test/']) {
        expect(new URL(got, page).origin).toBe('https://exemple.test');
      }
    }
  });
});
