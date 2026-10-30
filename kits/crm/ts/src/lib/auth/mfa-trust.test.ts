// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/team/mfa-trust.test.ts, commit 508f19a (2026-10-30) ; généralisé : faux client du kit au lieu de la base de test de la source, témoin SameSite=Strict au chemin MFA paramétrable, colonne `reason` ; ajoutés : autre compte, appareil révoqué, échéance à la seconde, purge limitée à l'expiré, ligne « backup_code » jamais de confiance, nom du témoin.
import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeUuid, type Row } from '@/test-support/fake-supabase';
import {
  DEFAULT_TRUST_COOKIE_PATH,
  TRUST_COOKIE,
  clearTrustCookie,
  deviceAccepts,
  deviceLabel,
  forgetTrustedSession,
  hashTrustToken,
  isTrustedSession,
  listTrustedDevices,
  parseTrustCookie,
  purgeTrustedDevices,
  redeemTrustCookie,
  revokeTrustedDevices,
  setTrustCookie,
  trustCookieName,
  trustDevice,
  trustExpiry,
  trustedSessionValid,
} from './mfa-trust';

const NOW = new Date('2026-10-21T12:00:00Z');
const U1 = fakeUuid(101);
const U2 = fakeUuid(102);
const S1 = fakeUuid(201);
const S2 = fakeUuid(202);
const DEVICE_ID = fakeUuid(301);
const token = 'a'.repeat(64);

/** Base en mémoire : identifiants d'appareil générés, clé des sessions (user_id, session_id, reason). */
function createDb(tables: Record<string, Row[]> = {}) {
  let next = 900;
  return createFakeSupabase(tables, {
    unique: { mfa_trusted_sessions: ['user_id', 'session_id', 'reason'], mfa_trusted_devices: ['token_hash'] },
    defaults: {
      mfa_trusted_devices: () => ({ id: fakeUuid((next += 1)), created_at: NOW.toISOString(), revoked_at: null }),
      mfa_trusted_sessions: () => ({ reason: 'device', created_at: NOW.toISOString() }),
    },
  });
}

const deviceRow = async (overrides: Record<string, unknown> = {}) => ({
  id: DEVICE_ID,
  user_id: U1,
  token_hash: await hashTrustToken(token),
  expires_at: '2026-11-20T12:00:00Z',
  revoked_at: null,
  ...overrides,
});

describe('règle pure', () => {
  it('échéance : 30 jours après', () => {
    expect(trustExpiry(NOW).toISOString()).toBe('2026-11-20T12:00:00.000Z');
  });

  it('appareil valide pour son compte → accepté ; autre compte, jeton falsifié, retiré → refusé', async () => {
    const device = await deviceRow();
    expect(await deviceAccepts(device, { userId: U1, token, now: NOW })).toBe(true);
    expect(await deviceAccepts(device, { userId: U2, token, now: NOW })).toBe(false);
    expect(await deviceAccepts(device, { userId: U1, token: 'b'.repeat(64), now: NOW })).toBe(false);
    expect(await deviceAccepts({ ...device, revoked_at: '2026-10-20T00:00:00Z' }, { userId: U1, token, now: NOW })).toBe(false);
  });

  it('échéance atteinte à la seconde près → refusé ; une seconde avant → accepté', async () => {
    const device = await deviceRow();
    expect(await deviceAccepts(device, { userId: U1, token, now: new Date('2026-11-20T12:00:00Z') })).toBe(false);
    expect(await deviceAccepts(device, { userId: U1, token, now: new Date('2026-11-20T11:59:59Z') })).toBe(true);
  });

  it('appareil ou compte absent → refusé', async () => {
    expect(await deviceAccepts(null, { userId: U1, token, now: NOW })).toBe(false);
    expect(await deviceAccepts(await deviceRow(), { userId: null, token, now: NOW })).toBe(false);
  });

  it('témoin lu : <uuid>.<64 hex> ; autre forme → null', () => {
    expect(parseTrustCookie(`${DEVICE_ID}.${token}`)).toEqual({ id: DEVICE_ID, token });
    expect(parseTrustCookie('x.y')).toBeNull();
    expect(parseTrustCookie(`${DEVICE_ID}.${token}.extra`)).toBeNull();
    expect(parseTrustCookie(`${DEVICE_ID}.${'A'.repeat(64)}`)).toBeNull();
    expect(parseTrustCookie('')).toBeNull();
    expect(parseTrustCookie(undefined)).toBeNull();
  });

  it('session de confiance valide ; autre compte, appareil retiré, session échue ou autre appareil → non', async () => {
    const device = await deviceRow();
    const session = { session_id: S1, user_id: U1, device_id: DEVICE_ID, reason: 'device', expires_at: '2026-11-20T12:00:00Z' };
    expect(trustedSessionValid(session, device, { userId: U1, now: NOW })).toBe(true);
    expect(trustedSessionValid(session, device, { userId: U2, now: NOW })).toBe(false);
    expect(trustedSessionValid(session, { ...device, revoked_at: '2026-10-21T00:00:00Z' }, { userId: U1, now: NOW })).toBe(false);
    expect(trustedSessionValid({ ...session, expires_at: '2026-10-21T11:00:00Z' }, device, { userId: U1, now: NOW })).toBe(false);
    expect(trustedSessionValid({ ...session, device_id: 'autre' }, device, { userId: U1, now: NOW })).toBe(false);
  });

  it('ligne « backup_code » : jamais une session de confiance, même avec un appareil valide', async () => {
    const device = await deviceRow();
    const session = { session_id: S1, user_id: U1, device_id: DEVICE_ID, reason: 'backup_code', expires_at: '2026-11-20T12:00:00Z' };
    expect(trustedSessionValid(session, device, { userId: U1, now: NOW })).toBe(false);
  });

  it('nom de l’appareil lisible', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130 Safari/537')).toBe('Chrome · Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18 Mobile Safari/604')).toBe('Safari · iPhone / iPad');
    expect(deviceLabel('')).toBe('Navigateur');
  });
});

