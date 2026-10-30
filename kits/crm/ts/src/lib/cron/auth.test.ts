// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/cron/auth.test.ts, commit 508f19a (2026-10-30) ; généralisé : domaine → exemple.test ; test « routes du projet utilisent la garde » non repris (routes absentes du kit) ; cas du kit ajoutés.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { authorizeCronRequest } from './auth';

const SECRET = 'x'.repeat(24); // valeur factice de test, pas un secret

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'https://exemple.test'), { headers });
}

describe('authorizeCronRequest', () => {
  const previous = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.CRON_SECRET = previous;
  });

  it('accepte le Bearer exact (contrat Vercel Cron)', () => {
    expect(authorizeCronRequest(req('/api/cron/tick', { authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it('refuse ?token=, même avec le bon secret (401), sur toutes les routes cron', () => {
    for (const route of ['tick', 'lead-follow-ups', 'agents-health', 'daily-report', 'appointment-reminders']) {
      expect(authorizeCronRequest(req(`/api/cron/${route}?token=${SECRET}`))?.status, route).toBe(401);
    }
  });

  it('refuse un mauvais secret, un secret de longueur différente, un en-tête vide ou sans Bearer', () => {
    expect(authorizeCronRequest(req('/x', { authorization: `Bearer ${'x'.repeat(23)}y` }))?.status).toBe(401);
    expect(authorizeCronRequest(req('/x', { authorization: `Bearer ${SECRET}x` }))?.status).toBe(401);
    expect(authorizeCronRequest(req('/x', { authorization: 'Bearer ' }))?.status).toBe(401);
    expect(authorizeCronRequest(req('/x', { authorization: SECRET }))?.status).toBe(401);
    expect(authorizeCronRequest(req('/x'))?.status).toBe(401);
  });

  it('refuse (401 générique) si CRON_SECRET est absent : jamais d’accès ouvert, configuration non révélée', async () => {
    delete process.env.CRON_SECRET;
    for (const authorization of ['Bearer ', 'Bearer undefined', '']) {
      const response = authorizeCronRequest(req('/x', { authorization }));
      expect(response?.status, authorization).toBe(401);
      expect(JSON.stringify(await response?.json())).not.toContain('CRON_SECRET');
    }
  });

  // Ajoutés pour le kit.
  it('secret de longueur différente (plus court, beaucoup plus long, multioctet) : 401 sans exception', () => {
    for (const candidate of ['x', 'x'.repeat(500), 'é'.repeat(12), `${SECRET.slice(0, 23)}é`]) {
      expect(() => authorizeCronRequest(req('/x', { authorization: `Bearer ${candidate}` }))).not.toThrow();
      expect(authorizeCronRequest(req('/x', { authorization: `Bearer ${candidate}` }))?.status).toBe(401);
    }
  });

  it('espaces autour du secret configuré ou du jeton reçu : retirés des deux côtés ; casse de « Bearer » ignorée', () => {
    process.env.CRON_SECRET = `  ${SECRET}\n`;
    expect(authorizeCronRequest(req('/x', { authorization: `Bearer ${SECRET}` }))).toBeNull();
    expect(authorizeCronRequest(req('/x', { authorization: `bearer   ${SECRET}  ` }))).toBeNull();
    expect(authorizeCronRequest(req('/x', { authorization: `Bearer ${SECRET.slice(1)} x` }))?.status).toBe(401);
  });

  it('CRON_SECRET fait d’espaces seulement = absent : 401', () => {
    process.env.CRON_SECRET = '   ';
    expect(authorizeCronRequest(req('/x', { authorization: 'Bearer    ' }))?.status).toBe(401);
  });
});
