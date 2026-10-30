// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/csp-policy.mjs, commit 508f19a (2026-10-30) + Vie Solution Web, src/lib/csp.ts (mode observation, upgrade-insecure-requests, websocket en dev), commit 7873e8f (2026-10-30) ; généralisé : tiers propres au projet retirés (mesure d'audience, vidéo, WebAssembly des PDF), origines tierces en paramètre (CSP_EXTRA_ORIGINS), routes à politique propre en paramètre, mode CSP_MODE=observation|actif.
// Directives de la CSP. Fichier .mjs pour être lu à la fois par next.config.mjs et par le code TypeScript.
//
// Deux temps (défaut d'un nouveau projet : « observation ») :
//   CSP_MODE absente ou « observation » → Content-Security-Policy-Report-Only : rien n'est bloqué, le
//     navigateur envoie ses rapports à CSP_REPORT_PATH (journaux) ;
//   CSP_MODE=actif → Content-Security-Policy : BLOQUANTE. Passer en actif quand les journaux sont propres
//     (aucune violation légitime pendant quelques jours de trafic réel) — voir ts/BRIQUE.md.
export const CSP_REPORT_PATH = '/api/csp-rapport';

/** Origines toujours invitées : Cloudflare Turnstile (widget et vérification, brique anti-robots du kit). */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Chemin `source` de next.config pour la CSP globale : tous les chemins SAUF ceux qui posent leur propre
 * politique plus stricte (ex. `['api/oauth/authorize']`, sans « / » initial). Next n'ajoute pas un en-tête
 * déjà posé par la réponse : une route stricte doit donc être exclue ici.
 * @param {readonly string[]} [ownPolicyPrefixes]
 * @returns {string}
 */
export function cspSource(ownPolicyPrefixes = []) {
  const escaped = ownPolicyPrefixes.map((p) => p.replace(/^\/+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.length ? `/((?!${escaped.join('|')}).*)` : '/(.*)';
}

/** @returns {'observation' | 'actif'} */
export function cspMode() {
  return String(process.env.CSP_MODE ?? '').trim().toLowerCase() === 'actif' ? 'actif' : 'observation';
}

/** @param {'observation' | 'actif'} [mode] */
export function cspHeaderName(mode = cspMode()) {
  return mode === 'actif' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}

// Le projet Supabase exact (et non *.supabase.co, qui accepterait le projet de n'importe qui).
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
    return [url.origin, `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Origines tierces du projet (CSP_EXTRA_ORIGINS, séparées par des virgules ou des espaces), ajoutées à
 * script-src, connect-src, img-src et frame-src. Seules des origines https exactes sont gardées (pas de
 * chemin, pas de joker seul, pas de « https: » nu) : une valeur mal écrite est ignorée, jamais élargie.
 * @returns {string[]}
 */
export function extraOrigins() {
  return String(process.env.CSP_EXTRA_ORIGINS ?? '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(v));
}

/** Développement SEULEMENT (`next dev`) : React s'y sert d'eval() pour ses outils de débogage. Jamais sur Vercel. */
function isLocalDev() {
  return process.env.NODE_ENV === 'development' && !process.env.VERCEL;
}

/** @returns {Record<string, string[]>} */
export function cspDirectives() {
  const dev = isLocalDev();
  const extra = extraOrigins();
  return {
    'default-src': ["'self'"],
    // Next.js injecte des scripts en ligne (hydratation, JSON-LD) : 'unsafe-inline' tant qu'il n'y a pas de nonces.
    // Jamais 'unsafe-eval' hors développement local (test dans csp.test.ts).
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), TURNSTILE_ORIGIN, ...extra],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...extra],
    'font-src': ["'self'", 'data:'],
    // ws: en développement : rechargement à chaud de Next.
    'connect-src': ["'self'", ...supabaseOrigins(), TURNSTILE_ORIGIN, ...extra, ...(dev ? ['ws:'] : [])],
    'frame-src': [TURNSTILE_ORIGIN, ...extra],
    'frame-ancestors': ["'none'"],
    // Aucun formulaire du site ne poste ailleurs.
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
}

/**
 * Texte de l'en-tête. En observation, `upgrade-insecure-requests` est omis (le navigateur l'ignore et le
 * signale en Report-Only) ; il l'est aussi en développement local (http://localhost).
 * @param {{ mode?: 'observation' | 'actif' }} [options]
 * @returns {string}
 */
export function buildContentSecurityPolicy({ mode = cspMode() } = {}) {
  const parts = Object.entries(cspDirectives()).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (mode === 'actif' && !isLocalDev()) parts.push('upgrade-insecure-requests');
  parts.push(`report-uri ${CSP_REPORT_PATH}`);
  return parts.join('; ');
}

/**
 * En-tête prêt pour `headers()` de next.config : nom selon le mode, valeur de la politique.
 * @param {{ mode?: 'observation' | 'actif' }} [options]
 * @returns {{ key: string, value: string }}
 */
export function cspHeader({ mode = cspMode() } = {}) {
  return { key: cspHeaderName(mode), value: buildContentSecurityPolicy({ mode }) };
}