describe('témoin', () => {
  it('HttpOnly, Secure, SameSite=Strict, Path = préfixe MFA, 30 jours ; effacement Max-Age=0', () => {
    expect(DEFAULT_TRUST_COOKIE_PATH).toBe('/api/admin/mfa');
    const set = NextResponse.json({});
    setTrustCookie(set, `${DEVICE_ID}.${token}`);
    const header = set.headers.get('set-cookie') ?? '';
    expect(header.startsWith(`${TRUST_COOKIE}=${DEVICE_ID}.${token}`)).toBe(true);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\/api\/admin\/mfa(;|$)/);
    expect(header).toMatch(/Max-Age=2592000/);

    const cleared = NextResponse.json({});
    clearTrustCookie(cleared);
    const clearHeader = cleared.headers.get('set-cookie') ?? '';
    expect(clearHeader.startsWith(`${TRUST_COOKIE}=;`)).toBe(true);
    expect(clearHeader).toMatch(/Max-Age=0/);
    expect(clearHeader).toMatch(/Path=\/api\/admin\/mfa/);
  });

  it('chemin en paramètre (préfixe MFA du projet) ; nom lu dans MFA_TRUST_COOKIE, sinon « mfa_device »', () => {
    const set = NextResponse.json({});
    setTrustCookie(set, `${DEVICE_ID}.${token}`, { path: '/api/equipe/mfa' });
    const header = set.headers.get('set-cookie') ?? '';
    expect(header).toMatch(/Path=\/api\/equipe\/mfa(;|$)/);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(trustCookieName({})).toBe('mfa_device');
    expect(trustCookieName({ MFA_TRUST_COOKIE: ' crm_appareil ' })).toBe('crm_appareil');
    expect(trustCookieName({ MFA_TRUST_COOKIE: 'mauvais nom;' })).toBe('mfa_device');
  });
});

