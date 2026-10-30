// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/authz/mfa-lock.test.ts (scénarios de session : aal1, aal2, session de confiance, facteur retiré, obligation), commit 508f19a (2026-10-30) ; généralisé : point d'entrée du kit sur le faux client (getUser, liste blanche, sessions de confiance), sans middleware ni témoins de la source ; ajoutés : jeton absent ou falsifié, liste blanche en minuscules, rôle avant la double vérification, codes de secours, récupération.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, fakeUuid, type FakeAuthFactor, type Row } from '@/test-support/fake-supabase';
import { hashTrustToken } from './mfa-trust';
import { deny, getTeamMember, type TeamSessionResult } from './team-session';

const NOW = new Date('2026-10-21T12:00:00Z');
const ADMIN = { id: fakeUuid(1), email: 'admin@exemple.test' };
const EMPLOYE = { id: fakeUuid(2), email: 'employe@exemple.test' };
const S1 = fakeUuid(11);
const S2 = fakeUuid(12);
const DEVICE = fakeUuid(21);
const VERIFIED: FakeAuthFactor[] = [{ id: 'f1', status: 'verified', factor_type: 'totp' }];
const UNVERIFIED: FakeAuthFactor[] = [{ id: 'f2', status: 'unverified', factor_type: 'totp' }];

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

interface Setup {
  users?: Array<{ id: string; email: string; factors?: FakeAuthFactor[] }>;
  /** Jetons acceptés par getUser. */
  sessions?: Array<{ token: string; userId: string }>;
  allowlist?: Row[];
  tables?: Record<string, Row[]>;
  failTables?: string[];
}

function setup({ users = [], sessions = [], allowlist, tables = {}, failTables }: Setup = {}) {
  return createFakeSupabase(
    {
      team_allowlist: allowlist ?? [
        { email: ADMIN.email, role: 'admin' },
        { email: EMPLOYE.email, role: 'employe' },
      ],
      ...tables,
    },
    { auth: { users, sessions }, failTables },
  );
}

/** Jeton de session (charge lisible) accepté par le faux Supabase Auth. */
const tokenFor = (userId: string, aal: 'aal1' | 'aal2', sessionId = S1) => jwt({ sub: userId, aal, session_id: sessionId });

