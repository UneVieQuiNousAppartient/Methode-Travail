// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/app/api/csp-report/route.ts, commit 508f19a (2026-10-30) + Vie Solution Web, src/app/api/csp-rapport/route.ts (nom de la route, type de contenu), commit 7873e8f (2026-10-30) ; généralisé : politique de débit du kit (CSP_RAPPORT_ABUSE_POLICY), corps lu avec plafond même sans content-length.
/**
 * POST /api/csp-rapport — reçoit les violations de la CSP (mode observation ou actif).
 * Journalise un résumé sans donnée personnelle (directive, origine bloquée, chemin) et répond 204.
 * Rien n'est enregistré en base. Débit : compteur en mémoire (un rapport ne vaut pas un appel à la base).
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceAbuseGuard, readJsonBodyWithLimit, validateJsonRequest } from '@/lib/api/abuse-guard';
import { CSP_RAPPORT_ABUSE_POLICY } from '@/lib/api/abuse-policies';
import { summarizeCspReports } from '@/lib/security/csp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const CSP_REPORT_MAX_BYTES = 8 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Les navigateurs envoient `application/csp-report` ou `application/reports+json` : pas d'exigence de type.
  const invalid = validateJsonRequest(request, { maxBytes: CSP_REPORT_MAX_BYTES, requireJsonContentType: false });
  if (invalid) return invalid;

  const limited = enforceAbuseGuard(request, CSP_RAPPORT_ABUSE_POLICY);
  if (limited) return limited;

  const read = await readJsonBodyWithLimit(request, CSP_REPORT_MAX_BYTES);
  if (!read.ok) return read.response;
  // Rapport illisible : ignoré, jamais d'erreur pour le navigateur.
  for (const violation of summarizeCspReports(read.body)) {
    console.warn('[csp-rapport]', JSON.stringify(violation));
  }
  return new NextResponse(null, { status: 204 });
}
