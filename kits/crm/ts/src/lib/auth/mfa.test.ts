// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa.test.ts, commit 508f19a (2026-10-30) ; généralisé : cas du mode jeton retirés (pas de mode jeton dans le kit) ; ajoutés : charge « aal2 » refusée par getUser, rôles toujours soumis, codes de secours, récupération, émetteur, isTotpCode durci.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeUuid } from '@/test-support/fake-supabase';
import {
  MFA_ALWAYS_ROLES,
  isEnrolled,
  isTotpCode,
  jwtClaims,
  mfaIssuer,
  mfaRequiredForAll,
  mfaRequiredForRole,
  mfaState,
  sessionAal,
  sessionIdOf,
  verifiedFactors,
} from './mfa';
import { verifyAccessToken } from './team-session';

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (claims: Record<string, unknown>) => `h.${b64url(claims)}.s`;
const S1 = '6b1f0c1e-1111-4111-8111-111111111111';

const enrolled = { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] };
const pending = { factors: [{ id: 'f2', factor_type: 'totp', status: 'unverified' }] };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('lecture du jeton', () => {
  it('aal lu dans le jeton (aal1, aal2) ; illisible ou inconnu → null', () => {
    expect(sessionAal(jwt({ aal: 'aal1' }))).toBe('aal1');
    expect(sessionAal(jwt({ aal: 'aal2' }))).toBe('aal2');
    expect(sessionAal('pas-un-jwt')).toBeNull();
    expect(sessionAal(jwt({ aal: 'aal9' }))).toBeNull();
    expect(sessionAal(null)).toBeNull();
  });

  it('session_id lu en minuscules ; absent ou invalide → null', () => {
    expect(sessionIdOf(jwt({ session_id: S1.toUpperCase() }))).toBe(S1);
    expect(sessionIdOf(jwt({ session_id: 'x' }))).toBeNull();
    expect(sessionIdOf('pas-un-jwt')).toBeNull();
  });

  it('charge utile UTF-8 et base64url sans remplissage', () => {
    expect(jwtClaims(jwt({ name: 'Élise' }))?.name).toBe('Élise');
    expect(jwtClaims('h.e30.s')).toEqual({});
    expect(jwtClaims(`h.${b64url([1, 2])}.s`)).toBeNull();
  });

  it('jeton dont la charge dit « aal2 » mais refusé par getUser → jamais aal2 (rien n’est lu)', async () => {
    const forged = jwt({ sub: fakeUuid(1), aal: 'aal2', session_id: S1 });
    const fake = createFakeSupabase({}, { auth: { users: [{ id: fakeUuid(1), email: 'membre@exemple.test', factors: enrolled.factors as never }], sessions: [] } });
    expect(await verifyAccessToken(fake.client, forged)).toBeNull();
    expect(fake.authCalls).toEqual([{ method: 'getUser' }]);
    // Le même jeton, accepté par Supabase Auth : seulement alors aal et session_id sont lus.
    const accepted = createFakeSupabase({}, { auth: { users: [{ id: fakeUuid(1), email: 'membre@exemple.test' }], sessions: [{ token: forged, userId: fakeUuid(1) }] } });
    expect(await verifyAccessToken(accepted.client, forged)).toMatchObject({ aal: 'aal2', sessionId: S1 });
    expect(await verifyAccessToken(accepted.client, null)).toBeNull();
  });
});

describe('facteurs', () => {
  it('facteur « unverified » ≠ inscrit ; seuls les vérifiés comptent', () => {
    expect(isEnrolled(pending)).toBe(false);
    expect(isEnrolled({ factors: [...pending.factors, ...enrolled.factors] })).toBe(true);
    expect(verifiedFactors({ factors: [...pending.factors, ...enrolled.factors] }).map((f) => f.id)).toEqual(['f1']);
    expect(isEnrolled(null)).toBe(false);
    expect(isEnrolled({ factors: null })).toBe(false);
  });
});

