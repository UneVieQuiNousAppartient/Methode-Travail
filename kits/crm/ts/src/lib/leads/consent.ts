// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/leads/contact-consent.ts, commit 508f19a (2026-10-30) ; généralisé : seul le principe est gardé ; date de bascule et sources en paramètre (ConsentRules), règle « guide offert », pastille et libellés propres au projet retirés ; ajout de consentFromForm (seul true strict vaut accord).
// Consentement Loi 25 : jamais précoché, jamais déduit. Logique pure, partagée par les routes qui créent une
// demande, les relances automatiques, les brouillons de première réponse et la fiche du lead.
//
// Deux cases possibles sur un formulaire :
//   case 1 (obligatoire) : traitement des données + UN contact de suivi unique pour répondre à la demande ;
//   case 2 (facultative, `consent_marketing`) : autres suivis et relances.
// Règle : premier contact permis par la case 1 tant que le lead n'a jamais été contacté et ne s'est pas
// désabonné ; suivis suivants et relances seulement avec la case 2. Les leads créés AVANT la mise en ligne
// des deux cases (`splitAt`) avaient accepté « être contacté pour un suivi » : ils restent contactables.
//
// Schéma d'exemple côté serveur (zod non imposé) :
//   consent: z.literal(true)          // la case 1 doit être cochée, sinon 400
//   consent_marketing: z.boolean().optional().default(false)
// Côté interface : état initial à false, aucune case cochée d'avance (règle `consentement-precoche` de check-rules).

/**
 * Valeur d'une case de consentement reçue d'un formulaire. SEUL le booléen `true` vaut accord : `'on'`, `'true'`,
 * `1`, `'1'`, `'yes'`, absent, `null` → `false`. Le formulaire envoie `true` en JSON quand la case est cochée ;
 * toute autre forme vient d'un formulaire mal branché ou d'un robot, et ne doit jamais devenir un accord.
 */
export function consentFromForm(value: unknown): boolean {
  return value === true;
}

/** Paramètres du projet. */
export interface ConsentRules {
  /**
   * Date de mise en ligne des deux cases (ISO 8601 avec fuseau). Prendre un peu AVANT la mise en ligne : un lead arrivé
   * dans l'intervalle par l'ancien formulaire est traité avec la règle stricte, jamais l'inverse. `null` : aucun lead
   * antérieur à ménager (nouveau projet).
   */
  splitAt: string | null;
  /**
   * Sources dont le formulaire porte les deux cases. ABSENT = la règle s'applique à toutes les sources (strict par
   * défaut). Liste fournie : les autres sources ne sont pas filtrées ici (le désabonnement l'est par chaque appelant).
   */
  sources?: readonly string[];
}

export interface ContactConsentLead {
  email_opt_out: boolean;
  consent_marketing: boolean | null;
  created_at: string;
}

export interface ContactConsentOrigin {
  source: string | null;
}

/**
 * Le lead a-t-il accepté d'être recontacté ? Désabonné : jamais. Sinon, la case facultative cochée, ou un lead créé
 * avant la séparation des consentements (ancien consentement « être contacté pour un suivi »).
 */
export function hasFollowUpContactConsent(lead: ContactConsentLead, rules: ConsentRules): boolean {
  if (lead.email_opt_out) return false;
  if (lead.consent_marketing === true) return true;
  if (!rules.splitAt) return false;
  const created = new Date(lead.created_at).getTime();
  const split = new Date(rules.splitAt).getTime();
  return Number.isFinite(created) && Number.isFinite(split) && created < split;
}

/** Historique de contact du lead (colonnes `first_contacted_at`, `last_contacted_at`). */
export interface ContactHistoryLead {
  first_contacted_at: string | null;
  last_contacted_at: string | null;
}

/** Le lead a-t-il déjà été contacté (premier ou dernier contact daté) ? */
export function hasBeenContacted(lead: ContactHistoryLead): boolean {
  return Boolean(lead.first_contacted_at || lead.last_contacted_at);
}

function ruleApplies(source: string | null, rules: ConsentRules): boolean {
  if (!rules.sources) return true;
  return Boolean(source && rules.sources.includes(source));
}

/** Suivis et relances permis (case 2) ? Sources hors règle : pas filtrées ici. */
export function mayFollowUp(lead: ContactConsentLead & ContactConsentOrigin, rules: ConsentRules): boolean {
  if (!ruleApplies(lead.source, rules)) return true;
  return hasFollowUpContactConsent(lead, rules);
}

/** Premier contact permis par la case 1 seule : UN contact, tant que le lead n'a jamais été contacté ni ne s'est désabonné. */
export function mayMakeFirstContact(lead: ContactConsentLead & ContactHistoryLead): boolean {
  if (lead.email_opt_out) return false;
  return !hasBeenContacted(lead);
}

/**
 * Peut-on contacter ce lead de sa propre initiative (brouillon de première réponse, suggestion d'appel, tâche
 * « Relancer ») ? Le premier contact (case 1), puis seulement avec la case 2. Les relances automatiques, elles,
 * exigent toujours `hasFollowUpContactConsent`.
 */
export function mayContactProactively(lead: ContactConsentLead & ContactHistoryLead & ContactConsentOrigin, rules: ConsentRules): boolean {
  if (mayFollowUp(lead, rules)) return true;
  return mayMakeFirstContact(lead);
}

/** Libellés d'exemple pour une notification interne [à adapter]. */
export const CONTACT_CONSENT_LABEL = 'Accepte d’autres suivis';
export function contactConsentValue(allowed: boolean): string {
  return allowed ? 'oui' : 'non — un seul contact permis pour faire suite à la demande, aucune relance (sauf si la personne écrit)';
}
