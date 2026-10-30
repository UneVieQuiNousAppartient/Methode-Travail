// Kit CRM TS (methode-travail) — origine : KHI Educ, lib/lcap.js, commit 2954590 (2026-10-27) (consentement tacite, addMonths, désabonnement par adresse) + Vie Solution Web, src/lib/crm/regles.ts (piedLcap, pretAEnvoyer, raison « sans courriel »), commit 7873e8f (2026-10-30) ; généralisé : porté en TS strict, statuts « client » en paramètre, couleurs et textes [à adapter], réglage d'adresse postale → LCAP_POSTAL_ADDRESS ; ajout : configurationLcap (lit l'environnement).
// Loi canadienne anti-pourriel (LCAP) — règles pures, sans base ni réseau.
import { secretDesabonnement } from './desabonnement';
//
// Une relance automatique qui invite à prendre rendez-vous est un « message électronique commercial » :
// il faut (1) le consentement du destinataire, (2) s'identifier (nom, adresse postale, moyen de contact)
// et (3) un désabonnement gratuit, pris en compte sans délai. (2) et (3) : `piedLcap` et le lien signé
// (desabonnement.ts) ; `pretAEnvoyer` bloque TOUT envoi commercial tant qu'il manque l'adresse postale,
// le secret du lien ou une adresse https du site.
//
// (1) Sans case de consentement exprès à la prospection, seul vaut le consentement TACITE, limité dans le temps :
//   - relation d'affaires en cours (client) : 2 ans depuis le passage au statut client (status_changed_at) ;
//   - demande de renseignements : 6 mois depuis la demande (created_at).
// Passé ce délai, plus aucune relance commerciale. Un désabonnement l'emporte toujours.
// Les courriels transactionnels (confirmation, rappel de rendez-vous, facture) ne sont pas concernés, à
// condition de ne contenir AUCUNE promotion. Lecture technique, pas un avis juridique.

export const INQUIRY_MONTHS = 6;
export const CLIENT_MONTHS = 24;

/** Statuts qui valent « relation d'affaires en cours » [à adapter au pipeline du projet]. */
export const CLIENT_STATUSES_PAR_DEFAUT: readonly string[] = ['Client'];

/** Ajoute n mois civils (UTC) sans déborder sur le mois suivant : 31 août + 6 mois = fin février. */
export const addMonths = (date: number | string | Date, n: number): Date => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

const timeOf = (iso: string | null | undefined): number | null => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

// Moins de `months` mois écoulés depuis `iso` à l'instant `now` (borne exclue : 6 mois pile = expiré).
const within = (iso: string | null | undefined, months: number, now: number): boolean => {
  const t = timeOf(iso);
  return t !== null && addMonths(t, months).getTime() > now;
};

export type LeadLcap = {
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
  status_changed_at?: string | null;
  email_opt_out_at?: string | null;
};

export type LcapOptions = { clientStatuses?: readonly string[] };

/**
 * Début de la fenêtre du consentement tacite d'une demande (ISO) : borne des requêtes de candidats
 * (`.gte('created_at', …)`) ; `canSendCommercial` reste la règle à l'envoi.
 */
export const inquiryConsentSince = (now: Date = new Date()): string => addMonths(new Date(now).getTime(), -INQUIRY_MONTHS).toISOString();

export const isOptedOut = (lead: LeadLcap | null | undefined): boolean => Boolean(lead?.email_opt_out_at);

/** Le consentement tacite permet-il encore un message commercial à ce lead ? */
export const canSendCommercial = (lead: LeadLcap | null | undefined, now: Date = new Date(), options: LcapOptions = {}): boolean => {
  if (!lead || isOptedOut(lead)) return false;
  const at = new Date(now).getTime();
  const clients = options.clientStatuses ?? CLIENT_STATUSES_PAR_DEFAUT;
  // Client : relation d'affaires. Sans date de passage au statut client, on s'en tient à la demande.
  if (lead.status && clients.includes(lead.status) && within(lead.status_changed_at, CLIENT_MONTHS, at)) return true;
  return within(lead.created_at, INQUIRY_MONTHS, at);
};

