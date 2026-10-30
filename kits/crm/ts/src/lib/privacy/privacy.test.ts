// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/privacy.test.mjs, commit 1a02685 (2026-10-30) ; généralisé : faux client du kit, sources déclarées (ERASABLE_SOURCES), motif ILIKE échappé dans .or() ; non repris : lecture du texte de la route (pas de route dans le kit) ; ajoutés : injection par « " », « , », « ) » vérifiée sur le faux client, jokers « % » et « _ », sources mal déclarées.
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-support/fake-supabase';
import {
  addressOf,
  assertSources,
  collectPersonData,
  emailOrFilter,
  isValidPersonEmail,
  mergeById,
  normalizePersonEmail,
  personIds,
  postgrestQuote,
  rowsByEmail,
  teamAddresses,
} from './privacy';

const BS = '\\';
const COLS = ['from_email', 'to_email'] as const;

const mails = (): Row[] => [
  { id: 'm1', lead_id: 'lead-1', from_email: 'equipe@exemple.test', to_email: 'marie@exemple.test' },
  { id: 'm2', lead_id: null, from_email: 'marie@exemple.test', to_email: 'bonjour@exemple.test' },
  { id: 'm3', lead_id: 'lead-1', from_email: 'marie@exemple.test', to_email: 'bonjour@exemple.test' },
  { id: 'm4', lead_id: null, from_email: 'bonjour@exemple.test', to_email: 'Marie@Exemple.test' },
  { id: 'm5', lead_id: 'lead-2', from_email: 'paul@exemple.test', to_email: 'bonjour@exemple.test' },
  { id: 'm6', lead_id: null, from_email: 'marie_b@exemple.test', to_email: 'bonjour@exemple.test' },
  { id: 'm7', lead_id: null, from_email: 'mariexb@exemple.test', to_email: 'bonjour@exemple.test' },
];

describe('adresse', () => {
  it('minuscules, espaces retirés ; invalide refusée', () => {
    expect(normalizePersonEmail('  Marie@Exemple.TEST ')).toBe('marie@exemple.test');
    expect(isValidPersonEmail('marie@exemple.test')).toBe(true);
    for (const bad of ['', 'marie', 'marie@', 'marie@exemple', 'ma rie@exemple.test', 'a@b@exemple.test', 'marie@exemple.test\u0000', `${'a'.repeat(250)}@exemple.test`]) {
      expect(isValidPersonEmail(bad)).toBe(false);
      expect(emailOrFilter(COLS, bad)).toBeNull();
    }
  });
});

describe('filtre .or()', () => {
  it('expéditeur OU destinataire, motif échappé entre guillemets', () => {
    expect(emailOrFilter(COLS, 'Marie@Exemple.test')).toBe('from_email.ilike."marie@exemple.test",to_email.ilike."marie@exemple.test"');
    expect(emailOrFilter(COLS, 'a_b%c@exemple.test')).toBe(`from_email.ilike."a${BS}${BS}_b${BS}${BS}%c@exemple.test",to_email.ilike."a${BS}${BS}_b${BS}${BS}%c@exemple.test"`);
  });

  it('échappement : guillemet et barre oblique inverse précédés de « \\ »', () => {
    expect(postgrestQuote('a"b')).toBe(`"a${BS}"b"`);
    expect(postgrestQuote(`a${BS}b`)).toBe(`"a${BS}${BS}b"`);
    expect(postgrestQuote('a,b(c)')).toBe('"a,b(c)"');
  });

  it('nom de colonne non sûr → erreur (jamais concaténé)', () => {
    expect(() => emailOrFilter(['from_email,id.neq.0'], 'marie@exemple.test')).toThrow(/invalide/);
  });
});

describe('injection : une adresse avec « " », « , » ou « ) » ne vise qu’elle-même', () => {
  // « id.neq » (sans « _ ») : sinon l'échappement du motif casserait par hasard le nom de colonne injecté.
  const sneaky = ['x,to_email.eq.bonjour@exemple.test', 'x"),to_email.eq.bonjour@exemple.test', 'x",id.neq."0@exemple.test', 'x),id.neq.(0@exemple.test'];

  it('la requête .or() elle-même ne renvoie AUCUNE autre ligne (vérifié sur le faux client)', async () => {
    for (const email of sneaky) {
      expect(isValidPersonEmail(email)).toBe(true);
      const fake = createFakeSupabase({ email_messages: mails() });
      const { data, error } = await fake.client.from('email_messages').select('id').or(emailOrFilter(COLS, email) as string);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await rowsByEmail(fake.client, 'email_messages', COLS, email)).toEqual([]);
    }
  });

  it('l’adresse exotique elle-même est bien retrouvée (guillemet et barre oblique compris)', async () => {
    const odd = `o"d${BS}d@exemple.test`;
    const fake = createFakeSupabase({ email_messages: [...mails(), { id: 'm8', lead_id: null, from_email: odd, to_email: 'bonjour@exemple.test' }] });
    expect((await rowsByEmail(fake.client, 'email_messages', COLS, odd)).map((m) => m.id)).toEqual(['m8']);
  });
});