describe('base (service_role simulé)', () => {
  it('le jeton n’est jamais stocké, seulement son empreinte ; le témoin rachète la session de CE compte', async () => {
    const db = createDb();
    const { device, cookieValue } = await trustDevice(db.client, { userId: U1, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', now: NOW });
    const stored = db.tables.mfa_trusted_devices[0];
    const secret = cookieValue.split('.')[1];
    expect(cookieValue.startsWith(`${device.id}.`)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored.token_hash).toBe(await hashTrustToken(secret));
    expect(stored.label).toBe('Chrome · Windows');

    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S1, now: NOW })).toBe(false);
    expect(await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: S1, now: NOW })).not.toBeNull();
    expect(db.tables.mfa_trusted_sessions).toEqual([expect.objectContaining({ user_id: U1, session_id: S1, reason: 'device', device_id: device.id })]);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S1, now: NOW })).toBe(true);
    // Autre session du même compte, sans témoin → non.
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S2, now: NOW })).toBe(false);
    // Même session lue pour un autre compte → non.
    expect(await isTrustedSession(db.client, { userId: U2, sessionId: S1, now: NOW })).toBe(false);
  });

  it('témoin d’un autre compte, falsifié ou mal formé → refusé, rien d’inscrit', async () => {
    const db = createDb();
    const { cookieValue } = await trustDevice(db.client, { userId: U1, userAgent: null, now: NOW });
    expect(await redeemTrustCookie(db.client, { cookieValue, userId: U2, sessionId: S1, now: NOW })).toBeNull();
    const forged = `${cookieValue.split('.')[0]}.${'b'.repeat(64)}`;
    expect(await redeemTrustCookie(db.client, { cookieValue: forged, userId: U1, sessionId: S1, now: NOW })).toBeNull();
    expect(await redeemTrustCookie(db.client, { cookieValue: 'n-importe-quoi', userId: U1, sessionId: S1, now: NOW })).toBeNull();
    expect(await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: null, now: NOW })).toBeNull();
    expect(db.tables.mfa_trusted_sessions ?? []).toHaveLength(0);
  });

  it('appareil échu → témoin refusé ; session déjà inscrite → ne vaut plus après l’échéance', async () => {
    const db = createDb();
    const { cookieValue } = await trustDevice(db.client, { userId: U1, userAgent: null, now: NOW });
    const later = new Date('2026-11-21T00:00:00Z');
    expect(await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: S1, now: later })).toBeNull();
    await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: S2, now: NOW });
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S2, now: NOW })).toBe(true);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S2, now: new Date('2026-11-20T12:00:00Z') })).toBe(false);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S2, now: new Date('2026-11-20T11:59:59Z') })).toBe(true);
  });

  it('oublier un appareil → la session de confiance ne vaut plus, la liste ne le montre plus (jamais l’empreinte)', async () => {
    const db = createDb();
    const first = await trustDevice(db.client, { userId: U1, userAgent: null, now: NOW });
    await trustDevice(db.client, { userId: U1, userAgent: null, now: NOW });
    await trustDevice(db.client, { userId: U2, userAgent: null, now: NOW });
    await redeemTrustCookie(db.client, { cookieValue: first.cookieValue, userId: U1, sessionId: S1, now: NOW });

    const listed = await listTrustedDevices(db.client, { userId: U1, now: NOW });
    expect(listed).toHaveLength(2);
    expect(listed.every((d) => !('token_hash' in d))).toBe(true);

    expect(await revokeTrustedDevices(db.client, { userId: U1, id: first.device.id, now: NOW })).toBe(1);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S1, now: NOW })).toBe(false);
    expect(await redeemTrustCookie(db.client, { cookieValue: first.cookieValue, userId: U1, sessionId: S2, now: NOW })).toBeNull();
    expect(await listTrustedDevices(db.client, { userId: U1, now: NOW })).toHaveLength(1);

    // « Oublier tous » : seulement ceux du compte (l'appareil de U2 reste).
    expect(await revokeTrustedDevices(db.client, { userId: U1, now: NOW })).toBe(1);
    expect(await listTrustedDevices(db.client, { userId: U2, now: NOW })).toHaveLength(1);
    // Un autre compte ne peut pas oublier l'appareil de U2 en donnant son identifiant.
    const otherId = (await listTrustedDevices(db.client, { userId: U2, now: NOW }))[0].id;
    expect(await revokeTrustedDevices(db.client, { userId: U1, id: otherId, now: NOW })).toBe(0);
  });

  it('ligne « backup_code » seule pour la session → jamais de confiance', async () => {
    const db = createDb({
      mfa_trusted_devices: [await deviceRow()],
      mfa_trusted_sessions: [{ session_id: S1, user_id: U1, device_id: DEVICE_ID, reason: 'backup_code', expires_at: '2026-10-21T13:00:00Z' }],
    });
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S1, now: NOW })).toBe(false);
  });

  it('base indisponible ou erreur : jamais « de confiance »', async () => {
    expect(await isTrustedSession(null, { userId: U1, sessionId: S1 })).toBe(false);
    const broken = { from: () => { throw new Error('boom'); } } as never;
    expect(await isTrustedSession(broken, { userId: U1, sessionId: S1 })).toBe(false);
    const failing = createFakeSupabase({}, { failTables: ['mfa_trusted_sessions'] });
    expect(await isTrustedSession(failing.client, { userId: U1, sessionId: S1 })).toBe(false);
  });
});