/** Raison de NE PAS envoyer une relance automatique, ou null. `commercial` = relance marquée comme telle. */
export const relanceSkipReason = (
  lead: LeadLcap,
  { commercial = false }: { commercial?: boolean } = {},
  now: Date = new Date(),
  options: LcapOptions = {},
): string | null => {
  if (!String(lead.email ?? '').trim()) return 'sans courriel';
  if (isOptedOut(lead)) return 'désabonné';
  if (commercial && !canSendCommercial(lead, now, options)) return 'consentement expiré (LCAP)';
  return null;
};

/**
 * Le désabonnement vise l'adresse, pas la fiche : une demande plus récente de la même adresse
 * hérite du désabonnement. `optedOut` = Map courriel en minuscules → date du désabonnement.
 */
export const withAddressOptOut = <T extends LeadLcap>(lead: T, optedOut: Map<string, string> | null | undefined): T => {
  if (!lead || lead.email_opt_out_at || !optedOut?.size) return lead;
  const at = optedOut.get(String(lead.email || '').trim().toLowerCase());
  return at ? { ...lead, email_opt_out_at: at } : lead;
};

const echapper = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type Expediteur = { nom: string; adressePostale: string; site: string };
export type LangueLcap = 'fr' | 'en';

/**
 * Pied « loi anti-pourriel » : identité, adresse postale, moyen de joindre (le site), lien de désabonnement.
 * Textes et couleurs [à adapter]. À n'utiliser qu'après `pretAEnvoyer(...) === null`.
 */
export const piedLcap = (exp: Expediteur, lienDesabonnement: string, raison?: string, lang: LangueLcap = 'fr') => {
  const site = exp.site.replace(/^https:\/\//, '');
  const en = lang === 'en';
  const pourquoi = raison ?? (en ? `you wrote to us from ${site}` : `vous nous avez écrit depuis ${site}`);
  const intro = en ? 'You are receiving this email because' : 'Vous recevez ce courriel parce que';
  const arret = en ? 'Stop receiving follow-ups' : 'Ne plus recevoir de relances';
  const texte = `—\n${intro} ${pourquoi}.\n` + `${exp.nom} · ${exp.adressePostale} · ${site}\n` + `${arret}${en ? ':' : ' :'} ${lienDesabonnement}`;
  const html =
    `<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #DDE3EA;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#5B6472">` +
    `${intro} ${echapper(pourquoi)}.<br>` +
    `${echapper(exp.nom)} · ${echapper(exp.adressePostale)} · <a href="${echapper(exp.site)}" style="color:#5B6472">${echapper(site)}</a><br>` +
    `<a href="${echapper(lienDesabonnement)}" style="color:#5B6472">${arret}</a></p>`;
  return { texte, html };
};

export type Configuration = {
  resend: boolean;
  expediteur: boolean;
  adressePostale: string;
  secretDesabonnement: boolean;
  site: string;
};

/**
 * Raison pour laquelle AUCUN courriel commercial ne peut partir, ou null. Vérifiée avant de réserver la
 * moindre relance : tant qu'il manque quelque chose, les relances attendent (rien n'est consommé).
 */
export const pretAEnvoyer = (c: Configuration): string | null => {
  if (!c.resend) return 'RESEND_API_KEY manquant';
  if (!c.expediteur) return 'EMAIL_FROM manquant';
  if (!c.adressePostale.trim()) return 'adresse postale manquante (LCAP) — variable LCAP_POSTAL_ADDRESS';
  if (!c.secretDesabonnement) return 'UNSUBSCRIBE_SECRET ou CRON_SECRET manquant ou trop court (lien de désabonnement)';
  if (!/^https:\/\/[^/\s]+$/.test(c.site)) return 'adresse du site non https ou avec un chemin (lien de désabonnement)';
  return null;
};

/**
 * Configuration lue dans l'environnement (ajouté pour le kit) : RESEND_API_KEY, EMAIL_FROM, LCAP_POSTAL_ADDRESS,
 * secret du lien (UNSUBSCRIBE_SECRET ou CRON_SECRET, 32 caractères ou plus) et adresse publique du site.
 * Usage : `const raison = pretAEnvoyer(configurationLcap(process.env, getPublicSiteUrl()))`.
 */
export const configurationLcap = (env: Record<string, string | undefined>, site: string): Configuration => ({
  resend: Boolean(env.RESEND_API_KEY),
  expediteur: Boolean(env.EMAIL_FROM),
  adressePostale: String(env.LCAP_POSTAL_ADDRESS ?? ''),
  secretDesabonnement: Boolean(secretDesabonnement(env)),
  site,
});
