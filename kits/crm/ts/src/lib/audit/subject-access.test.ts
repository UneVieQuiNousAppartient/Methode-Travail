// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/audit/subject-access.test.ts, commit 508f19a (2026-10-30) ; généralisé : acteur = membre (identifiant + rôle), faux client du kit ; retirés : mode jeton et repli sur l'ancienne table (supprimés du module) ; ajoutés : chemin avec ?q=courriel, échec d'écriture qui ne lève pas, une ligne par ouverture de fiche, purge à durée obligatoire.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test-support/fake-supabase';
import * as subjectAccess from './subject-access';
import { ACCESS_LOG_TABLE, type AccessActor, buildSubjectAccessRow, purgeSubjectAccessLog, recordSubjectAccess, sanitizeLoggedPath } from './subject-access';

const ADMIN: AccessActor = { userId: '11111111-1111-4111-8111-111111111111', role: 'admin' };
const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => vi.restoreAllMocks());
const quietWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('buildSubjectAccessRow — ouverture de fiche', () => {
  it('écrit l’acteur, le type, l’identifiant de la fiche et l’action — rien d’autre', () => {
    expect(buildSubjectAccessRow(ADMIN, { action: 'view', subjectType: 'lead', subjectId: LEAD, path: `/api/admin/leads/${LEAD}` })).toEqual({
      actor_user_id: ADMIN.userId,
      actor_role: 'admin',
      path: '/api/admin/leads/[id]',
      subject_type: 'lead',
      subject_id: LEAD,
      action: 'view',
      row_count: null,
    });
  });

  it('identifiant de fiche non uuid → rien (jamais un nom ou un courriel à la place)', () => {
    expect(buildSubjectAccessRow(ADMIN, { action: 'view', subjectType: 'client', subjectId: 'jean.tremblay@exemple.test', path: '/x' })).toBeNull();
  });

  it('acteur sans identifiant uuid ou type de fiche inconnu → rien', () => {
    expect(buildSubjectAccessRow({ userId: 'jeton-admin', role: 'admin' }, { action: 'view', subjectType: 'lead', subjectId: LEAD, path: '/x' })).toBeNull();
    // @ts-expect-error — type de fiche hors de SUBJECT_TYPES
    expect(buildSubjectAccessRow(ADMIN, { action: 'view', subjectType: 'facture', subjectId: LEAD, path: '/x' })).toBeNull();
  });

  it('aucun mode jeton ni repli sur une ancienne table dans le module', () => {
    expect('TOKEN_ACTOR_LABEL' in subjectAccess).toBe(false);
    expect('toLegacyAccessRow' in subjectAccess).toBe(false);
  });
});

describe('une ligne par ouverture de fiche, pas par liste', () => {
  it('ouverture : exactement une ligne, avec l’identifiant', async () => {
    const fake = createFakeSupabase({ [ACCESS_LOG_TABLE]: [] });
    expect(await recordSubjectAccess(fake.client, ADMIN, { action: 'view', subjectType: 'lead', subjectId: LEAD, path: `/leads/${LEAD}` })).toBe(true);
    expect(fake.tables[ACCESS_LOG_TABLE]).toHaveLength(1);
    expect(fake.tables[ACCESS_LOG_TABLE][0]).toMatchObject({ action: 'view', subject_id: LEAD });
  });

  it('liste ou recherche de 3 fiches : UNE ligne avec le nombre, aucun identifiant', async () => {
    const fake = createFakeSupabase({ [ACCESS_LOG_TABLE]: [] });
    await recordSubjectAccess(fake.client, ADMIN, { action: 'search', subjectType: 'lead', rowCount: 3, path: '/api/admin/leads' });
    expect(fake.tables[ACCESS_LOG_TABLE]).toEqual([expect.objectContaining({ action: 'search', subject_id: null, row_count: 3 })]);
  });

  it('une ouverture ne prend jamais une liste d’identifiants', () => {
    quietWarn();
    // @ts-expect-error — subjectId est une chaîne, pas un tableau
    expect(buildSubjectAccessRow(ADMIN, { action: 'view', subjectType: 'lead', subjectId: [LEAD, LEAD], path: '/x' })).toBeNull();
  });
});

