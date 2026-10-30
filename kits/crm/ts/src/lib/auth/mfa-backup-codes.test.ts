// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source n'a pas de tests de ses codes de secours ; la session de récupération est une conception propre au kit).
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeUuid, type FakeOptions, type Row } from '@/test-support/fake-supabase';
import {
  BACKUP_CODE_COUNT,
  backupSecret,
  clearBackupCodes,
  CONSUME_BACKUP_CODE_RPC,
  endRecovery,
  enrollmentAllowed,
  generateBackupCodes,
  hashBackupCode,
  isBackupCodeFormat,
  issueBackupCodes,
  normalizeBackupCode,
  RECOVERY_MINUTES,
  redeemBackupCode,
  remainingBackupCodes,
  REPLACE_BACKUP_CODES_RPC,
} from './mfa-backup-codes';

const SECRET = 's'.repeat(32);
const env = { MFA_BACKUP_SECRET: SECRET };
const ALICE = fakeUuid(1);
const BOB = fakeUuid(2);
const SESSION = fakeUuid(100);
const NOW = new Date('2026-06-01T12:00:00.000Z');

/** Fonctions SQL simulées avec la même sémantique que 0109 (consommation en une seule instruction). */
const rpc: FakeOptions['rpc'] = {
  [CONSUME_BACKUP_CODE_RPC]: (args, fake) => {
    const row = (fake.tables.mfa_backup_codes ?? []).find(
      (entry) => entry.user_id === args.p_user && entry.code_hash === args.p_hash && entry.used_at === null,
    );
    if (!row) return { data: false, error: null };
    row.used_at = NOW.toISOString();
    return { data: true, error: null };
  },
  [REPLACE_BACKUP_CODES_RPC]: (args, fake) => {
    const others = (fake.tables.mfa_backup_codes ?? []).filter((entry) => entry.user_id !== args.p_user);
    const fresh = (args.p_hashes as string[]).map((code_hash) => ({ user_id: args.p_user, code_hash, used_at: null }));
    fake.tables.mfa_backup_codes = [...others, ...fresh];
    return { data: fresh.length, error: null };
  },
};

function setup(codes: Record<string, string[]> = { [ALICE]: ['ABCD-EFGH', 'JKLM-NPQR'] }, extra: Partial<FakeOptions> = {}) {
  const rows: Row[] = Object.entries(codes).flatMap(([user_id, list]) =>
    list.map((code) => ({ user_id, code_hash: hashBackupCode(code, SECRET), used_at: null })),
  );
  return createFakeSupabase(
    {
      mfa_backup_codes: rows,
      mfa_trusted_devices: [
        { id: fakeUuid(50), user_id: ALICE, revoked_at: null },
        { id: fakeUuid(51), user_id: BOB, revoked_at: null },
      ],
      mfa_trusted_sessions: [],
    },
    {
      rpc,
      auth: {
        users: [
          { id: ALICE, email: 'a@exemple.test', factors: [{ id: 'fa', status: 'verified' }, { id: 'fb', status: 'unverified' }] },
          { id: BOB, email: 'b@exemple.test', factors: [{ id: 'fc', status: 'verified' }] },
        ],
      },
      ...extra,
    },
  );
}

describe('génération et format', () => {
  it(`${BACKUP_CODE_COUNT} codes distincts « XXXX-XXXX », sans 0, O, 1 ni I`, () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(isBackupCodeFormat(code)).toBe(true);
    }
  });

  it('un tirage qui se répète ne donne jamais deux codes identiques', () => {
    let call = 0;
    const repeat = (size: number) => new Uint8Array(size).fill(call++ < 3 ? 0 : call);
    const codes = generateBackupCodes(2, repeat);
    expect(new Set(codes).size).toBe(2);
  });

  it('normalisation : minuscules, tirets et espaces ignorés', () => {
    expect(normalizeBackupCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeBackupCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(isBackupCodeFormat('abcd efgh')).toBe(true);
  });

  it('format refusé : longueur, signes hors alphabet (0, O, 1, I), non-chaîne, démesuré', () => {
    for (const value of ['ABCD-EFG', 'ABCD-EFGHJ', 'ABCD-EFG0', 'ABCD-EFGO', 'ABCD-EFG1', 'ABCD-EFGI', 'ABCD_EFGH', '', null, 12345678, `${'-'.repeat(40)}ABCDEFGH`]) {
      expect(isBackupCodeFormat(value)).toBe(false);
    }
  });

  it('empreinte : dépend du secret, identique pour toutes les écritures d’un même code, jamais le code en clair', () => {
    const hash = hashBackupCode('ABCD-EFGH', SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBackupCode('abcd efgh', SECRET)).toBe(hash);
    expect(hashBackupCode('ABCD-EFGH', 't'.repeat(32))).not.toBe(hash);
    expect(hash).not.toContain('ABCD');
  });

  it('secret de moins de 32 caractères ou absent : aucun secret (pas de repli)', () => {
    expect(backupSecret({ MFA_BACKUP_SECRET: 'x'.repeat(31) })).toBeNull();
    expect(backupSecret({ CRON_SECRET: 'x'.repeat(64) })).toBeNull();
    expect(backupSecret(env)).toBe(SECRET);
  });
});

