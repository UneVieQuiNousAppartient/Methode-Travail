// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/lib/crm/envoi.ts, commit 7873e8f (2026-10-30) + KHI Educ, lib/email.js (esc), commit 2954590 (2026-10-27) ; généralisé : commentaires propres au projet retirés, esc porté en TS (apostrophe échappée en plus).
// Envoi de courriels — côté serveur seulement, via Resend (API HTTP, sans SDK).
//
// RESEND_API_KEY + EMAIL_FROM (adresse d'un domaine vérifié dans Resend : SPF, DKIM, DMARC)
// sont requis ; sans eux, rien ne part et `envoyerCourriel` renvoie un échec permanent sans appel.
// EMAIL_REPLY_TO (facultatif) reçoit les réponses des prospects.
// Courriel commercial (relance) : passer les en-têtes de `entetesDesabonnement` (desabonnement.ts) en `headers`,
// et vérifier `pretAEnvoyer` (lcap.ts) avant tout envoi.

const RESEND_URL = 'https://api.resend.com/emails';

export type Courriel = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  /** Clé d'idempotence Resend : un même envoi rejoué dans les 24 h ne part qu'une fois. */
  cle?: string;
  /** Adresse de réponse propre à ce courriel (sinon EMAIL_REPLY_TO). */
  replyTo?: string;
  /** Pièces jointes : contenu encodé en base64. */
  pieces?: { nom: string; base64: string }[];
};

/** Résultat : identifiant Resend, ou échec « permanent » (adresse refusée, non configuré…) ou « temporaire » (panne, quota). */
export type ResultatEnvoi = { id: string } | { echec: 'permanent' | 'temporaire' };

export const resendConfigure = () => Boolean(process.env.RESEND_API_KEY);
export const expediteurConfigure = () => Boolean(process.env.EMAIL_FROM);

/** Échappement HTML de tout texte venu d'un visiteur ou de la base, avant de le placer dans un courriel. */
export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Envoie un courriel. Non configuré ou sans destinataire : échec permanent (rien n'est tenté). */
export async function envoyerCourriel(c: Courriel): Promise<ResultatEnvoi> {
  if (!resendConfigure() || !expediteurConfigure() || !c.to) return { echec: 'permanent' };
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        ...(c.cle ? { 'Idempotency-Key': c.cle } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [c.to],
        subject: c.subject,
        html: c.html,
        ...(c.text ? { text: c.text } : {}),
        ...(c.replyTo || process.env.EMAIL_REPLY_TO ? { reply_to: c.replyTo || process.env.EMAIL_REPLY_TO } : {}),
        ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}),
        ...(c.pieces?.length ? { attachments: c.pieces.map((p) => ({ filename: p.nom, content: p.base64 })) } : {}),
      }),
    });
    if (!res.ok) {
      // Statut seulement : la réponse de Resend peut contenir l'adresse du destinataire.
      console.error(`[courriel] resend ${res.status}`);
      // 409 : même clé d'idempotence avec un autre contenu, ou envoi encore en cours — à réessayer plus tard.
      return { echec: res.status === 409 || res.status === 429 || res.status >= 500 ? 'temporaire' : 'permanent' };
    }
    const json = (await res.json()) as { id?: string };
    return json.id ? { id: json.id } : { echec: 'temporaire' };
  } catch (e) {
    console.error('[courriel] resend :', e instanceof Error ? e.message : e);
    return { echec: 'temporaire' };
  }
}
