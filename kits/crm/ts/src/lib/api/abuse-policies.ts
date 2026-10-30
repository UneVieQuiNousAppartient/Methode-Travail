// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/abuse-policies.ts, commit 508f19a (2026-10-30) (forme) + KHI Educ, lib/rateLimit.js, commit 2954590 (2026-10-27) (valeurs de LIMITS et message 429 bilingue) ; généralisé : politiques propres au projet (espace client, tableau de bord, MCP, MFA) remplacées par des politiques génériques.
/**
 * Politiques anti-abus des routes publiques, passées à `enforceSharedAbuseGuard` (abuse-guard.ts).
 * Chaque valeur dit d'où elle vient. Un projet ajoute ses propres politiques ici, avec une portée
 * (`scope`) distincte. Contraintes de la base (`hit_rate_limit`) : fenêtre ≤ 1 h, blocage ≤ 24 h ;
 * vérifiées par `abuse-policies.test.ts`.
 */
export type AbusePolicy = {
  scope: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Formulaire public (demande, contact, inscription) : 8 envois par IP et par heure (LIMITS.leads). */
export const FORMULAIRE_PUBLIC_ABUSE_POLICY: AbusePolicy = {
  scope: 'formulaire-public',
  limit: 8,
  windowMs: HOUR,
  blockMs: HOUR,
};

/** Connexion (équipe ou client) : 5 essais par 10 minutes, blocage d'une heure (valeurs de la première source). */
export const CONNEXION_ABUSE_POLICY: AbusePolicy = {
  scope: 'connexion',
  limit: 5,
  windowMs: 10 * MINUTE,
  blockMs: HOUR,
};

/** Page de désabonnement (GET) et formulaire de confirmation : 30 par IP et par heure (LIMITS.unsubscribe). */
export const DESABONNEMENT_ABUSE_POLICY: AbusePolicy = {
  scope: 'desabonnement',
  limit: 30,
  windowMs: HOUR,
  blockMs: HOUR,
};

/**
 * Désabonnement « en un clic » (POST RFC 8058) : 600 par IP et par heure (LIMITS.unsubscribe_one_click).
 * Plus haute : la requête part des serveurs des messageries, beaucoup d'abonnés derrière peu d'adresses.
 */
export const DESABONNEMENT_UN_CLIC_ABUSE_POLICY: AbusePolicy = {
  scope: 'desabonnement-un-clic',
  limit: 600,
  windowMs: HOUR,
  blockMs: HOUR,
};

/** Clavardage public : 120 messages par IP et par heure (LIMITS.chat_ip) ; chaque message peut coûter un appel d'IA. */
export const CHAT_ABUSE_POLICY: AbusePolicy = {
  scope: 'chat',
  limit: 120,
  windowMs: HOUR,
  blockMs: HOUR,
};

/** Page d'autorisation OAuth (essai d'une clé) : 10 essais par 15 minutes (LIMITS.mcp_authorize). */
export const OAUTH_AUTORISATION_ABUSE_POLICY: AbusePolicy = {
  scope: 'oauth-autorisation',
  limit: 10,
  windowMs: 15 * MINUTE,
  blockMs: 15 * MINUTE,
};

/** Rapports CSP envoyés par les navigateurs : 60 par IP et par minute (écrit pour le kit : pas de valeur d'origine). */
export const CSP_RAPPORT_ABUSE_POLICY: AbusePolicy = {
  scope: 'csp-rapport',
  limit: 60,
  windowMs: MINUTE,
  blockMs: 10 * MINUTE,
};

export const ABUSE_POLICIES: readonly AbusePolicy[] = [
  FORMULAIRE_PUBLIC_ABUSE_POLICY,
  CONNEXION_ABUSE_POLICY,
  DESABONNEMENT_ABUSE_POLICY,
  DESABONNEMENT_UN_CLIC_ABUSE_POLICY,
  CHAT_ABUSE_POLICY,
  OAUTH_AUTORISATION_ABUSE_POLICY,
  CSP_RAPPORT_ABUSE_POLICY,
];

/** Message 429 (exemple [à adapter]), à passer en `message` à `enforceSharedAbuseGuard`. */
export function rateLimitMessage(lang: 'fr' | 'en' = 'fr'): string {
  return lang === 'en' ? 'Too many requests. Please try again later.' : 'Trop de requêtes. Réessayez plus tard.';
}