describe('issueBackupCodes : nouvelle série', () => {
  it('écrit 10 empreintes, efface les anciennes du membre, ne touche pas celles des autres', async () => {
    const fake = setup({ [ALICE]: ['ABCD-EFGH'], [BOB]: ['JKLM-NPQR'] });
    const result = await issueBackupCodes(fake.client, ALICE, env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const alice = fake.tables.mfa_backup_codes.filter((row) => row.user_id === ALICE);
    expect(alice.map((row) => row.code_hash)).toEqual(result.codes.map((code) => hashBackupCode(code, SECRET)));
    expect(alice.some((row) => row.code_hash === hashBackupCode('ABCD-EFGH', SECRET))).toBe(false);
    expect(fake.tables.mfa_backup_codes.filter((row) => row.user_id === BOB)).toHaveLength(1);
    expect(JSON.stringify(fake.rpcCalls)).not.toContain(result.codes[0]);
  });

  it('secret court : rien n’est généré ni écrit', async () => {
    const fake = setup();
    expect(await issueBackupCodes(fake.client, ALICE, { MFA_BACKUP_SECRET: 'court' })).toEqual({ ok: false, reason: 'secret_missing' });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('base en erreur : aucun code rendu (on ne montre pas des codes non enregistrés)', async () => {
    const fake = createFakeSupabase({}, { rpc: { [REPLACE_BACKUP_CODES_RPC]: () => ({ data: null, error: { message: 'x' } }) } });
    expect(await issueBackupCodes(fake.client, ALICE, env)).toEqual({ ok: false, reason: 'db_error' });
  });
});

describe('redeemBackupCode : usage unique et session de récupération', () => {
  it('code juste : facteurs retirés, appareils révoqués, récupération d’une heure pour CETTE session', async () => {
    const fake = setup();
    const result = await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'abcd efgh', env, now: NOW });
    expect(result).toEqual({ ok: true, recoveryExpiresAt: new Date(NOW.getTime() + RECOVERY_MINUTES * 60_000).toISOString() });
    expect((await fake.client.auth.admin.mfa.listFactors({ userId: ALICE })).data?.factors).toEqual([]);
    expect((await fake.client.auth.admin.mfa.listFactors({ userId: BOB })).data?.factors).toHaveLength(1);
    expect(fake.tables.mfa_trusted_devices.find((row) => row.user_id === ALICE)?.revoked_at).toBe(NOW.toISOString());
    expect(fake.tables.mfa_trusted_devices.find((row) => row.user_id === BOB)?.revoked_at).toBeNull();
    expect(fake.tables.mfa_trusted_sessions).toEqual([
      { user_id: ALICE, session_id: SESSION, device_id: null, reason: 'backup_code', expires_at: '2026-06-01T13:00:00.000Z' },
    ]);
  });

  it('second usage du même code : refusé, aucune nouvelle récupération', async () => {
    const fake = setup();
    expect((await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env, now: NOW })).ok).toBe(true);
    fake.tables.mfa_trusted_sessions = [];
    const again = await redeemBackupCode(fake.client, { userId: ALICE, sessionId: fakeUuid(101), code: 'ABCD-EFGH', env, now: NOW });
    expect(again).toEqual({ ok: false, reason: 'invalid' });
    expect(fake.tables.mfa_trusted_sessions).toEqual([]);
  });

  it('les autres codes restent valables après un usage', async () => {
    const fake = setup();
    await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env, now: NOW });
    expect(await remainingBackupCodes(fake.client, ALICE)).toBe(1);
    expect((await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'JKLM-NPQR', env, now: NOW })).ok).toBe(true);
    expect(await remainingBackupCodes(fake.client, ALICE)).toBe(0);
  });

  it('code d’un autre membre : refusé, rien ne bouge chez l’un ni chez l’autre', async () => {
    const fake = setup({ [ALICE]: ['ABCD-EFGH'], [BOB]: ['JKLM-NPQR'] });
    expect(await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'JKLM-NPQR', env, now: NOW })).toEqual({ ok: false, reason: 'invalid' });
    expect(fake.tables.mfa_backup_codes.every((row) => row.used_at === null)).toBe(true);
    expect(fake.authCalls.filter((call) => call.method === 'admin.mfa.deleteFactor')).toEqual([]);
  });

  it('format faux : refusé SANS interroger la base ; même réponse qu’un code inconnu (aucun indice)', async () => {
    const fake = setup();
    expect(await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: '123456', env })).toEqual({ ok: false, reason: 'invalid' });
    expect(fake.rpcCalls).toEqual([]);
    expect(await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ZZZZ-ZZZZ', env })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('la consommation passe par la fonction SQL atomique, jamais par une lecture puis une écriture en TypeScript', async () => {
    const fake = setup();
    await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env, now: NOW });
    expect(fake.rpcCalls.map((call) => call.name)).toEqual([CONSUME_BACKUP_CODE_RPC]);
    expect(fake.rpcCalls[0].args).toEqual({ p_user: ALICE, p_hash: hashBackupCode('ABCD-EFGH', SECRET) });
    expect([...fake.queries, ...fake.writes].some((query) => query.table === 'mfa_backup_codes')).toBe(false);
  });

  it('sans secret, sans session ou base en erreur : refus, rien n’est retiré', async () => {
    const fake = setup();
    expect(await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env: {} })).toEqual({ ok: false, reason: 'secret_missing' });
    expect(await redeemBackupCode(fake.client, { userId: ALICE, sessionId: null, code: 'ABCD-EFGH', env })).toEqual({ ok: false, reason: 'no_session' });
    const broken = createFakeSupabase({}, { rpc: { [CONSUME_BACKUP_CODE_RPC]: () => ({ data: null, error: { message: 'x' } }) } });
    expect(await redeemBackupCode(broken.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env })).toEqual({ ok: false, reason: 'db_error' });
    expect(fake.tables.mfa_backup_codes.every((row) => row.used_at === null)).toBe(true);
  });

  it('retrait d’un facteur en échec : « incomplete », AUCUNE récupération ouverte', async () => {
    const fake = setup();
    // Facteur déjà retiré entre la liste et le retrait : deleteFactor répond une erreur.
    const original = fake.client.auth.admin.mfa.deleteFactor;
    fake.client.auth.admin.mfa.deleteFactor = (async () => ({ data: null, error: { message: 'x' } })) as never;
    const result = await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env, now: NOW });
    fake.client.auth.admin.mfa.deleteFactor = original;
    expect(result).toEqual({ ok: false, reason: 'incomplete' });
    expect(fake.tables.mfa_trusted_sessions).toEqual([]);
  });

  it('écriture de la récupération en échec : « incomplete »', async () => {
    const fake = setup(undefined, { failTables: ['mfa_trusted_sessions'] });
    const result = await redeemBackupCode(fake.client, { userId: ALICE, sessionId: SESSION, code: 'ABCD-EFGH', env, now: NOW });
    expect(result).toEqual({ ok: false, reason: 'incomplete' });
  });
});

