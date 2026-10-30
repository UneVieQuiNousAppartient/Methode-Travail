// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/lib/crm/jeton.ts + src/lib/crm/regles.ts (masquerCourriel, page de désabonnement), commit 7873e8f (2026-10-30) + KHI Educ, lib/unsubscribe.js (unsubscribeSecretSource, likeExact, optOutAddress, courriel de contact de la page), commit 2954590 (2026-10-27) ; généralisé : table des leads en paramètre (LCAP_LEADS_TABLE), secret d'au moins 32 caractères, nom du site et courriel de contact en paramètres, journal d'activité retiré (lot 2), textes et couleurs [à adapter].
// Lien de désabonnement (LCAP) — sans état.
//
// Jeton = HMAC-SHA256 de « lead_id:courriel en minuscules » : aucune table de jetons ; le lien reste valable
// tant que la fiche garde le même courriel (la loi exige au moins 60 jours après l'envoi) et ne désabonne que
// cette adresse. Secret : UNSUBSCRIBE_SECRET (32 caractères ou plus), sinon CRON_SECRET (même exigence).
// Changer le secret invalide les liens déjà envoyés : en production, préférer un UNSUBSCRIBE_SECRET dédié
// (une rotation de CRON_SECRET ne casse alors rien). Sans secret valable, AUCUN lien, donc aucun envoi
// commercial (`pretAEnvoyer`, lcap.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_SECRET = 32;
export const DESABONNEMENT_PATH = '/api/desabonnement';

type Env = Record<string, string | undefined>;

/** D'où vient le secret : "UNSUBSCRIBE_SECRET", "CRON_SECRET" ou null (pour une page de santé). */
export const unsubscribeSecretSource = (env: Env = process.env): 'UNSUBSCRIBE_SECRET' | 'CRON_SECRET' | null =>
  (env.UNSUBSCRIBE_SECRET || '').length >= MIN_SECRET ? 'UNSUBSCRIBE_SECRET' : (env.CRON_SECRET || '').length >= MIN_SECRET ? 'CRON_SECRET' : null;

export const secretDesabonnement = (env: Env = process.env): string => {
  const source = unsubscribeSecretSource(env);
  return source ? (env[source] as string) : '';
};

const charge = (leadId: string, email: string) => `${leadId}:${email.trim().toLowerCase()}`;

/** Jeton du lien ("" sans secret, sans lead ou sans courriel). */
export const jetonDesabonnement = (leadId: string | null | undefined, email: string | null | undefined, cle: string): string =>
  cle && leadId && email ? createHmac('sha256', cle).update(charge(leadId, email)).digest('base64url') : '';

/** Comparaison en temps constant ; longueurs différentes → false, sans lever. */
export const memeSecret = (recu: string, attendu: string): boolean => {
  if (!recu || !attendu) return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Vérifie un jeton reçu, en temps constant. */
export const jetonValide = (leadId: string | null | undefined, email: string | null | undefined, jeton: unknown, cle: string): boolean => {
  const attendu = jetonDesabonnement(leadId, email, cle);
  if (!attendu || typeof jeton !== 'string' || !jeton) return false;
  return memeSecret(jeton, attendu);
};

/** Lien absolu https du désabonnement, ou "" (un lien relatif ou http dans un courriel ne mène nulle part de sûr). */
export const lienDesabonnement = (site: string, leadId: string, email: string, cle: string): string => {
  const t = jetonDesabonnement(leadId, email, cle);
  if (!t || !/^https:\/\/[^/\s]+$/.test(site)) return '';
  return `${site}${DESABONNEMENT_PATH}?l=${encodeURIComponent(leadId)}&t=${t}`;
};

/** En-têtes RFC 2369 + RFC 8058 (bouton « Se désabonner » de Gmail, Outlook, Apple Mail). Rien sans lien https. */
export const entetesDesabonnement = (lien: string): Record<string, string> =>
  /^https:\/\//.test(lien) ? { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};

/** « marie.tremblay@exemple.test » → « m•••@exemple.test » : la personne reconnaît son adresse sans qu'elle s'affiche en entier. */
export const maskEmail = (email: string | null | undefined): string => {
  const [local, domaine] = String(email || '').split('@');
  return local && domaine ? `${local[0]}•••@${domaine}` : '';
};

/** Motif ILIKE qui ne correspond qu'à la chaîne elle-même : \ % _ échappés (échappement par défaut de LIKE). */
export const likeExact = (s: unknown): string => String(s ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);

// --- désabonnement d'une adresse ---------------------------------------------------------

/** Origines admises (contrainte de 0102_lcap_desabonnement.sql). */
export const OPT_OUT_SOURCES = ['lien', 'one-click', 'admin'] as const;
export type OptOutSource = (typeof OPT_OUT_SOURCES)[number];

export const leadsTable = (env: Env = process.env): string => {
  const t = (env.LCAP_LEADS_TABLE || '').trim();
  return /^[a-z_][a-z0-9_]*$/.test(t) ? t : 'leads';
};

type DbResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type Rows = Array<{ id: string; email?: string | null }>;

/** Forme minimale du client Supabase utilisée ici (le vrai client s'y conforme ; les tests injectent un faux). */
export type OptOutClient = {
  from: (table: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, v: string) => { is: (col: string, v: null) => { select: (cols: string) => DbResult<Rows> } };
      in: (col: string, v: string[]) => { is: (col: string, v: null) => { select: (cols: string) => DbResult<Rows> } };
    };
    select: (cols: string) => {
      ilike: (col: string, v: string) => { neq: (col: string, v: string) => { is: (col: string, v: null) => DbResult<Rows> } };
    };
  };
};

