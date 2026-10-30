// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source du faux client n'a pas de tests en propre ; ceux-ci figent la sémantique PostgREST sur laquelle les tests des briques s'appuient).
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, fakeUuid, likeToRegExp, splitOrExpression, type Row } from './fake-supabase';

const seed = (): Record<string, Row[]> => ({
  fiches: [
    { id: fakeUuid(1), email: 'a@exemple.test', owner_id: fakeUuid(10), score: 3, archived_at: null },
    { id: fakeUuid(2), email: 'b_c@exemple.test', owner_id: fakeUuid(11), score: 7, archived_at: '2026-01-01T00:00:00Z' },
    { id: fakeUuid(3), email: 'b%c@exemple.test', owner_id: fakeUuid(10), score: 5, archived_at: null },
  ],
  notes: [
    { id: fakeUuid(20), fiche_id: fakeUuid(1), body: 'x' },
    { id: fakeUuid(21), fiche_id: fakeUuid(2), body: 'y' },
  ],
});

describe('filtres réellement appliqués', () => {
  it('eq, in, is, gt, order, limit', async () => {
    const { client } = createFakeSupabase(seed());
    const { data } = await client.from('fiches').select('id').eq('owner_id', fakeUuid(10));
    expect(data).toEqual([{ id: fakeUuid(1) }, { id: fakeUuid(3) }]);
    const inResult = await client.from('fiches').select('id').in('id', [fakeUuid(2), fakeUuid(9)]);
    expect(inResult.data).toEqual([{ id: fakeUuid(2) }]);
    const live = await client.from('fiches').select('id').is('archived_at', null).gt('score', 4);
    expect(live.data).toEqual([{ id: fakeUuid(3) }]);
    const top = await client.from('fiches').select('score').order('score', { ascending: false }).limit(2);
    expect(top.data).toEqual([{ score: 7 }, { score: 5 }]);
  });

  it('eq sur null ne correspond jamais (comme SQL) ; is(null) oui', async () => {
    const { client } = createFakeSupabase(seed());
    expect((await client.from('fiches').select('id').eq('archived_at', null)).data).toEqual([]);
    expect(((await client.from('fiches').select('id').is('archived_at', null)).data as Row[]).length).toBe(2);
  });

  it('ilike : `_` et `%` sont des jokers, `\\_` et `\\%` des caractères littéraux ; insensible à la casse', async () => {
    const { client, ilikes } = createFakeSupabase(seed());
    const joker = await client.from('fiches').select('id').ilike('email', 'b_c@%');
    expect((joker.data as Row[]).map((row) => row.id)).toEqual([fakeUuid(2), fakeUuid(3)]);
    const literal = await client.from('fiches').select('id').ilike('email', 'b\\_c@%');
    expect(literal.data).toEqual([{ id: fakeUuid(2) }]);
    const percent = await client.from('fiches').select('id').ilike('email', 'B\\%C@EXEMPLE.TEST');
    expect(percent.data).toEqual([{ id: fakeUuid(3) }]);
    expect(ilikes).toEqual(['b_c@%', 'b\\_c@%', 'B\\%C@EXEMPLE.TEST']);
    expect(likeToRegExp('a.b').test('axb')).toBe(false);
  });

  it('or : conditions séparées par des virgules, valeurs entre guillemets respectées', async () => {
    const tables = { gens: [{ id: 1, email: 'x,y@exemple.test' }, { id: 2, email: 'x' }, { id: 3, email: 'y@exemple.test' }] };
    const { client } = createFakeSupabase(tables);
    const quoted = await client.from('gens').select('id').or('email.eq."x,y@exemple.test"');
    expect(quoted.data).toEqual([{ id: 1 }]);
    const two = await client.from('gens').select('id').or('email.eq.x,email.eq.y@exemple.test');
    expect(two.data).toEqual([{ id: 2 }, { id: 3 }]);
    expect(splitOrExpression('a.eq."1,2",b.eq.3')).toEqual(['a.eq."1,2"', 'b.eq.3']);
    expect(() => splitOrExpression('a.eq."ouvert')).toThrow();
  });

  it('not : négation de l’opérateur', async () => {
    const { client } = createFakeSupabase(seed());
    const archived = await client.from('fiches').select('id').not('archived_at', 'is', null);
    expect(archived.data).toEqual([{ id: fakeUuid(2) }]);
  });
});

