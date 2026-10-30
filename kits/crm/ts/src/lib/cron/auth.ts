// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/cron/auth.ts, commit 508f19a (2026-10-30) ; généralisé : historique des tâches du projet retiré du commentaire, code repris tel quel.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

// Garde d'authentification unique des routes cron (et de toute tâche planifiée : Vercel Cron, pg_cron).
// Contrat : `Authorization: Bearer $CRON_SECRET` (ce qu'envoie Vercel Cron),
// comparé à temps constant. Le jeton en paramètre d'URL (`?token=`) est
// refusé : il finit en clair dans les journaux d'accès.
// Secret absent : 401 générique (la configuration n'est pas révélée), jamais d'accès ouvert.

function safeEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // timingSafeEqual lève si les longueurs diffèrent : on compare d'abord la longueur.
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeCronRequest(request: NextRequest): NextResponse | null {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    // Réponse générique : ne pas révéler l'état de la configuration à un appelant anonyme.
    console.error('[cron] CRON_SECRET missing');
    return NextResponse.json({ ok: false, error: 'Unauthorized cron request' }, { status: 401 });
  }

  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  // `?token=` n'est jamais lu : il exposerait le secret dans les journaux d'URL.
  if (!safeEqual(configuredSecret, bearer)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized cron request' }, { status: 401 });
  }

  return null;
}