describe('lecture par adresse', () => {
  it('égalité exacte sans tenir compte de la casse ; « _ » n’est pas un joker', async () => {
    const fake = createFakeSupabase({ email_messages: mails() });
    expect((await rowsByEmail(fake.client, 'email_messages', COLS, 'marie@exemple.test')).map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect((await rowsByEmail(fake.client, 'email_messages', COLS, 'marie_b@exemple.test')).map((m) => m.id)).toEqual(['m6']);
  });

  it('fiches : motif ILIKE échappé (vérifié avec fake.ilikes), « % » et « _ » ne visent personne d’autre', async () => {
    const fake = createFakeSupabase({
      leads: [
        { id: 'l1', email: 'a_b@exemple.test' },
        { id: 'l2', email: 'axb@exemple.test' },
        { id: 'l3', email: 'a%c@exemple.test' },
        { id: 'l4', email: 'aZZZc@exemple.test' },
        { id: 'l5', email: 'A_B@Exemple.test' },
      ],
    });
    expect(await personIds(fake.client, 'a_b@exemple.test')).toEqual(['l1', 'l5']);
    expect(await personIds(fake.client, 'a%c@exemple.test')).toEqual(['l3']);
    expect(fake.ilikes).toEqual(['a\\_b@exemple.test', 'a\\%c@exemple.test']);
    expect(fake.ilikes.every((motif) => !/(^|[^\\])[%_]/.test(motif))).toBe(true);
  });

  it('erreur de lecture → lève (pas d’export incomplet) ; adresse invalide → lève', async () => {
    await expect(rowsByEmail(createFakeSupabase({}, { failTables: ['email_messages'] }).client, 'email_messages', COLS, 'marie@exemple.test')).rejects.toThrow('email_messages');
    await expect(rowsByEmail(createFakeSupabase({}).client, 'email_messages', COLS, 'pas-une-adresse')).rejects.toThrow(/adresse invalide/);
  });
});

describe('collectPersonData', () => {
  const tables = () => ({
    leads: [
      { id: 'lead-1', email: 'marie@exemple.test' },
      { id: 'lead-2', email: 'paul@exemple.test' },
    ],
    lead_activities: [
      { id: 'a1', lead_id: 'lead-1' },
      { id: 'a2', lead_id: 'lead-2' },
    ],
    lead_tasks: [],
    email_messages: mails(),
    bookings: [{ id: 'b1', email: 'marie@exemple.test' }],
  });

  it('fiches + lignes rattachées + lignes par adresse, sans doublon', async () => {
    const fake = createFakeSupabase(tables());
    const data = await collectPersonData(fake.client, 'Marie@exemple.test');
    expect(data.scope).toBe('full');
    expect(data.person.map((r) => r.id)).toEqual(['lead-1']);
    expect(data.tables.lead_activities.map((r) => r.id)).toEqual(['a1']);
    expect(data.tables.email_messages.map((r) => r.id).sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(data.tables.bookings.map((r) => r.id)).toEqual(['b1']);
  });

  it('courriel sans fiche : les lignes par adresse sont lues quand même', async () => {
    const fake = createFakeSupabase({ ...tables(), leads: [] });
    const data = await collectPersonData(fake.client, 'marie@exemple.test');
    expect(data.person).toEqual([]);
    expect(data.tables.email_messages.map((r) => r.id).sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(data.tables.lead_activities).toBeUndefined();
  });

  it('adresse de l’équipe (byAddress: false) : seulement ce qui est rattaché à ses fiches', async () => {
    const fake = createFakeSupabase(tables());
    const data = await collectPersonData(fake.client, 'bonjour@exemple.test', { byAddress: false });
    expect(data.scope).toBe('leads_only');
    expect(data.tables.email_messages).toBeUndefined();
  });
});

describe('équipe', () => {
  it('adresse extraite d’un « Nom <adresse> » ou d’une liste', () => {
    expect(addressOf('Équipe <Bonjour@Exemple.test>')).toBe('bonjour@exemple.test');
    expect(addressOf('equipe@exemple.test')).toBe('equipe@exemple.test');
    expect(addressOf('')).toBeNull();
    expect(addressOf(undefined)).toBeNull();
  });

  it('expéditeur, réponses, contact, ajouts du projet et liste blanche réunis', async () => {
    const fake = createFakeSupabase({ team_allowlist: [{ email: 'admin@exemple.test' }] });
    const { set, error } = await teamAddresses(fake.client, {
      env: { EMAIL_FROM: 'Équipe <bonjour@exemple.test>', EMAIL_REPLY_TO: 'reponses@exemple.test', CONTACT_EMAIL: 'contact@exemple.test' },
      extra: ['alertes@exemple.test'],
    });
    expect(error).toBeNull();
    for (const a of ['bonjour@exemple.test', 'reponses@exemple.test', 'contact@exemple.test', 'alertes@exemple.test', 'admin@exemple.test']) expect(set.has(a)).toBe(true);
    expect(set.has('marie@exemple.test')).toBe(false);
  });

  it('liste blanche illisible → erreur signalée', async () => {
    const fake = createFakeSupabase({}, { failTables: ['team_allowlist'] });
    expect((await teamAddresses(fake.client, { env: {} })).error).not.toBeNull();
  });
});

describe('divers', () => {
  it('mergeById : doublons retirés, lignes sans id ignorées', () => {
    expect(mergeById([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, {} as Row]).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sources mal déclarées → erreur de configuration', () => {
    expect(() => assertSources([{ table: 'leads; drop', by: 'email', column: 'email' }])).toThrow(/invalide/);
    expect(() => assertSources([{ table: 'leads', by: 'nom' as 'email', column: 'email' }])).toThrow(/by/);
  });
});
