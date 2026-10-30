// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/leads/contact-consent.test.ts, commit 508f19a (2026-10-30) ; généralisé : cas de la « règle partagée » repris avec les paramètres du kit ; cas du guide offert, de la pastille et des gabarits de courriel non repris (code propre au projet) ; table de vérité de consentFromForm ajoutée.
import { describe, expect, it } from 'vitest';
import {
  consentFromForm,
  contactConsentValue,
  hasBeenContacted,
  hasFollowUpContactConsent,
  mayContactProactively,
  mayFollowUp,
  mayMakeFirstContact,
  type ConsentRules,
} from './consent';

const SPLIT_AT = '2026-01-15T08:00:00-05:00';
const RULES: ConsentRules = { splitAt: SPLIT_AT, sources: ['diagnostic', 'estimator'] };
const SPLIT = new Date(SPLIT_AT).getTime();
const apres = new Date(SPLIT + 3_600_000).toISOString();
const avant = new Date(SPLIT - 3_600_000).toISOString();

describe('consentFromForm (ajouté pour le kit) : seul true strict vaut accord', () => {
  it.each([
    [true, true],
    [false, false],
    ['on', false],
    ['true', false],
    ['1', false],
    [1, false],
    ['yes', false],
    ['oui', false],
    [null, false],
    [undefined, false],
    [{}, false],
    [[true], false],
  ])('%j → %s', (value, want) => {
    expect(consentFromForm(value)).toBe(want);
  });
  it('formulaire vide (case jamais touchée) → false', () => {
    const form: Record<string, unknown> = {};
    expect(consentFromForm(form.consent)).toBe(false);
    expect(consentFromForm(new FormData().get('consent'))).toBe(false);
  });
});

describe('règle partagée (cas de la source)', () => {
  it('hasFollowUpContactConsent : case cochée, ou lead antérieur ; jamais désabonné', () => {
    expect(hasFollowUpContactConsent({ email_opt_out: false, consent_marketing: false, created_at: apres }, RULES)).toBe(false);
    expect(hasFollowUpContactConsent({ email_opt_out: false, consent_marketing: true, created_at: apres }, RULES)).toBe(true);
    expect(hasFollowUpContactConsent({ email_opt_out: false, consent_marketing: false, created_at: avant }, RULES)).toBe(true);
    expect(hasFollowUpContactConsent({ email_opt_out: true, consent_marketing: true, created_at: avant }, RULES)).toBe(false);
  });

  const jamais = { first_contacted_at: null, last_contacted_at: null };
  const contacte = { first_contacted_at: apres, last_contacted_at: null };

  it('hasBeenContacted : premier OU dernier contact daté', () => {
    expect(hasBeenContacted(jamais)).toBe(false);
    expect(hasBeenContacted({ first_contacted_at: apres, last_contacted_at: null })).toBe(true);
    expect(hasBeenContacted({ first_contacted_at: null, last_contacted_at: apres })).toBe(true);
  });

  it('mayMakeFirstContact : jamais contacté et pas désabonné, même sans la case 2', () => {
    const base = { email_opt_out: false, consent_marketing: false, created_at: apres };
    expect(mayMakeFirstContact({ ...base, ...jamais })).toBe(true);
    expect(mayMakeFirstContact({ ...base, ...contacte })).toBe(false);
    expect(mayMakeFirstContact({ ...base, first_contacted_at: null, last_contacted_at: apres })).toBe(false);
    expect(mayMakeFirstContact({ ...base, email_opt_out: true, ...jamais })).toBe(false);
  });

  it('mayFollowUp : sources de la règle = la case 2 (ou lead antérieur) ; autres sources non filtrées', () => {
    const base = { email_opt_out: false, consent_marketing: false, created_at: apres };
    expect(mayFollowUp({ ...base, source: 'diagnostic' }, RULES)).toBe(false);
    expect(mayFollowUp({ ...base, source: 'estimator' }, RULES)).toBe(false);
    expect(mayFollowUp({ ...base, source: 'diagnostic', consent_marketing: true }, RULES)).toBe(true);
    expect(mayFollowUp({ ...base, source: 'estimator', created_at: avant }, RULES)).toBe(true);
    expect(mayFollowUp({ ...base, source: 'contact' }, RULES)).toBe(true);
    expect(mayFollowUp({ ...base, source: null }, RULES)).toBe(true);
  });

  it('mayContactProactively : premier contact sans la case 2, puis plus rien sans elle ; jamais désabonné', () => {
    const base = { email_opt_out: false, consent_marketing: false, created_at: apres };
    for (const source of ['diagnostic', 'estimator']) {
      expect(mayContactProactively({ ...base, ...jamais, source }, RULES)).toBe(true);
      expect(mayContactProactively({ ...base, ...contacte, source }, RULES)).toBe(false);
      expect(mayContactProactively({ ...base, first_contacted_at: null, last_contacted_at: apres, source }, RULES)).toBe(false);
      expect(mayContactProactively({ ...base, ...contacte, consent_marketing: true, source }, RULES)).toBe(true);
      expect(mayContactProactively({ ...base, ...contacte, created_at: avant, source }, RULES)).toBe(true);
      expect(mayContactProactively({ ...base, ...jamais, email_opt_out: true, source }, RULES)).toBe(false);
      expect(mayContactProactively({ ...base, ...jamais, email_opt_out: true, consent_marketing: true, source }, RULES)).toBe(false);
    }
    expect(mayContactProactively({ ...base, ...contacte, source: 'contact' }, RULES)).toBe(true);
  });

  it('libellé de notification d’exemple', () => {
    expect(contactConsentValue(true)).toBe('oui');
    expect(contactConsentValue(false)).toMatch(/^non — un seul contact/);
  });
});

describe('paramètres du kit (ajoutés)', () => {
  const base = { email_opt_out: false, consent_marketing: false, created_at: apres, source: 'contact' };
  it('sources absentes : la règle s’applique à toutes les sources (strict par défaut)', () => {
    expect(mayFollowUp(base, { splitAt: SPLIT_AT })).toBe(false);
    expect(mayFollowUp({ ...base, source: null }, { splitAt: SPLIT_AT })).toBe(false);
    expect(mayFollowUp({ ...base, consent_marketing: true }, { splitAt: SPLIT_AT })).toBe(true);
  });
  it('splitAt null (nouveau projet) : aucun lead antérieur ménagé', () => {
    expect(hasFollowUpContactConsent({ ...base, created_at: '2000-01-01T00:00:00Z' }, { splitAt: null })).toBe(false);
  });
  it('consent_marketing null ou date illisible → pas d’accord', () => {
    expect(hasFollowUpContactConsent({ ...base, consent_marketing: null }, RULES)).toBe(false);
    expect(hasFollowUpContactConsent({ ...base, created_at: 'pas une date' }, RULES)).toBe(false);
    expect(hasFollowUpContactConsent({ ...base, created_at: avant }, { splitAt: 'pas une date' })).toBe(false);
  });
});