describe('buildSubjectAccessRow — export et recherche', () => {
  it('le nombre de lignes seulement, pas de sujet unique', () => {
    expect(buildSubjectAccessRow(ADMIN, { action: 'export', subjectType: 'lead', rowCount: 42, path: '/api/admin/export' })).toMatchObject({
      action: 'export',
      subject_type: 'lead',
      subject_id: null,
      row_count: 42,
    });
  });

  it('compte négatif ou non entier → rien', () => {
    expect(buildSubjectAccessRow(ADMIN, { action: 'export', subjectType: 'lead', rowCount: -1, path: '/x' })).toBeNull();
    expect(buildSubjectAccessRow(ADMIN, { action: 'search', subjectType: 'lead', rowCount: 1.5, path: '/x' })).toBeNull();
  });
});

describe('sanitizeLoggedPath — aucune donnée personnelle par le chemin', () => {
  it('retire les paramètres d’URL (filtres) et remplace les uuid', () => {
    expect(sanitizeLoggedPath('/api/admin/export?assigned_to=Jean%20Tremblay&type=leads')).toBe('/api/admin/export');
    expect(sanitizeLoggedPath(`/dashboard/crm/${LEAD}`)).toBe('/dashboard/crm/[id]');
    expect(sanitizeLoggedPath('/fiche#notes')).toBe('/fiche');
  });

  it('chemin avec ?q=a@b.test → journalisé sans la requête', async () => {
    const fake = createFakeSupabase({ [ACCESS_LOG_TABLE]: [] });
    await recordSubjectAccess(fake.client, ADMIN, { action: 'search', subjectType: 'lead', rowCount: 1, path: '/api/admin/leads?q=a@b.test' });
    expect(fake.tables[ACCESS_LOG_TABLE][0].path).toBe('/api/admin/leads');
    expect(JSON.stringify(fake.tables)).not.toContain('a@b.test');
  });

  it('masque un chemin qui contient autre chose que des caractères de chemin', () => {
    expect(sanitizeLoggedPath('/fiche/jean@exemple.test')).toBe('(chemin masqué)');
    expect(sanitizeLoggedPath('/fiche/Jean Tremblay')).toBe('(chemin masqué)');
    expect(sanitizeLoggedPath('relatif')).toBe('(chemin masqué)');
  });
});

describe('recordSubjectAccess — jamais bloquant', () => {
  const input = { action: 'view' as const, subjectType: 'lead' as const, subjectId: LEAD, path: '/api/admin/leads/[id]' };

  it('écriture du journal en échec → false, sans lever ; l’échec est journalisé sans donnée personnelle', async () => {
    const warn = quietWarn();
    const fake = createFakeSupabase({}, { failTables: [ACCESS_LOG_TABLE] });
    await expect(recordSubjectAccess(fake.client, ADMIN, input)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(LEAD);
  });

  it('exception (réseau) → false, sans lever', async () => {
    quietWarn();
    const throwing = { from: () => ({ insert: async () => { throw new Error('fetch failed'); } }) } as never;
    await expect(recordSubjectAccess(throwing, ADMIN, input)).resolves.toBe(false);
  });

  it('base absente → false, sans lever', async () => {
    quietWarn();
    await expect(recordSubjectAccess(null, ADMIN, input)).resolves.toBe(false);
  });
});

describe('purgeSubjectAccessLog — durée de conservation en paramètre obligatoire', () => {
  it('efface les lignes plus vieilles que la durée, garde les autres', async () => {
    const fake = createFakeSupabase({
      [ACCESS_LOG_TABLE]: [
        { id: 1, created_at: '2023-01-01T00:00:00Z' },
        { id: 2, created_at: '2026-10-01T00:00:00Z' },
      ],
    });
    expect(await purgeSubjectAccessLog(fake.client, 12, new Date('2026-10-30T00:00:00Z'))).toBe(1);
    expect(fake.tables[ACCESS_LOG_TABLE].map((r) => r.id)).toEqual([2]);
  });

  it('durée absente ou invalide → erreur claire', async () => {
    const fake = createFakeSupabase({ [ACCESS_LOG_TABLE]: [] });
    for (const months of [0, -1, 1.5, Number.NaN, 999]) await expect(purgeSubjectAccessLog(fake.client, months)).rejects.toThrow(/durée de conservation/);
  });
});
