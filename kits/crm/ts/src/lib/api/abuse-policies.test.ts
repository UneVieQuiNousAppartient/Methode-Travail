// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/abuse-policies.test.ts, commit 508f19a (2026-10-30) ; généralisé : valeurs des politiques génériques du kit (seuils de la seconde source) ; test de table ajouté.
import { describe, expect, it } from 'vitest';
import {
  ABUSE_POLICIES,
  CHAT_ABUSE_POLICY,
  CONNEXION_ABUSE_POLICY,
  CSP_RAPPORT_ABUSE_POLICY,
  DESABONNEMENT_ABUSE_POLICY,
  DESABONNEMENT_UN_CLIC_ABUSE_POLICY,
  FORMULAIRE_PUBLIC_ABUSE_POLICY,
  OAUTH_AUTORISATION_ABUSE_POLICY,
  rateLimitMessage,
} from './abuse-policies';

describe('politiques anti-abus du kit (valeurs figées)', () => {
  it('formulaire public : 8 par heure', () => {
    expect(FORMULAIRE_PUBLIC_ABUSE_POLICY).toEqual({ scope: 'formulaire-public', limit: 8, windowMs: 3_600_000, blockMs: 3_600_000 });
  });
  it('connexion : 5 essais par 10 minutes, blocage d’une heure', () => {
    expect(CONNEXION_ABUSE_POLICY).toEqual({ scope: 'connexion', limit: 5, windowMs: 600_000, blockMs: 3_600_000 });
  });
  it('désabonnement : page 30/h, un clic 600/h', () => {
    expect(DESABONNEMENT_ABUSE_POLICY).toEqual({ scope: 'desabonnement', limit: 30, windowMs: 3_600_000, blockMs: 3_600_000 });
    expect(DESABONNEMENT_UN_CLIC_ABUSE_POLICY).toEqual({ scope: 'desabonnement-un-clic', limit: 600, windowMs: 3_600_000, blockMs: 3_600_000 });
  });
  it('clavardage 120/h, autorisation OAuth 10/15 min, rapports CSP 60/min', () => {
    expect(CHAT_ABUSE_POLICY).toEqual({ scope: 'chat', limit: 120, windowMs: 3_600_000, blockMs: 3_600_000 });
    expect(OAUTH_AUTORISATION_ABUSE_POLICY).toEqual({ scope: 'oauth-autorisation', limit: 10, windowMs: 900_000, blockMs: 900_000 });
    expect(CSP_RAPPORT_ABUSE_POLICY).toEqual({ scope: 'csp-rapport', limit: 60, windowMs: 60_000, blockMs: 600_000 });
  });
});

describe('table des politiques (ajouté pour le kit)', () => {
  it.each(ABUSE_POLICIES.map((p) => [p.scope, p] as const))('%s : limite et durées > 0, dans les bornes de la base', (_scope, p) => {
    expect(p.limit).toBeGreaterThan(0);
    expect(Number.isInteger(p.limit)).toBe(true);
    expect(p.windowMs).toBeGreaterThan(0);
    expect(p.windowMs).toBeLessThanOrEqual(3_600_000); // hit_rate_limit : p_window_seconds ≤ 3600
    expect(p.blockMs).toBeGreaterThan(0);
    expect(p.blockMs).toBeLessThanOrEqual(86_400_000); // p_block_seconds ≤ 86400
  });
  it('portées toutes distinctes', () => {
    const scopes = ABUSE_POLICIES.map((p) => p.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });
  it('message 429 bilingue, français par défaut', () => {
    expect(rateLimitMessage()).toBe('Trop de requêtes. Réessayez plus tard.');
    expect(rateLimitMessage('en')).toBe('Too many requests. Please try again later.');
  });
});