/**
 * Désabonne une adresse : la fiche `lead` puis toutes les autres demandes du même courriel, casse ignorée
 * (la loi vise l'adresse, pas la fiche). Idempotent : une fiche déjà désabonnée garde sa date et sa source.
 * Renvoie { at, lead_ids } : fiches désabonnées par cet appel (vide = déjà fait).
 */
export const optOutAddress = async (
  supabase: OptOutClient,
  lead: { id: string; email?: string | null },
  source: OptOutSource,
  { table = leadsTable(), now = new Date() }: { table?: string; now?: Date } = {},
): Promise<{ at: string; lead_ids: string[] }> => {
  if (!OPT_OUT_SOURCES.includes(source)) throw new Error(`Source de désabonnement inconnue : ${source}`);
  const at = now.toISOString();
  const patch = { email_opt_out_at: at, email_opt_out_source: source };
  const { data: own, error } = await supabase.from(table).update(patch).eq('id', lead.id).is('email_opt_out_at', null).select('id');
  if (error) throw new Error(error.message);

  // Autres demandes de l'adresse : sélection ILIKE sans joker, puis égalité exacte en minuscules en JS (un « * »,
  // joker de PostgREST, ou des espaces autour d'une adresse ne font jamais désabonner une autre adresse).
  const email = String(lead.email || '').trim().toLowerCase();
  let others: Rows = [];
  if (email) {
    const { data: same, error: sameError } = await supabase.from(table).select('id, email').ilike('email', likeExact(email)).neq('id', lead.id).is('email_opt_out_at', null);
    if (sameError) console.error('[desabonnement] autres demandes :', sameError.message);
    const ids = (same || []).filter((r) => String(r.email || '').trim().toLowerCase() === email).map((r) => r.id);
    if (ids.length) {
      const { data, error: othersError } = await supabase.from(table).update(patch).in('id', ids).is('email_opt_out_at', null).select('id');
      if (othersError) console.error('[desabonnement] autres demandes :', othersError.message);
      others = data || [];
    }
  }
  return { at, lead_ids: [...(own || []), ...others].map((r) => r.id) };
};

// --- page de désabonnement, en français ou en anglais --------------------------------------
// Page autonome, styles en ligne, aucune ressource externe ; noindex. Textes et couleurs [à adapter].

export type EtatDesabonnement = 'confirmer' | 'fait' | 'deja' | 'invalide' | 'limite' | 'erreur';
export type LangueDesabonnement = 'fr' | 'en' | 'les-deux';

const TEXTES: Record<'fr' | 'en', Record<EtatDesabonnement, [string, string]> & { bouton: string; adresse: string; contact: string; locale: string }> = {
  fr: {
    confirmer: ['Ne plus recevoir de relances', 'Vous recevez des relances par courriel de {site} au sujet de votre demande{adresse}. Confirmez pour ne plus en recevoir.'],
    fait: ["C'est fait", "Vous ne recevrez plus de relances automatiques de {site}{adresse}. Merci de nous l'avoir dit."],
    deja: ['Désabonnement déjà enregistré', 'Depuis le {date}, vous ne recevez plus de relances automatiques de {site}{adresse}.'],
    invalide: ['Lien invalide', "Ce lien de désabonnement n'est pas valide. Pour ne plus recevoir nos courriels, répondez simplement à l'un d'eux."],
    limite: ['Trop de requêtes', 'Réessayez plus tard.'],
    erreur: ['Désabonnement impossible pour le moment', 'Réessayez dans quelques minutes, ou répondez simplement à notre courriel.'],
    bouton: 'Me désabonner des relances',
    adresse: ' (adresse {masque})',
    contact: 'Une question ? Écrivez-nous à {courriel}.',
    locale: 'fr-CA',
  },
  en: {
    confirmer: ['Stop receiving follow-ups', 'You receive follow-up emails from {site} about your request{adresse}. Confirm to stop receiving them.'],
    fait: ['Done', 'You will no longer receive automatic follow-ups from {site}{adresse}. Thank you for letting us know.'],
    deja: ['Already unsubscribed', 'Since {date}, you no longer receive automatic follow-ups from {site}{adresse}.'],
    invalide: ['Invalid link', 'This unsubscribe link is not valid. To stop receiving our emails, simply reply to one of them.'],
    limite: ['Too many requests', 'Please try again later.'],
    erreur: ['Unsubscribing is not possible right now', 'Please try again in a few minutes, or simply reply to our email.'],
    bouton: 'Unsubscribe from follow-ups',
    adresse: ' (address {masque})',
    contact: 'A question? Write to us at {courriel}.',
    locale: 'en-CA',
  },
};

