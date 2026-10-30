// Kit CRM TS (methode-travail) — origine : écrit pour le kit (la source, envoi.ts de la troisième source, n'a pas de test dédié ; cas de « charge Resend » de KHI Educ tests/unit/lcap.test.mjs repris).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envoyerCourriel, esc, expediteurConfigure, resendConfigure } from './envoi';

const COURRIEL = { to: 'personne@exemple.test', subject: 'Objet', html: '<p>Bonjour</p>' };
let fetchMock: ReturnType<typeof vi.fn>;
const repond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const envoye = () => JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
const entetes = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'Expéditeur <bonjour@exemple.test>');
  vi.stubEnv('EMAIL_REPLY_TO', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('envoyerCourriel', () => {
  it('200 → identifiant Resend ; clé, expéditeur et destinataire transmis', async () => {
    repond(200, { id: 'em_1' });
    expect(await envoyerCourriel(COURRIEL)).toEqual({ id: 'em_1' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(entetes().Authorization).toBe('Bearer re_test');
    expect(envoye()).toMatchObject({ from: 'Expéditeur <bonjour@exemple.test>', to: ['personne@exemple.test'], subject: 'Objet' });
  });

  it.each([422, 403, 400, 401])('%i → échec permanent', async (status) => {
    repond(status, { message: 'personne@exemple.test refusée' });
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'permanent' });
  });

  it.each([429, 500, 503, 409])('%i → échec temporaire', async (status) => {
    repond(status, {});
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'temporaire' });
  });

  it('erreur réseau → temporaire ; 200 sans identifiant → temporaire', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'temporaire' });
    repond(200, {});
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'temporaire' });
  });

  it('journal : le statut seulement, jamais l’adresse du destinataire', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    repond(422, { message: 'personne@exemple.test refusée' });
    await envoyerCourriel(COURRIEL);
    expect(error.mock.calls.flat().join(' ')).not.toContain('personne@exemple.test');
  });

  it('clé absente, expéditeur absent ou destinataire vide → aucun appel, échec permanent', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(resendConfigure()).toBe(false);
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'permanent' });
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', '');
    expect(expediteurConfigure()).toBe(false);
    expect(await envoyerCourriel(COURRIEL)).toEqual({ echec: 'permanent' });
    vi.stubEnv('EMAIL_FROM', 'x@exemple.test');
    expect(await envoyerCourriel({ ...COURRIEL, to: '' })).toEqual({ echec: 'permanent' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clé d’idempotence transmise en en-tête ; absente sinon', async () => {
    repond(200, { id: 'a' });
    await envoyerCourriel({ ...COURRIEL, cle: 'relance:lead-1:j2' });
    expect(entetes()['Idempotency-Key']).toBe('relance:lead-1:j2');
    fetchMock.mockClear();
    repond(200, { id: 'b' });
    await envoyerCourriel(COURRIEL);
    expect(entetes()['Idempotency-Key']).toBeUndefined();
  });

  it('en-têtes de désabonnement transmis ; en-têtes vides non envoyés (charge Resend)', async () => {
    const headers = { 'List-Unsubscribe': '<https://exemple.test/api/desabonnement?l=1&t=x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    repond(200, { id: 'a' });
    await envoyerCourriel({ ...COURRIEL, headers });
    expect(envoye().headers).toEqual(headers);
    fetchMock.mockClear();
    repond(200, { id: 'b' });
    await envoyerCourriel({ ...COURRIEL, headers: {} });
    expect('headers' in envoye()).toBe(false);
  });

  it('réponse : propre au courriel, sinon EMAIL_REPLY_TO, sinon absente ; pièces jointes', async () => {
    repond(200, { id: 'a' });
    await envoyerCourriel({ ...COURRIEL, pieces: [{ nom: 'f.pdf', base64: 'QQ==' }] });
    expect('reply_to' in envoye()).toBe(false);
    expect(envoye().attachments).toEqual([{ filename: 'f.pdf', content: 'QQ==' }]);
    fetchMock.mockClear();
    vi.stubEnv('EMAIL_REPLY_TO', 'equipe@exemple.test');
    repond(200, { id: 'b' });
    await envoyerCourriel(COURRIEL);
    expect(envoye().reply_to).toBe('equipe@exemple.test');
    fetchMock.mockClear();
    repond(200, { id: 'c' });
    await envoyerCourriel({ ...COURRIEL, replyTo: 'conseil@exemple.test' });
    expect(envoye().reply_to).toBe('conseil@exemple.test');
  });
});

describe('esc', () => {
  it('échappe < > & " et l’apostrophe ; null et undefined → vide', () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(42)).toBe('42');
  });
});
