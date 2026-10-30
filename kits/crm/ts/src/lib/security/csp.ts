// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/csp.ts, commit 508f19a (2026-10-30) ; généralisé : historique du projet retiré, exports du kit ; le résumé des rapports de la seconde source (resumeRapport) est couvert par summarizeCspReports, plus strict (origine seule de la ressource bloquée).
/**
 * Content-Security-Policy du site : directives dans `csp-policy.mjs` (lues aussi par next.config).
 * Les violations sont envoyées à /api/csp-rapport et résumées dans les journaux, sans donnée personnelle.
 * Reste à faire, projet par projet : remplacer 'unsafe-inline' des scripts par des nonces.
 */
import { buildContentSecurityPolicy, CSP_REPORT_PATH, cspHeader, cspHeaderName, cspMode, cspSource } from './csp-policy.mjs';

export { buildContentSecurityPolicy, CSP_REPORT_PATH, cspHeader, cspHeaderName, cspMode, cspSource };

export type CspViolationSummary = {
  directive: string;
  blocked: string;
  page: string;
};

function originOnly(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'inconnu';
  // 'inline', 'eval', 'data'… ne sont pas des URL : on les garde tels quels.
  if (!value.includes('://')) return value.slice(0, 40);
  try {
    return new URL(value).origin;
  } catch {
    return 'invalide';
  }
}

function pathOnly(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'inconnu';
  try {
    // Jamais la chaîne de requête ni le fragment : ils peuvent contenir des données personnelles (Loi 25).
    return new URL(value).pathname.slice(0, 120);
  } catch {
    return 'invalide';
  }
}

/**
 * Réduit un rapport de violation (format `application/csp-report` ou `application/reports+json`)
 * à ce qui sert au diagnostic, sans aucune donnée personnelle : directive, origine bloquée, chemin de la page.
 */
export function summarizeCspReports(body: unknown): CspViolationSummary[] {
  const raw: unknown[] = Array.isArray(body) ? body : [body];
  const summaries: CspViolationSummary[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const report = (record['csp-report'] ?? record.body) as Record<string, unknown> | undefined;
    if (!report || typeof report !== 'object') continue;
    const directive = report['effective-directive'] ?? report.effectiveDirective ?? report['violated-directive'];
    summaries.push({
      directive: typeof directive === 'string' ? directive.slice(0, 40) : 'inconnu',
      blocked: originOnly(report['blocked-uri'] ?? report.blockedURL),
      page: pathOnly(report['document-uri'] ?? report.documentURL),
    });
  }
  return summaries;
}
