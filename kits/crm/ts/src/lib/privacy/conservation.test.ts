// Kit CRM TS (methode-travail) — origine : Vie Solution Web, tests/conservation.test.mjs, commit 59e389a (2026-10-30) ; généralisé : node:test → Vitest, durée passée explicitement (plus de défaut) ; ajoutés : RETENTION_MONTHS absent ou invalide, secret d'empreinte et son repli.
import { describe, expect, it } from 'vitest';
import {
  aConserverJusquau,
  aSupprimer,
  derniereActivite,
  empreinteCourriel,
  hashKeyId,
  motifExact,
  privacyHashSecret,
  retentionMonths,
} from './conservation';

describe('conservation', () => {
  it('dernière activité : la plus récente des dates connues', () => {
    expect(derniereActivite({ created_at: '2024-01-10T12:00:00Z', last_contact_at: '2024-06-01T12:00:00Z', status_changed_at: null })?.toISOString()).toBe('2024-06-01T12:00:00.000Z');
    expect(derniereActivite({ created_at: 'n’importe quoi' })).toBeNull();
  });

  it('36 mois sans contact, mois civils (31 août + 36 mois = 31 août)', () => {
    const l = { created_at: '2024-08-31T12:00:00Z' };
    expect(aConserverJusquau(l, 36)?.toISOString()).toBe('2027-08-31T12:00:00.000Z');
    expect(aSupprimer(l, new Date('2027-08-31T11:59:00Z'), 36)).toBe(false);
    expect(aSupprimer(l, new Date('2027-08-31T12:00:00Z'), 36)).toBe(true);
    expect(aSupprimer(l, new Date('2026-08-31T12:00:00Z'), 36)).toBe(false);
    expect(aConserverJusquau({ created_at: '2024-02-29T00:00:00Z' }, 12)?.toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });

  it('un contact récent repousse la suppression ; une fiche sans date lisible n’est jamais proposée', () => {
    expect(aSupprimer({ created_at: '2022-01-01T00:00:00Z', last_contact_at: '2026-01-01T00:00:00Z' }, new Date('2026-10-24T00:00:00Z'), 36)).toBe(false);
    expect(aSupprimer({ created_at: '2022-01-01T00:00:00Z' }, new Date('2026-10-24T00:00:00Z'), 36)).toBe(true);
    expect(aSupprimer({ created_at: 'x' }, new Date(), 36)).toBe(false);
  });

  it('durée invalide passée aux règles → erreur (jamais un défaut)', () => {
    expect(() => aSupprimer({ created_at: '2022-01-01T00:00:00Z' }, new Date(), 0)).toThrow(/Durée de conservation invalide/);
    expect(() => aConserverJusquau({ created_at: '2022-01-01T00:00:00Z' }, Number.NaN)).toThrow(/RETENTION_MONTHS/);
  });
});

describe('RETENTION_MONTHS obligatoire', () => {
  it('absent → erreur claire, sans durée par défaut', () => {
    expect(() => retentionMonths({})).toThrow(/RETENTION_MONTHS manquant.*Aucune durée par défaut/);
    expect(() => retentionMonths({ RETENTION_MONTHS: '   ' })).toThrow(/RETENTION_MONTHS manquant/);
  });

  it('invalide → erreur claire', () => {
    for (const bad of ['trois ans', '36.5', '-1', '0', '121', '1e2']) expect(() => retentionMonths({ RETENTION_MONTHS: bad })).toThrow(/RETENTION_MONTHS invalide/);
  });

  it('valide → nombre de mois', () => {
    expect(retentionMonths({ RETENTION_MONTHS: '36' })).toBe(36);
    expect(retentionMonths({ RETENTION_MONTHS: ' 12 ' })).toBe(12);
  });
});

describe('empreinte du courriel', () => {
  it('jamais le courriel, insensible à la casse, liée au secret', () => {
    const cle = 'x'.repeat(32);
    const e = empreinteCourriel(' Marie@Exemple.TEST ', cle);
    expect(e).toBe(empreinteCourriel('marie@exemple.test', cle));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toBe(empreinteCourriel('marie@exemple.test', 'y'.repeat(32)));
    expect(e).not.toContain('marie');
    expect(empreinteCourriel('marie@exemple.test', '')).toBe('');
    expect(hashKeyId(cle)).toHaveLength(8);
    expect(hashKeyId('')).toBe('');
  });

  it('secret : PRIVACY_HASH_SECRET ≥ 32, sinon UNSUBSCRIBE_SECRET ≥ 32, sinon rien ; PRIVACY_HASH_SECRET trop court → pas de repli', () => {
    const a = 'a'.repeat(32);
    const b = 'b'.repeat(32);
    expect(privacyHashSecret({ PRIVACY_HASH_SECRET: a, UNSUBSCRIBE_SECRET: b })).toBe(a);
    expect(privacyHashSecret({ UNSUBSCRIBE_SECRET: b })).toBe(b);
    expect(privacyHashSecret({ PRIVACY_HASH_SECRET: 'court', UNSUBSCRIBE_SECRET: b })).toBe('');
    expect(privacyHashSecret({ UNSUBSCRIBE_SECRET: 'court' })).toBe('');
    expect(privacyHashSecret({})).toBe('');
  });
});

describe('motif exact', () => {
  it('les jokers et la barre oblique inverse sont échappés', () => {
    expect(motifExact('A_b%c@x.test')).toBe('a\\_b\\%c@x.test');
    expect(motifExact('a\\b@x.test')).toBe('a\\\\b@x.test');
  });
});
