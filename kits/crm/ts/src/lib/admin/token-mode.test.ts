// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/admin/token-mode.test.ts, commit 508f19a (2026-10-30) ; généralisé : seuls les cas de isTokenModeAllowed (les cas de session par jeton testent auth.ts, propre à la source) ; cas ajoutés : VERCEL en espaces, ADMIN_TOKEN_MODE_LOCAL avec VERCEL.
import { describe, expect, it } from 'vitest';
import { isTokenModeAllowed, TOKEN_MODE_REFUSED_MESSAGE } from './token-mode';

describe('isTokenModeAllowed — fermé par défaut', () => {
  it('permis en développement et en test hors Vercel ; refusé dès que VERCEL est posé', () => {
    expect(isTokenModeAllowed({})).toBe(true);
    expect(isTokenModeAllowed({ NODE_ENV: 'development', VERCEL: '' })).toBe(true);
    expect(isTokenModeAllowed({ NODE_ENV: 'test' })).toBe(true);
    expect(isTokenModeAllowed({ NODE_ENV: 'development', VERCEL: '1' })).toBe(false);
    expect(isTokenModeAllowed({ NODE_ENV: 'test', VERCEL: '1' })).toBe(false);
  });

  it('production (next start) : refusé, sauf ADMIN_TOKEN_MODE_LOCAL=1 exactement, hors Vercel', () => {
    expect(isTokenModeAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(isTokenModeAllowed({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: 'oui' })).toBe(false);
    expect(isTokenModeAllowed({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: 'true' })).toBe(false);
    expect(isTokenModeAllowed({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: ' 1 ' })).toBe(true);
    expect(isTokenModeAllowed({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: '1' })).toBe(true);
  });

  it('ADMIN_TOKEN_MODE_LOCAL=1 ne vaut jamais sur Vercel (production ou aperçu)', () => {
    expect(isTokenModeAllowed({ NODE_ENV: 'production', ADMIN_TOKEN_MODE_LOCAL: '1', VERCEL: '1' })).toBe(false);
    expect(isTokenModeAllowed({ NODE_ENV: 'development', ADMIN_TOKEN_MODE_LOCAL: '1', VERCEL: '1' })).toBe(false);
  });

  it('VERCEL fait seulement d’espaces = non posé (comportement de la source, figé ici)', () => {
    expect(isTokenModeAllowed({ NODE_ENV: 'development', VERCEL: '   ' })).toBe(true);
    expect(isTokenModeAllowed({ NODE_ENV: 'production', VERCEL: ' ' })).toBe(false);
  });

  it('le message ne cite aucune variable d’environnement ni secret', () => {
    expect(TOKEN_MODE_REFUSED_MESSAGE).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });
});
