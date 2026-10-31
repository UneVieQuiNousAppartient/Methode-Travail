// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/archivage/archivage.test.ts, commit 508f19a (2026-10-30) ; généralisé : tests des rendez-vous retirés (règle hors du kit), provenances en paramètre ; écrit pour le kit : l'exemple de liste contre le faux Supabase.
import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/test-support/fake-supabase';
import {
  ARCHIVED_MODES,
  activiteArchivage,
  applyArchived,
  doitDesarchiver,
  parseArchivedMode,
  sansArchives,
} from './archivage';
import { compterParEtape, listerLeadsActifs } from './exemple-liste';

type Call = [method: string, ...args: unknown[]];

/** Faux constructeur de requête : enregistre chaque appel chaîné. */
function recorder() {
  const calls: Call[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get: (_target, method: string) => (...args: unknown[]) => {
        calls.push([method, ...args]);
        return proxy;
      },
    },
  );
  return { query: proxy, calls };
}

describe('parseArchivedMode', () => {
  it('reconnaît les trois modes', () => {
    expect(ARCHIVED_MODES).toEqual(['exclude', 'only', 'all']);
    for (const mode of ARCHIVED_MODES) expect(parseArchivedMode(mode)).toBe(mode);
  });
  it('toute autre valeur vaut « exclude »', () => {
    for (const value of [undefined, null, '', 'ALL', 'tout', 1, true, ['all']]) {
      expect(parseArchivedMode(value)).toBe('exclude');
    }
  });
});

describe('applyArchived', () => {
  it('exclude (défaut) → .is(archived_at, null)', () => {
    const { query, calls } = recorder();
    applyArchived(query);
    expect(calls).toEqual([['is', 'archived_at', null]]);
  });
  it('only → .not(archived_at, is, null)', () => {
    const { query, calls } = recorder();
    applyArchived(query, 'only');
    expect(calls).toEqual([['not', 'archived_at', 'is', null]]);
  });
  it('all → aucun filtre', () => {
    const { query, calls } = recorder();
    expect(applyArchived(query, 'all')).toBe(query);
    expect(calls).toEqual([]);
  });
  it('valeur inconnue → exclude (jamais les archivés par accident)', () => {
    const { query, calls } = recorder();
    applyArchived(query, 'n’importe quoi');
    expect(calls).toEqual([['is', 'archived_at', null]]);
  });
});

describe('sansArchives', () => {
  it('retire les lignes archivées et garde les autres, dans l’ordre', () => {
    const rows = [
      { id: 'a', archived_at: null },
      { id: 'b', archived_at: '2026-01-15T10:00:00Z' },
      { id: 'c' },
    ];
    expect(sansArchives(rows).map((r) => r.id)).toEqual(['a', 'c']);
    expect(sansArchives()).toEqual([]);
  });
});

describe('doitDesarchiver et activité d’historique', () => {
  const archive = { archived_at: '2026-01-15T10:00:00Z' };
  it('seul un lead archivé est désarchivé', () => {
    expect(doitDesarchiver(archive)).toBe(true);
    expect(doitDesarchiver({ archived_at: null })).toBe(false);
    expect(doitDesarchiver(null)).toBe(false);
  });
  it('une référence ou un import ne désarchivent pas ; un formulaire public oui', () => {
    expect(doitDesarchiver(archive, 'referral')).toBe(false);
    expect(doitDesarchiver(archive, 'import')).toBe(false);
    for (const source of ['contact', 'appointment', 'estimator', 'blog', 'other']) {
      expect(doitDesarchiver(archive, source)).toBe(true);
    }
  });
  it('liste des provenances paramétrable', () => {
    expect(doitDesarchiver(archive, 'partenaire', ['partenaire'])).toBe(false);
    expect(doitDesarchiver(archive, 'referral', ['partenaire'])).toBe(true);
  });
  it('métadonnées { action, source } de l’activité système', () => {
    expect(activiteArchivage(true, 'admin')).toEqual({ title: 'Lead archivé', metadata: { action: 'archived', source: 'admin' } });
    expect(activiteArchivage(false, 'formulaire').metadata).toEqual({ action: 'unarchived', source: 'formulaire' });
    expect(activiteArchivage(false, 'formulaire').title).toContain('formulaire');
    expect(activiteArchivage(false, 'admin').title).toBe('Lead désarchivé');
  });
});

describe('exemple de liste (faux Supabase) : les archivés n’apparaissent pas dans le travail courant', () => {
  const leads = () => [
    { id: 'l1', stage: 'nouveau', archived_at: null, created_at: '2026-01-01T10:00:00Z' },
    { id: 'l2', stage: 'nouveau', archived_at: '2026-01-10T10:00:00Z', created_at: '2026-01-02T10:00:00Z' },
    { id: 'l3', stage: 'gagne', archived_at: null, created_at: '2026-01-03T10:00:00Z' },
  ];
  it('listerLeadsActifs : exclude par défaut, only, all', async () => {
    const fake = createFakeSupabase({ leads: leads() });
    expect((await listerLeadsActifs(fake.client)).map((l) => l.id)).toEqual(['l3', 'l1']);
    expect((await listerLeadsActifs(fake.client, 'only')).map((l) => l.id)).toEqual(['l2']);
    expect((await listerLeadsActifs(fake.client, 'all')).map((l) => l.id)).toEqual(['l3', 'l2', 'l1']);
    expect((await listerLeadsActifs(fake.client, 'trafiqué')).map((l) => l.id)).toEqual(['l3', 'l1']);
  });
  it('compterParEtape : l’archivé ne compte pas', async () => {
    const fake = createFakeSupabase({ leads: leads() });
    expect(await compterParEtape(fake.client)).toEqual({ nouveau: 1, gagne: 1 });
  });
});