describe('mfaState (la règle)', () => {
  it('non inscrit, politique par défaut → aucun code demandé', () => {
    expect(mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: false })).toMatchObject({ required: false, satisfied: true, code: null });
  });

  it('inscrit + session aal1 → mfa_required ; aal2 → accepté', () => {
    expect(mfaState(enrolled, jwt({ aal: 'aal1' }), { requiredForAll: false })).toMatchObject({ satisfied: false, code: 'mfa_required' });
    expect(mfaState(enrolled, jwt({ aal: 'aal2' }), { requiredForAll: false })).toMatchObject({ satisfied: true, code: null });
  });

  it('facteur non vérifié ≠ inscrit', () => {
    expect(mfaState(pending, jwt({ aal: 'aal1' }), { requiredForAll: false }).enrolled).toBe(false);
  });

  it('obligatoire pour tous + non inscrit → mfa_enrollment_required (même avec un facteur non vérifié)', () => {
    expect(mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: true }).code).toBe('mfa_enrollment_required');
    expect(mfaState(pending, jwt({ aal: 'aal1' }), { requiredForAll: true }).code).toBe('mfa_enrollment_required');
  });

  it('requiredForAll reflète ADMIN_MFA_REQUIRED, même pour un inscrit (écran Sécurité)', () => {
    expect(mfaState(enrolled, jwt({ aal: 'aal2' }), { requiredForAll: true }).requiredForAll).toBe(true);
    expect(mfaState(enrolled, jwt({ aal: 'aal2' }), { requiredForAll: false }).requiredForAll).toBe(false);
  });

  it('ADMIN_MFA_REQUIRED lu dans l’environnement : seulement la valeur « 1 »', () => {
    vi.stubEnv('ADMIN_MFA_REQUIRED', '1');
    expect(mfaRequiredForAll()).toBe(true);
    expect(mfaState({}, jwt({ aal: 'aal1' })).code).toBe('mfa_enrollment_required');
    vi.stubEnv('ADMIN_MFA_REQUIRED', 'true');
    expect(mfaRequiredForAll()).toBe(false);
    vi.stubEnv('ADMIN_MFA_REQUIRED', '');
    expect(mfaState({}, jwt({ aal: 'aal1' })).satisfied).toBe(true);
  });

  it('session de confiance : remplace le code, jamais l’inscription', () => {
    expect(mfaState(enrolled, jwt({ aal: 'aal1' }), { requiredForAll: false, trusted: true })).toMatchObject({ satisfied: true, trusted: true });
    expect(mfaState({ factors: [] }, jwt({ aal: 'aal1' }), { requiredForAll: true, trusted: true }).code).toBe('mfa_enrollment_required');
    expect(mfaState(enrolled, jwt({ aal: 'aal1' }), { requiredForAll: false, trusted: false }).code).toBe('mfa_required');
    // En aal2, la session n'est pas « de confiance » : le code a été donné.
    expect(mfaState(enrolled, jwt({ aal: 'aal2' }), { requiredForAll: false, trusted: true }).trusted).toBe(false);
  });

  it('rôles toujours soumis : vide par défaut ; un rôle listé exige l’inscription', () => {
    expect(MFA_ALWAYS_ROLES).toEqual([]);
    expect(mfaRequiredForRole('admin')).toBe(false);
    expect(mfaRequiredForRole('admin', ['admin'])).toBe(true);
    expect(mfaRequiredForRole(null, ['admin'])).toBe(false);
    expect(mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: false, role: 'admin', alwaysRoles: ['admin'] }).code).toBe('mfa_enrollment_required');
    expect(mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: false, role: 'employe', alwaysRoles: ['admin'] }).satisfied).toBe(true);
  });

  it('codes de secours sans facteur → mfa_enrollment_required (retirer son facteur ne fait pas tomber l’exigence)', () => {
    expect(mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: false, hasBackupCodes: true })).toMatchObject({
      required: true,
      satisfied: false,
      code: 'mfa_enrollment_required',
    });
    // Facteur retiré alors que la session était encore aal2 : l'inscription est redemandée.
    expect(mfaState({}, jwt({ aal: 'aal2' }), { requiredForAll: false, hasBackupCodes: true }).code).toBe('mfa_enrollment_required');
  });

  it('session de récupération : exposée, ne satisfait jamais rien', () => {
    const state = mfaState({}, jwt({ aal: 'aal1' }), { requiredForAll: false, hasBackupCodes: true, recovery: true });
    expect(state).toMatchObject({ recovery: true, satisfied: false, code: 'mfa_enrollment_required', trusted: false });
    expect(mfaState(enrolled, jwt({ aal: 'aal1' }), { requiredForAll: false, recovery: true })).toMatchObject({ satisfied: false, code: 'mfa_required' });
    expect(mfaState(enrolled, jwt({ aal: 'aal2' }), { requiredForAll: false }).recovery).toBe(false);
  });
});

describe('émetteur', () => {
  it('MFA_ISSUER, puis SITE_NAME, puis un défaut', () => {
    expect(mfaIssuer({ MFA_ISSUER: ' Mon CRM ', SITE_NAME: 'Site' })).toBe('Mon CRM');
    expect(mfaIssuer({ MFA_ISSUER: ' ', SITE_NAME: 'Site' })).toBe('Site');
    expect(mfaIssuer({})).toBe('Administration');
  });
});

it('code à 6 chiffres seulement : 5 ou 7 chiffres, lettre, espaces, non-chaîne → refusé', () => {
  expect(isTotpCode('123456')).toBe(true);
  expect(isTotpCode('12345')).toBe(false);
  expect(isTotpCode('1234567')).toBe(false);
  expect(isTotpCode('12345a')).toBe(false);
  expect(isTotpCode('123 456')).toBe(false);
  expect(isTotpCode(' 123456')).toBe(false);
  expect(isTotpCode('123456\n')).toBe(false);
  expect(isTotpCode('１２３４５６')).toBe(false);
  expect(isTotpCode(123456)).toBe(false);
  expect(isTotpCode(null)).toBe(false);
  expect(isTotpCode(['123456'])).toBe(false);
});