const request = (method: string, path: string, token?: string | null, headers: Record<string, string> = {}) =>
  new Request(`https://crm.exemple.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

const refusalOf = (result: TeamSessionResult) => (result.ok ? null : result.refusal);

async function trustedDeviceTables(userId: string, reason: 'device' | 'backup_code' = 'device', sessionId = S1): Promise<Record<string, Row[]>> {
  return {
    mfa_trusted_devices: [
      { id: DEVICE, user_id: userId, token_hash: await hashTrustToken('a'.repeat(64)), expires_at: '2026-11-20T12:00:00Z', revoked_at: null },
    ],
    mfa_trusted_sessions: [
      { user_id: userId, session_id: sessionId, reason, device_id: reason === 'device' ? DEVICE : null, expires_at: '2026-10-21T13:00:00Z' },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv('ADMIN_MFA_REQUIRED', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('identité', () => {
  it('jeton absent ou en-tête mal formé → 401, Supabase Auth non appelé', async () => {
    const fake = setup();
    expect(refusalOf(await getTeamMember(request('GET', '/admin'), { db: fake.client, now: NOW }))).toEqual({ status: 401 });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', null, { authorization: 'Basic abc' }), { db: fake.client, now: NOW }))).toEqual({ status: 401 });
    expect(fake.authCalls).toHaveLength(0);
  });

  it('jeton falsifié (inconnu de getUser, charge « aal2 ») → 401, liste blanche jamais lue', async () => {
    const forged = jwt({ sub: ADMIN.id, email: ADMIN.email, aal: 'aal2', session_id: S1 });
    const fake = setup({ users: [{ ...ADMIN, factors: VERIFIED }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', forged), { db: fake.client, now: NOW }))).toEqual({ status: 401 });
    expect(fake.authCalls).toEqual([{ method: 'getUser' }]);
    expect(fake.queries).toHaveLength(0);
  });

  it('adresse hors liste → 401', async () => {
    const token = tokenFor(fakeUuid(3), 'aal2');
    const fake = setup({ users: [{ id: fakeUuid(3), email: 'inconnu@exemple.test' }], sessions: [{ token, userId: fakeUuid(3) }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW }))).toEqual({ status: 401 });
  });

  it('majuscules : courriel du compte mis en minuscules ; une ligne en majuscules dans la liste n’élargit rien', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const upper = setup({ users: [{ id: ADMIN.id, email: 'Admin@Exemple.TEST' }], sessions: [{ token, userId: ADMIN.id }] });
    const result = await getTeamMember(request('GET', '/admin', token), { db: upper.client, now: NOW });
    expect(result.ok && result.member).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(upper.queries[0].filters).toContainEqual({ op: 'eq', column: 'email', value: ADMIN.email });

    const listUpper = setup({
      users: [{ id: ADMIN.id, email: ADMIN.email }],
      sessions: [{ token, userId: ADMIN.id }],
      allowlist: [{ email: 'Admin@Exemple.test', role: 'admin' }],
    });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: listUpper.client, now: NOW }))).toEqual({ status: 401 });
  });

  it('rôle lu dans la table, jamais dans la requête ; rôle inconnu dans la table → 401', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({ users: [EMPLOYE], sessions: [{ token, userId: EMPLOYE.id }] });
    const result = await getTeamMember(request('GET', '/api/admin/team', token, { 'x-role': 'admin' }), { db: fake.client, now: NOW });
    expect(refusalOf(result)).toMatchObject({ status: 403, requiredRole: 'admin', role: 'employe' });

    const odd = setup({ users: [EMPLOYE], sessions: [{ token, userId: EMPLOYE.id }], allowlist: [{ email: EMPLOYE.email, role: 'proprietaire' }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: odd.client, now: NOW }))).toEqual({ status: 401 });
  });

  it('liste blanche illisible → 401 ; base absente → 503', async () => {
    const token = tokenFor(ADMIN.id, 'aal2');
    const fake = setup({ users: [ADMIN], sessions: [{ token, userId: ADMIN.id }], failTables: ['team_allowlist'] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW }))).toEqual({ status: 401 });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: null }))).toEqual({ status: 503 });
  });

  it('table de liste blanche en paramètre', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const fake = createFakeSupabase({ equipe: [{ email: ADMIN.email, role: 'admin' }] }, { auth: { users: [ADMIN], sessions: [{ token, userId: ADMIN.id }] } });
    const result = await getTeamMember(request('GET', '/admin', token), { db: fake.client, allowlistTable: 'equipe', now: NOW });
    expect(result.ok).toBe(true);
  });
});

describe('rôle', () => {
  it('rôle insuffisant → 403 + required_role (matrice : chemin inconnu → admin)', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal2');
    const fake = setup({ users: [EMPLOYE], sessions: [{ token, userId: EMPLOYE.id }] });
    expect(refusalOf(await getTeamMember(request('GET', '/api/admin/audit', token), { db: fake.client, now: NOW }))).toMatchObject({
      status: 403,
      requiredRole: 'gestionnaire',
    });
    expect(refusalOf(await getTeamMember(request('GET', '/api/admin/inconnu', token), { db: fake.client, now: NOW }))).toMatchObject({
      status: 403,
      requiredRole: 'admin',
    });
    expect(refusalOf(await getTeamMember(request('GET', '/api/admin/../team', token), { db: fake.client, now: NOW }))).toMatchObject({ status: 403 });
  });

  it('rôle vérifié AVANT la double vérification : inscrit en aal1 avec un rôle insuffisant → required_role, pas mfa_required', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({ users: [{ ...EMPLOYE, factors: VERIFIED }], sessions: [{ token, userId: EMPLOYE.id }] });
    const refusal = refusalOf(await getTeamMember(request('GET', '/api/admin/team', token), { db: fake.client, now: NOW }));
    expect(refusal).toMatchObject({ status: 403, requiredRole: 'admin' });
    expect(refusal).not.toHaveProperty('code');
  });

  it('minRole : rôle minimal de la route au lieu de la matrice', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({ users: [EMPLOYE], sessions: [{ token, userId: EMPLOYE.id }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, minRole: 'gestionnaire', now: NOW }))).toMatchObject({
      status: 403,
      requiredRole: 'gestionnaire',
    });
    expect((await getTeamMember(request('GET', '/api/admin/inconnu', token), { db: fake.client, minRole: 'employe', now: NOW })).ok).toBe(true);
  });
});

describe('double vérification', () => {
  it('sans facteur et sans obligation : accepté, aucun code demandé', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({ users: [{ ...EMPLOYE, factors: UNVERIFIED }], sessions: [{ token, userId: EMPLOYE.id }] });
    const result = await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW });
    expect(result.ok && result.member.mfa).toMatchObject({ enrolled: false, required: false, satisfied: true });
  });

  it('inscrit en aal1 → 403 mfa_required ; aal2 → accepté', async () => {
    const aal1 = tokenFor(ADMIN.id, 'aal1');
    const aal2 = tokenFor(ADMIN.id, 'aal2', S2);
    const fake = setup({ users: [{ ...ADMIN, factors: VERIFIED }], sessions: [{ token: aal1, userId: ADMIN.id }, { token: aal2, userId: ADMIN.id }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', aal1), { db: fake.client, now: NOW }))).toEqual({ status: 403, code: 'mfa_required' });
    const ok = await getTeamMember(request('GET', '/admin', aal2), { db: fake.client, now: NOW });
    expect(ok.ok && ok.member).toMatchObject({ userId: ADMIN.id, role: 'admin', sessionId: S2, mfa: { aal: 'aal2', satisfied: true } });
  });

  it('pendant l’étape du code : les routes MFA restent ouvertes (état exposé) ; enforceMfa=false ne bloque pas', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const fake = setup({ users: [{ ...ADMIN, factors: VERIFIED }], sessions: [{ token, userId: ADMIN.id }] });
    const verify = await getTeamMember(request('POST', '/api/admin/mfa/verify', token), { db: fake.client, now: NOW });
    expect(verify.ok && verify.member.mfa).toMatchObject({ satisfied: false, code: 'mfa_required' });
    expect((await getTeamMember(request('GET', '/admin', token), { db: fake.client, enforceMfa: false, now: NOW })).ok).toBe(true);
  });

  it('session de confiance (appareil) → acceptée sans code ; une autre session → non', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const other = tokenFor(ADMIN.id, 'aal1', S2);
    const fake = setup({
      users: [{ ...ADMIN, factors: VERIFIED }],
      sessions: [{ token, userId: ADMIN.id }, { token: other, userId: ADMIN.id }],
      tables: await trustedDeviceTables(ADMIN.id),
    });
    const result = await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW });
    expect(result.ok && result.member.mfa).toMatchObject({ trusted: true, satisfied: true });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', other), { db: fake.client, now: NOW }))).toEqual({ status: 403, code: 'mfa_required' });
  });

  it('facteur retiré + session de confiance → la confiance ne compte plus (inscription exigée si codes de secours ou obligation)', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const tables = await trustedDeviceTables(ADMIN.id);
    const withCodes = setup({
      users: [{ ...ADMIN, factors: [] }],
      sessions: [{ token, userId: ADMIN.id }],
      tables: { ...tables, mfa_backup_codes: [{ user_id: ADMIN.id, code_hash: 'x', used_at: null }] },
    });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: withCodes.client, now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });

    const forAll = setup({ users: [{ ...ADMIN, factors: [] }], sessions: [{ token, userId: ADMIN.id }], tables: await trustedDeviceTables(ADMIN.id) });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: forAll.client, requiredForAll: true, now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });
    // Ni codes ni obligation : la double vérification n'est plus exigée, mais la session n'est pas « de confiance ».
    const result = await getTeamMember(request('GET', '/admin', token), { db: forAll.client, requiredForAll: false, now: NOW });
    expect(result.ok && result.member.mfa).toMatchObject({ trusted: false, required: false });
  });

  it('ligne « backup_code » seule → jamais satisfaite ; la récupération est seulement exposée', async () => {
    const token = tokenFor(ADMIN.id, 'aal1');
    const fake = setup({
      users: [{ ...ADMIN, factors: VERIFIED }],
      sessions: [{ token, userId: ADMIN.id }],
      tables: await trustedDeviceTables(ADMIN.id, 'backup_code'),
    });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW }))).toEqual({ status: 403, code: 'mfa_required' });
    const info = await getTeamMember(request('POST', '/api/admin/mfa/enroll', token), { db: fake.client, now: NOW });
    expect(info.ok && info.member.mfa).toMatchObject({ recovery: true, trusted: false, satisfied: false });
    // Échue : plus de récupération.
    const late = await getTeamMember(request('POST', '/api/admin/mfa/enroll', token), { db: fake.client, now: new Date('2026-10-21T13:00:00Z') });
    expect(late.ok && late.member.mfa.recovery).toBe(false);
  });

  it('codes de secours sans facteur → mfa_enrollment_required ; table illisible → même refus (échec fermé)', async () => {
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({
      users: [{ ...EMPLOYE, factors: [] }],
      sessions: [{ token, userId: EMPLOYE.id }],
      tables: { mfa_backup_codes: [{ user_id: EMPLOYE.id, code_hash: 'x', used_at: '2026-10-01T00:00:00Z' }] },
    });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });
    const broken = setup({ users: [{ ...EMPLOYE, factors: [] }], sessions: [{ token, userId: EMPLOYE.id }], failTables: ['mfa_backup_codes'] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: broken.client, now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });
    // Les codes d'un AUTRE compte ne comptent pas.
    const others = setup({
      users: [{ ...EMPLOYE, factors: [] }],
      sessions: [{ token, userId: EMPLOYE.id }],
      tables: { mfa_backup_codes: [{ user_id: ADMIN.id, code_hash: 'x', used_at: null }] },
    });
    expect((await getTeamMember(request('GET', '/admin', token), { db: others.client, now: NOW })).ok).toBe(true);
  });

  it('ADMIN_MFA_REQUIRED=1 (environnement) : un membre sans facteur est envoyé vers l’inscription', async () => {
    vi.stubEnv('ADMIN_MFA_REQUIRED', '1');
    const token = tokenFor(EMPLOYE.id, 'aal1');
    const fake = setup({ users: [EMPLOYE], sessions: [{ token, userId: EMPLOYE.id }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', token), { db: fake.client, now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });
  });

  it('rôle toujours soumis (paramètre) : l’administrateur sans facteur doit s’inscrire, l’employé non', async () => {
    const admin = tokenFor(ADMIN.id, 'aal1');
    const employe = tokenFor(EMPLOYE.id, 'aal1', S2);
    const fake = setup({ users: [ADMIN, EMPLOYE], sessions: [{ token: admin, userId: ADMIN.id }, { token: employe, userId: EMPLOYE.id }] });
    expect(refusalOf(await getTeamMember(request('GET', '/admin', admin), { db: fake.client, alwaysRoles: ['admin'], now: NOW }))).toEqual({
      status: 403,
      code: 'mfa_enrollment_required',
    });
    expect((await getTeamMember(request('GET', '/admin', employe), { db: fake.client, alwaysRoles: ['admin'], now: NOW })).ok).toBe(true);
  });
});

describe('deny', () => {
  it('401 { detail } ; 403 { detail, required_role } ; 403 { detail, code } ; 503 ; jamais en cache', async () => {
    const unauth = deny({ status: 401 });
    expect(unauth.status).toBe(401);
    expect(await unauth.json()).toEqual({ detail: expect.any(String) });
    expect(unauth.headers.get('cache-control')).toBe('no-store');

    const forbidden = deny({ status: 403, requiredRole: 'gestionnaire', role: 'employe' });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ detail: expect.stringContaining('gestionnaire'), required_role: 'gestionnaire' });

    const mfa = deny({ status: 403, code: 'mfa_required' });
    expect(await mfa.json()).toEqual({ detail: expect.any(String), code: 'mfa_required' });

    expect(deny({ status: 503 }).status).toBe(503);
  });
});