describe('déconnexion et purge', () => {
  it('déconnexion : les lignes de CETTE session disparaissent, les autres restent ; ne lève jamais', async () => {
    const db = createDb();
    const { cookieValue } = await trustDevice(db.client, { userId: U1, userAgent: null, now: NOW });
    await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: S1, now: NOW });
    await redeemTrustCookie(db.client, { cookieValue, userId: U1, sessionId: S2, now: NOW });
    await forgetTrustedSession(db.client, S1);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S1, now: NOW })).toBe(false);
    expect(await isTrustedSession(db.client, { userId: U1, sessionId: S2, now: NOW })).toBe(true);
    await expect(forgetTrustedSession(null, S1)).resolves.toBeUndefined();
    await expect(forgetTrustedSession({ from: () => { throw new Error('boom'); } } as never, S1)).resolves.toBeUndefined();
  });

  it('purge : seulement l’expiré (sessions et appareils échus, appareils oubliés depuis plus de 30 jours)', async () => {
    const devices = [
      { id: 'd-valide', user_id: U1, expires_at: '2026-11-20T12:00:00.000Z', revoked_at: null },
      { id: 'd-echu', user_id: U1, expires_at: '2026-10-20T12:00:00.000Z', revoked_at: null },
      { id: 'd-echu-pile', user_id: U1, expires_at: '2026-10-21T12:00:00.000Z', revoked_at: null },
      { id: 'd-oublie-recent', user_id: U1, expires_at: '2026-11-20T12:00:00.000Z', revoked_at: '2026-10-15T00:00:00.000Z' },
      { id: 'd-oublie-ancien', user_id: U1, expires_at: '2026-11-20T12:00:00.000Z', revoked_at: '2026-09-01T00:00:00.000Z' },
    ];
    const sessions = [
      { session_id: S1, user_id: U1, device_id: 'd-valide', reason: 'device', expires_at: '2026-11-20T12:00:00.000Z' },
      { session_id: S2, user_id: U1, device_id: 'd-valide', reason: 'device', expires_at: '2026-10-20T12:00:00.000Z' },
      { session_id: S1, user_id: U1, device_id: null, reason: 'backup_code', expires_at: '2026-10-21T12:30:00.000Z' },
      { session_id: S2, user_id: U1, device_id: null, reason: 'backup_code', expires_at: '2026-10-21T11:00:00.000Z' },
    ];
    const db = createDb({ mfa_trusted_devices: devices.map((d) => ({ ...d })), mfa_trusted_sessions: sessions.map((s) => ({ ...s })) });
    expect(await purgeTrustedDevices(db.client, { now: NOW })).toEqual({ sessions: 2, devices: 3 });
    expect(db.tables.mfa_trusted_devices.map((d) => d.id)).toEqual(['d-valide', 'd-oublie-recent']);
    expect(db.tables.mfa_trusted_sessions.map((s) => `${s.session_id}:${s.reason}`)).toEqual([`${S1}:device`, `${S1}:backup_code`]);
    expect(await purgeTrustedDevices(null)).toBeNull();
    // Supabase répond par une erreur (table absente : migration non appliquée) → null, pas un faux 0.
    const failing = createFakeSupabase({}, { failTables: ['mfa_trusted_sessions'] });
    expect(await purgeTrustedDevices(failing.client, { now: NOW })).toBeNull();
    expect(await purgeTrustedDevices({ from: () => { throw new Error('boom'); } } as never)).toBeNull();
  });
});