const h = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type OptionsPage = {
  lang: LangueDesabonnement;
  /** Nom affiché du site ou de l'entreprise (SITE_NAME). */
  site: string;
  /** Adresse publique https du site (getPublicSiteUrl) ; vide = pas de lien de retour. */
  siteUrl: string;
  /** Courriel de contact affiché après l'action (CONTACT_EMAIL) ; vide = rien. */
  contactEmail?: string;
  email?: string;
  depuis?: string | null;
  action?: string;
  /** Fuseau des dates affichées. */
  fuseau?: string;
};

function bloc(lang: 'fr' | 'en', etat: EtatDesabonnement, o: OptionsPage) {
  const t = TEXTES[lang];
  const masque = maskEmail(o.email);
  const date = o.depuis
    ? new Intl.DateTimeFormat(t.locale, { timeZone: o.fuseau ?? 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(o.depuis))
    : '';
  const [titre, brut] = t[etat];
  const texte = h(brut)
    .replace('{site}', h(o.site))
    .replace('{adresse}', masque ? h(t.adresse.replace('{masque}', masque)) : '')
    .replace('{date}', h(date));
  const contact =
    o.contactEmail && etat !== 'confirmer'
      ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6">${h(t.contact).replace('{courriel}', `<a href="mailto:${h(o.contactEmail)}">${h(o.contactEmail)}</a>`)}</p>`
      : '';
  return { titre: h(titre), texte, contact, bouton: h(t.bouton) };
}

/**
 * HTML complet de la page. `les-deux` : lien invalide ou panne, quand la fiche (et donc la langue) est inconnue —
 * le français, puis l'anglais. Le bouton (état « confirmer ») n'existe qu'avec une fiche : ouvrir le lien ne
 * désabonne pas (les antivirus de messagerie ouvrent les liens) ; seul le POST désabonne.
 */
export function pageDesabonnement(etat: EtatDesabonnement, o: OptionsPage): string {
  const langues: ('fr' | 'en')[] = o.lang === 'les-deux' ? ['fr', 'en'] : [o.lang];
  const blocs = langues.map((l) => bloc(l, etat, o));
  const premier = blocs[0];
  const bouton =
    etat === 'confirmer' && o.action
      ? `<form method="post" action="${h(o.action)}" style="margin:24px 0 0"><button type="submit" style="padding:13px 24px;min-height:44px;background:#1F4E79;color:#FFFFFF;border:0;border-radius:12px;font-size:15px;font-weight:bold;cursor:pointer">${premier.bouton}</button></form>`
      : '';
  const contenu = blocs
    .map(
      (b, i) =>
        `<section${langues.length > 1 ? ` lang="${langues[i]}"` : ''}${i > 0 ? ' style="margin-top:24px;padding-top:20px;border-top:1px solid #DDE3EA"' : ''}>` +
        `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${b.titre}</h1>` +
        `<p style="margin:0;font-size:15px;line-height:1.6">${b.texte}</p>${b.contact}</section>`,
    )
    .join('');
  const titrePage = blocs.map((b) => b.titre).join(' / ');
  const retour = /^https:\/\//.test(o.siteUrl)
    ? `<p style="margin:24px 0 0;font-size:13px"><a href="${h(o.siteUrl)}" style="color:#1F4E79">${h(o.siteUrl.replace(/^https:\/\//, ''))}</a></p>`
    : '';
  return (
    `<!DOCTYPE html><html lang="${langues[0]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${titrePage}${o.site ? ` — ${h(o.site)}` : ''}</title></head>` +
    `<body style="margin:0;background:#F6F5F1;font-family:Arial,Helvetica,sans-serif;color:#1F2430">` +
    `<main style="max-width:520px;margin:48px auto;padding:32px 24px;background:#FFFFFF;border:1px solid #DDE3EA;border-radius:16px">` +
    (o.site ? `<div style="margin:0 0 20px;font-size:15px;font-weight:bold;color:#1F4E79">${h(o.site)}</div>` : '') +
    contenu +
    bouton +
    retour +
    `</main></body></html>`
  );
}
