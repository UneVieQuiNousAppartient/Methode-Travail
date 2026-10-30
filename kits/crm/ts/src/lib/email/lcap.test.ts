// Kit CRM TS (methode-travail) — origine : KHI Educ, tests/unit/lcap.test.mjs (sections « consentement tacite » et « désabonnement par adresse »), commit 2954590 (2026-10-27) + Vie Solution Web, tests/crm-regles.test.mjs (parties LCAP : ajouterMois, consentement, raisonDeRetenue, piedLcap, pretAEnvoyer), commit 7873e8f (2026-10-30) ; généralisé : port Vitest, statut client « Client » (paramètre) ; sections gabarits, réglages et moteur de relances (propres aux projets) non reprises ; les cas « pied sans adresse postale ou sans lien » sont couverts par le blocage de pretAEnvoyer.
import { describe, expect, it } from 'vitest';
import { addMonths, canSendCommercial, configurationLcap, inquiryConsentSince, piedLcap, pretAEnvoyer, relanceSkipReason, withAddressOptOut, type LeadLcap } from './lcap';

describe('addMonths', () => {
  it('31 août + 6 mois = 28 février ; année bissextile → 29 février ; recul de 6 mois', () => {
    expect(addMonths('2026-08-31T00:00:00Z', 6).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonths('2027-08-31T00:00:00Z', 6).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths('2026-08-31T12:00:00Z', 6).toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(addMonths('2026-01-15T00:00:00Z', -6).toISOString()).toBe('2025-07-15T00:00:00.000Z');
  });
  it('ajoutés pour le kit : 31 janvier + 1 mois = 28 ou 29 février ; 31 mars − 1 mois = 28 février', () => {
    expect(addMonths('2027-01-31T00:00:00Z', 1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonths('2028-01-31T00:00:00Z', 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths('2027-03-31T00:00:00Z', -1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});

describe('consentement tacite (6 mois / 2 ans)', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const nl = (o: Record<string, string | null>) => ({ status: 'Nouveau', email: 'marie@exemple.test', ...o });
  it('demande : 6 mois moins 1 s permis, 6 mois pile refusé, récente permise', () => {
    expect(canSendCommercial(nl({ created_at: '2026-03-25T12:00:01Z' }), now)).toBe(true);
    expect(canSendCommercial(nl({ created_at: '2026-03-25T12:00:00Z' }), now)).toBe(false);
    expect(canSendCommercial(nl({ created_at: '2026-09-01T00:00:00Z' }), now)).toBe(true);
  });
  it('client depuis 2 ans moins 1 s permis, 2 ans pile refusé ; sans date de passage : règle des 6 mois', () => {
    expect(canSendCommercial(nl({ status: 'Client', created_at: '2024-01-10T00:00:00Z', status_changed_at: '2024-09-25T12:00:01Z' }), now)).toBe(true);
    expect(canSendCommercial(nl({ status: 'Client', created_at: '2024-01-10T00:00:00Z', status_changed_at: '2024-09-25T12:00:00Z' }), now)).toBe(false);
    expect(canSendCommercial(nl({ status: 'Client', created_at: '2026-06-01T00:00:00Z' }), now)).toBe(true);
    expect(canSendCommercial(nl({ status: 'Client', created_at: '2025-01-01T00:00:00Z' }), now)).toBe(false);
  });
  it('non client : un statut récent ne renouvelle rien ; statuts client en paramètre', () => {
    const qualifie = nl({ status: 'Qualifié', created_at: '2025-01-01T00:00:00Z', status_changed_at: '2026-09-20T00:00:00Z' });
    expect(canSendCommercial(qualifie, now)).toBe(false);
    expect(canSendCommercial({ ...qualifie, status: 'Inscrit' }, now, { clientStatuses: ['Inscrit'] })).toBe(true);
  });
  it('désabonné : jamais, même demande récente ; sans date de demande : refusé', () => {
    expect(canSendCommercial(nl({ created_at: '2026-09-20T00:00:00Z', email_opt_out_at: '2026-09-21T00:00:00Z' }), now)).toBe(false);
    expect(canSendCommercial(nl({}), now)).toBe(false);
    expect(canSendCommercial(null, now)).toBe(false);
  });
  it('relanceSkipReason : sans courriel, désabonné (prime), consentement expiré, sinon null', () => {
    expect(relanceSkipReason({ created_at: '2026-09-20T00:00:00Z' }, {}, now)).toBe('sans courriel');
    expect(relanceSkipReason(nl({ created_at: '2026-09-20T00:00:00Z', email_opt_out_at: '2026-09-21T00:00:00Z' }), {}, now)).toBe('désabonné');
    expect(relanceSkipReason(nl({ created_at: '2020-01-01T00:00:00Z', email_opt_out_at: '2026-09-21T00:00:00Z' }), { commercial: true }, now)).toBe('désabonné');
    expect(relanceSkipReason(nl({ created_at: '2025-01-01T00:00:00Z' }), { commercial: true }, now)).toBe('consentement expiré (LCAP)');
    expect(relanceSkipReason(nl({ created_at: '2025-01-01T00:00:00Z' }), { commercial: false }, now)).toBeNull();
  });
  it('inquiryConsentSince : borne de 6 mois en arrière', () => {
    expect(inquiryConsentSince(now)).toBe('2026-03-25T12:00:00.000Z');
  });
});

describe('désabonnement par adresse', () => {
  const optedOut = new Map([['marie@exemple.test', '2026-09-01T00:00:00Z']]);
  it('nouvelle demande de la même adresse (casse et espaces ignorés) ; autre adresse intacte ; date de la fiche conservée', () => {
    expect(withAddressOptOut<LeadLcap>({ email: ' Marie@Exemple.TEST ' }, optedOut).email_opt_out_at).toBe('2026-09-01T00:00:00Z');
    const autre = { email: 'paul@exemple.test' };
    expect(withAddressOptOut(autre, optedOut)).toBe(autre);
    expect(withAddressOptOut({ email: 'marie@exemple.test', email_opt_out_at: '2026-09-10T00:00:00Z' }, optedOut).email_opt_out_at).toBe('2026-09-10T00:00:00Z');
  });
});

describe('pied et configuration', () => {
  const exp = { nom: 'Entreprise Exemple', adressePostale: 'C.P. 123, Ville (Province)', site: 'https://exemple.test' };
  it('piedLcap porte le nom, l’adresse postale, le site et le lien de désabonnement (HTML échappé)', () => {
    const pied = piedLcap(exp, 'https://exemple.test/api/desabonnement?l=1&t=x');
    for (const morceau of ['Entreprise Exemple', 'C.P. 123, Ville (Province)', 'exemple.test', '/api/desabonnement?l=1&t=x']) expect(pied.texte).toContain(morceau);
    expect(pied.html).toMatch(/Ne plus recevoir de relances/);
    expect(pied.html).toMatch(/l=1&amp;t=x/);
    expect(piedLcap({ ...exp, nom: '<b>' }, 'https://exemple.test/x').html).not.toContain('<b>');
    expect(piedLcap(exp, 'https://exemple.test/x', undefined, 'en').texte).toContain('Stop receiving follow-ups: https://exemple.test/x');
  });
  it('pretAEnvoyer : rien ne part sans Resend, expéditeur, adresse postale, secret et site https', () => {
    const ok = { resend: true, expediteur: true, adressePostale: 'C.P. 123', secretDesabonnement: true, site: 'https://exemple.test' };
    expect(pretAEnvoyer(ok)).toBeNull();
    expect(pretAEnvoyer({ ...ok, resend: false })).toMatch(/RESEND_API_KEY/);
    expect(pretAEnvoyer({ ...ok, expediteur: false })).toMatch(/EMAIL_FROM/);
    expect(pretAEnvoyer({ ...ok, adressePostale: '  ' })).toMatch(/adresse postale.*LCAP_POSTAL_ADDRESS/);
    expect(pretAEnvoyer({ ...ok, secretDesabonnement: false })).toMatch(/SECRET/);
    expect(pretAEnvoyer({ ...ok, site: 'http://localhost:3000' })).toMatch(/https/);
    expect(pretAEnvoyer({ ...ok, site: 'https://exemple.test/sous' })).toMatch(/chemin/);
  });
  it('ajouté : configurationLcap — sans adresse postale ou avec un secret trop court, aucun envoi commercial', () => {
    const env = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@exemple.test', LCAP_POSTAL_ADDRESS: 'C.P. 1', UNSUBSCRIBE_SECRET: 'x'.repeat(32) };
    expect(pretAEnvoyer(configurationLcap(env, 'https://exemple.test'))).toBeNull();
    expect(pretAEnvoyer(configurationLcap({ ...env, LCAP_POSTAL_ADDRESS: '' }, 'https://exemple.test'))).toMatch(/adresse postale/);
    expect(pretAEnvoyer(configurationLcap({ ...env, UNSUBSCRIBE_SECRET: 'court' }, 'https://exemple.test'))).toMatch(/SECRET/);
    expect(pretAEnvoyer(configurationLcap(env, ''))).toMatch(/https/);
  });
});