describe('fin de récupération et effacement', () => {
  it('endRecovery ne retire que la ligne « backup_code » de cette session', async () => {
    const fake = setup();
    fake.tables.mfa_trusted_sessions.push(
      { user_id: ALICE, session_id: SESSION, device_id: null, reason: 'backup_code', expires_at: 'x' },
      { user_id: ALICE, session_id: SESSION, device_id: fakeUuid(50), reason: 'device', expires_at: 'x' },
      { user_id: ALICE, session_id: fakeUuid(101), device_id: null, reason: 'backup_code', expires_at: 'x' },
    );
    expect(await endRecovery(fake.client, ALICE, SESSION)).toBe(true);
    expect(fake.tables.mfa_trusted_sessions.map((row) => `${row.session_id}:${row.reason}`)).toEqual([`${SESSION}:device`, `${fakeUuid(101)}:backup_code`]);
  });

  it('clearBackupCodes efface les empreintes du seul membre visé', async () => {
    const fake = setup({ [ALICE]: ['ABCD-EFGH'], [BOB]: ['JKLM-NPQR'] });
    expect(await clearBackupCodes(fake.client, ALICE)).toBe(true);
    expect(fake.tables.mfa_backup_codes.map((row) => row.user_id)).toEqual([BOB]);
  });
});

describe('enrollmentAllowed : qui peut inscrire un nouveau facteur', () => {
  it.each([
    // [inscrit, aal, codes en base, récupération] → permis
    [false, 'aal1', false, false, true], // première inscription : le mot de passe suffit
    [false, 'aal1', true, false, false], // inscrit autrefois, sans code de secours : refusé (le mot de passe seul ne remplace pas le facteur)
    [false, 'aal1', true, true, true], // récupération ouverte par un code : permis
    [true, 'aal1', true, true, false], // un facteur vérifié existe encore : jamais en aal1
    [true, 'aal1', false, false, false],
    [true, 'aal2', true, false, true], // second facteur après avoir donné le code
    [false, null, true, false, false],
  ] as const)('inscrit=%s aal=%s codes=%s récupération=%s → %s', (enrolled, aal, hasBackupCodes, recovery, expected) => {
    expect(enrollmentAllowed({ enrolled, aal, hasBackupCodes, recovery })).toBe(expected);
  });
});