describe('select : colonnes, jointures, head', () => {
  it('une colonne non demandée est absente (undefined)', async () => {
    const { client } = createFakeSupabase(seed());
    const { data } = await client.from('fiches').select('id, email').eq('id', fakeUuid(1)).single();
    expect(data).toEqual({ id: fakeUuid(1), email: 'a@exemple.test' });
    expect((data as Row).owner_id).toBeUndefined();
  });

  it('!inner exclut le parent dont la ligne liée ne correspond pas ; sans !inner, la jointure est vidée', async () => {
    const relations = { notes: { fiches: { table: 'fiches', foreignKey: 'fiche_id' } } };
    const { client } = createFakeSupabase(seed(), { relations });
    const inner = await client.from('notes').select('id, fiches!inner(owner_id)').eq('fiches.owner_id', fakeUuid(10));
    expect(inner.data).toEqual([{ id: fakeUuid(20), fiches: { owner_id: fakeUuid(10) } }]);
    const outer = await client.from('notes').select('id, fiches(owner_id)').eq('fiches.owner_id', fakeUuid(10));
    expect(outer.data).toEqual([
      { id: fakeUuid(20), fiches: { owner_id: fakeUuid(10) } },
      { id: fakeUuid(21), fiches: null },
    ]);
  });

  it('filtre sur une jointure absente du select : erreur (le code testé a oublié la jointure)', async () => {
    const { client } = createFakeSupabase(seed());
    await expect(client.from('notes').select('id').eq('fiches.owner_id', fakeUuid(10))).rejects.toThrow(/jointure/);
  });

  it('head + count : aucune ligne, seulement le nombre', async () => {
    const { client } = createFakeSupabase(seed());
    const result = await client.from('fiches').select('id', { count: 'exact', head: true }).is('archived_at', null);
    expect(result.data).toBeNull();
    expect(result.count).toBe(2);
  });

  it('single : exactement une ligne, sinon erreur PGRST116 ; maybeSingle : 0 → null, 2+ → erreur', async () => {
    const { client } = createFakeSupabase(seed());
    expect((await client.from('fiches').select('id').eq('id', fakeUuid(9)).single()).error?.code).toBe('PGRST116');
    expect((await client.from('fiches').select('id').eq('id', fakeUuid(9)).maybeSingle()).data).toBeNull();
    expect((await client.from('fiches').select('id').maybeSingle()).error?.code).toBe('PGRST116');
  });
});

describe('écritures', () => {
  it('insert + clé unique : un doublon → 23505, rien n’est ajouté', async () => {
    const fake = createFakeSupabase({ membres: [{ email: 'a@exemple.test' }] }, { unique: { membres: ['email'] } });
    const { error } = await fake.client.from('membres').insert({ email: 'a@exemple.test' });
    expect(error?.code).toBe('23505');
    expect(fake.tables.membres).toHaveLength(1);
    expect(fake.writes).toHaveLength(1);
  });

  it('insert().select() renvoie les lignes ajoutées, avec les valeurs par défaut de la table', async () => {
    let n = 0;
    const fake = createFakeSupabase({}, { defaults: { journal: () => ({ id: fakeUuid(++n), created_at: '2026-01-01T00:00:00Z' }) } });
    const { data } = await fake.client.from('journal').insert({ action: 'connexion' }).select('id, action').single();
    expect(data).toEqual({ id: fakeUuid(1), action: 'connexion' });
    expect(fake.tables.journal[0]).toMatchObject({ created_at: '2026-01-01T00:00:00Z' });
  });

  it('update filtré + select : seules les lignes visées changent et sont renvoyées', async () => {
    const fake = createFakeSupabase(seed());
    const { data } = await fake.client.from('fiches').update({ score: 0 }).eq('owner_id', fakeUuid(11)).select('id');
    expect(data).toEqual([{ id: fakeUuid(2) }]);
    expect(fake.tables.fiches.map((row) => row.score)).toEqual([3, 0, 5]);
  });

  it('update qui créerait un doublon sur une clé unique → 23505, rien ne change', async () => {
    const fake = createFakeSupabase(seed(), { unique: { fiches: ['email'] } });
    const { error } = await fake.client.from('fiches').update({ email: 'a@exemple.test' }).eq('id', fakeUuid(2));
    expect(error?.code).toBe('23505');
    expect(fake.tables.fiches[1].email).toBe('b_c@exemple.test');
  });

  it('upsert sur la clé de conflit : met à jour l’existant, ajoute le nouveau', async () => {
    const fake = createFakeSupabase({ reglages: [{ cle: 'a', valeur: 1 }] });
    await fake.client.from('reglages').upsert([{ cle: 'a', valeur: 2 }, { cle: 'b', valeur: 3 }], { onConflict: 'cle' });
    expect(fake.tables.reglages).toEqual([{ cle: 'a', valeur: 2 }, { cle: 'b', valeur: 3 }]);
  });

  it('delete filtré : seules les lignes visées disparaissent', async () => {
    const fake = createFakeSupabase(seed());
    await fake.client.from('fiches').delete().eq('id', fakeUuid(1));
    expect(fake.tables.fiches.map((row) => row.id)).toEqual([fakeUuid(2), fakeUuid(3)]);
  });

  it('table en échec : erreur rendue, jamais d’exception', async () => {
    const { client } = createFakeSupabase(seed(), { failTables: ['fiches'] });
    const result = await client.from('fiches').select('id');
    expect(result.error?.message).toMatch(/échec simulé/);
    expect((await client.from('fiches').insert({ id: 1 })).error).not.toBeNull();
  });
});

