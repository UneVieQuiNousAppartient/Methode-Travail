// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/request-ip.test.ts, commit 508f19a (2026-10-30) ; généralisé : cas d'origine repris tels quels, cas du kit ajoutés.
import { describe, expect, it } from 'vitest';
import { clientIp } from './request-ip';

// Ordre des en-têtes de l'adresse IP.
const h = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe('clientIp', () => {
  it('x-vercel-forwarded-for d’abord (premier élément), même si les autres sont présents', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': '203.0.113.1, 10.0.0.1', 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '192.0.2.3' }))).toBe('203.0.113.1');
  });
  it('puis x-real-ip, puis le premier élément de x-forwarded-for', () => {
    expect(clientIp(h({ 'x-real-ip': ' 198.51.100.2 ', 'x-forwarded-for': '192.0.2.3' }))).toBe('198.51.100.2');
    expect(clientIp(h({ 'x-forwarded-for': '192.0.2.3, 10.0.0.1' }))).toBe('192.0.2.3');
  });
  it('en-têtes vides ou absents → null', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': ' ', 'x-forwarded-for': '' }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(null)).toBeNull();
  });

  // Ajoutés pour le kit (écart n° 4 : l'IP ne se lit qu'ici).
  it('x-forwarded-for falsifié par le client ne l’emporte jamais sur x-vercel-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });
  it('liste à plusieurs adresses : seul le premier élément, espaces retirés', () => {
    expect(clientIp(h({ 'x-forwarded-for': '  192.0.2.10 , 10.0.0.1, 10.0.0.2' }))).toBe('192.0.2.10');
  });
  it('objet sans en-têtes → null', () => {
    expect(clientIp(undefined)).toBeNull();
    expect(clientIp({ headers: { get: () => undefined } })).toBeNull();
  });
});
