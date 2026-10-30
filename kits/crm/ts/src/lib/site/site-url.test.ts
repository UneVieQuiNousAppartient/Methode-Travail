// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/site-url.test.mjs, commit 2954590 (2026-10-27) ; généralisé : port Vitest (vi.stubEnv) des cas « URL du site » ; cas llms.txt et www (propres au projet) non repris.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { absoluteUrl, getPublicSiteUrl, getSiteUrl, siteUrlSource } from './site-url';

const env = (site: string | undefined, vercel?: string) => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', site);
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', vercel);
};

afterEach(() => vi.unstubAllEnvs());

describe('site-url (cas d’origine)', () => {
  it('absente → vide et chemin relatif', () => {
    env(undefined);
    expect(getSiteUrl()).toBe('');
    expect(getPublicSiteUrl()).toBe('');
    expect(absoluteUrl('/diagnostic')).toBe('/diagnostic');
    expect(siteUrlSource()).toBe('none');
  });
  it('localhost → non publique', () => {
    env('http://localhost:3000');
    expect(getSiteUrl()).toBe('http://localhost:3000');
    expect(getPublicSiteUrl()).toBe('');
    expect(absoluteUrl('/x')).toBe('/x');
  });
  it('https publique → absolue, sans slash final', () => {
    env('https://exemple.test/');
    expect(getPublicSiteUrl()).toBe('https://exemple.test');
    expect(absoluteUrl('diagnostic')).toBe('https://exemple.test/diagnostic');
    expect(siteUrlSource()).toBe('env');
  });
  it('http non sécurisé → non publique', () => {
    env('http://exemple.test');
    expect(getPublicSiteUrl()).toBe('');
  });
  it('URL avec chemin → refusée comme base', () => {
    env('https://exemple.test/site');
    expect(getPublicSiteUrl()).toBe('');
  });
});

describe('site-url (ajoutés pour le kit)', () => {
  it('plusieurs barres obliques finales retirées', () => {
    env('https://exemple.test///');
    expect(getSiteUrl()).toBe('https://exemple.test');
    expect(getPublicSiteUrl()).toBe('https://exemple.test');
  });
  it('chemin sans / initial et chemin par défaut', () => {
    env('https://exemple.test');
    expect(absoluteUrl('a/b?c=1')).toBe('https://exemple.test/a/b?c=1');
    expect(absoluteUrl()).toBe('https://exemple.test/');
  });
  it('127.0.0.1 en https → non publique', () => {
    env('https://127.0.0.1:3000');
    expect(getPublicSiteUrl()).toBe('');
  });
  it('repli Vercel : https ajouté, schéma fourni ignoré', () => {
    env(undefined, 'mon-projet.vercel.app');
    expect(getPublicSiteUrl()).toBe('https://mon-projet.vercel.app');
    expect(siteUrlSource()).toBe('vercel');
    env(undefined, 'http://mon-projet.vercel.app/');
    expect(getPublicSiteUrl()).toBe('https://mon-projet.vercel.app');
  });
  it('NEXT_PUBLIC_SITE_URL prioritaire sur le repli Vercel', () => {
    env('https://exemple.test', 'mon-projet.vercel.app');
    expect(getPublicSiteUrl()).toBe('https://exemple.test');
  });
});