describe('rpc', () => {
  it('fonction déclarée : appelée avec ses arguments, journalisée', async () => {
    const fake = createFakeSupabase({}, { rpc: { double: (args) => ({ data: Number(args.n) * 2, error: null }) } });
    expect(await fake.client.rpc('double', { n: 4 })).toEqual({ data: 8, error: null });
    expect(fake.rpcCalls).toEqual([{ name: 'double', args: { n: 4 } }]);
  });

  it('fonction inconnue : erreur (jamais un faux succès)', async () => {
    const { client } = createFakeSupabase();
    const result = await client.rpc('inconnue');
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/non simulée/);
  });

  it('le gestionnaire reçoit le faux client (pour rejouer des écritures)', async () => {
    const fake = createFakeSupabase({ t: [{ id: 1, n: 0 }] }, {
      rpc: { incr: async (_args, self) => self.client.from('t').update({ n: 1 }).eq('id', 1) as never },
    });
    await fake.client.rpc('incr');
    expect(fake.tables.t[0].n).toBe(1);
  });
});

describe('faux Supabase Auth', () => {
  const auth = {
    users: [{ id: fakeUuid(1), email: 'a@exemple.test', factors: [{ id: 'f1', status: 'verified' as const }] }],
    sessions: [{ token: 'jeton-valide', userId: fakeUuid(1) }],
  };

  it('getUser : jeton connu → l’utilisateur ; inconnu, vide ou absent → erreur', async () => {
    const { client, authCalls } = createFakeSupabase({}, { auth });
    expect((await client.auth.getUser('jeton-valide')).data.user?.email).toBe('a@exemple.test');
    for (const token of ['falsifie', '', undefined]) {
      const result = await client.auth.getUser(token);
      expect(result.data.user).toBeNull();
      expect(result.error).not.toBeNull();
    }
    expect(JSON.stringify(authCalls)).not.toContain('jeton-valide');
  });

  it('admin.mfa : liste et retrait d’un facteur ; l’utilisateur rendu est une copie', async () => {
    const { client } = createFakeSupabase({}, { auth });
    const listed = await client.auth.admin.mfa.listFactors({ userId: fakeUuid(1) });
    expect(listed.data?.factors).toHaveLength(1);
    expect((await client.auth.admin.mfa.deleteFactor({ id: 'f1', userId: fakeUuid(1) })).error).toBeNull();
    expect((await client.auth.getUser('jeton-valide')).data.user?.factors).toEqual([]);
    expect((await client.auth.admin.mfa.deleteFactor({ id: 'f1', userId: fakeUuid(1) })).error).not.toBeNull();
  });
});
