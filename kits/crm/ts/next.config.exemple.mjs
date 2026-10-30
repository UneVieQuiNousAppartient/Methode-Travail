// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, next.config.mjs (headers), commit 508f19a (2026-10-30) ; généralisé : seuls les en-têtes de sécurité et la CSP du kit (observation → actif) ; redirections et réécritures du projet retirées.
// Exemple à fusionner dans le next.config.mjs du projet (ne pas copier tel quel par-dessus un fichier existant).
import { cspHeader, cspSource } from './src/lib/security/csp-policy.mjs';

/**
 * Routes qui posent leur PROPRE politique, plus stricte (`default-src 'none'`), dans leur réponse :
 * exclues de la CSP globale [à adapter]. Exemple : ['api/oauth/authorize'].
 */
const ROUTES_A_POLITIQUE_PROPRE = [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // CSP_MODE absente → Content-Security-Policy-Report-Only (observation) ; CSP_MODE=actif → bloquante.
        // La variable est lue au build : redéployer après l'avoir changée.
        source: cspSource(ROUTES_A_POLITIQUE_PROPRE),
        headers: [cspHeader()],
      },
    ];
  },
};

export default nextConfig;
