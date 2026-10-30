// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/app/api/desabonnement/route.ts, commit 7873e8f (2026-10-30) ; généralisé : adresse du site par site-url.ts, client par server-admin.ts, table des leads en paramètre, désabonnement de l'adresse par optOutAddress (port de la seconde source), débit limité (politiques du kit), POST « un clic » RFC 8058 → 200 sans page.
// Désabonnement des relances automatiques (loi anti-pourriel, LCAP).
//   GET  ?l=<lead>&t=<jeton> : page de confirmation (ouvrir le lien ne désabonne pas : les antivirus de
//        messagerie ouvrent les liens) ;
//   POST ?l=<lead>&t=<jeton> : désabonnement — bouton de la page (réponse : page « C'est fait »), ou
//        « Se désabonner » de la messagerie (RFC 8058, corps « List-Unsubscribe=One-Click » : réponse 200 vide).
// Page dans la langue de la fiche (colonne `lang` facultative) ; lien invalide ou panne : français puis anglais.
// Nom affiché : SITE_NAME ; courriel de contact : CONTACT_EMAIL (facultatifs).
import { NextRequest } from 'next/server';
import { enforceSharedAbuseGuard } from '@/lib/api/abuse-guard';
import { DESABONNEMENT_ABUSE_POLICY, DESABONNEMENT_UN_CLIC_ABUSE_POLICY, rateLimitMessage } from '@/lib/api/abuse-policies';
import { jetonValide, leadsTable, optOutAddress, pageDesabonnement, secretDesabonnement, type EtatDesabonnement, type LangueDesabonnement, type OptOutClient } from '@/lib/email/desabonnement';
import { getPublicSiteUrl } from '@/lib/site/site-url';
import { getSupabaseAdmin } from '@/lib/supabase/server-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_CORPS = 1024;
const STATUT: Record<EtatDesabonnement, number> = { confirmer: 200, fait: 200, deja: 200, invalide: 400, limite: 429, erreur: 503 };

type Fiche = { id: string; email: string; email_opt_out_at: string | null; lang?: string | null };

function page(etat: EtatDesabonnement, o: { lang?: LangueDesabonnement; email?: string; depuis?: string | null; action?: string } = {}) {
  const html = pageDesabonnement(etat, {
    lang: o.lang ?? 'les-deux',
    site: process.env.SITE_NAME?.trim() || '',
    siteUrl: getPublicSiteUrl(),
    contactEmail: process.env.CONTACT_EMAIL?.trim() || '',
    email: o.email,
    depuis: o.depuis,
    action: o.action,
  });
  return new Response(html, {
    status: STATUT[etat],
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

const langue = (fiche: Fiche): 'fr' | 'en' => (fiche.lang === 'en' ? 'en' : 'fr');

async function ficheVerifiee(req: NextRequest, client: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<Fiche | null> {
  const l = req.nextUrl.searchParams.get('l') || '';
  const t = req.nextUrl.searchParams.get('t') || '';
  const cle = secretDesabonnement();
  if (!l || !t || !cle || !/^[0-9a-f-]{36}$/i.test(l)) return null;
  // select('*') : la colonne lang est facultative ; sans elle, le français.
  const { data, error } = await client.from(leadsTable()).select('*').eq('id', l).maybeSingle();
  if (error) throw new Error(error.message);
  const fiche = data as Fiche | null;
  if (!fiche || !jetonValide(fiche.id, fiche.email, t, cle)) return null;
  return fiche;
}

/** Corps du POST lu avec plafond (le « un clic » ne fait que quelques octets) : au-delà de MAX_CORPS, lecture arrêtée. */
async function corps(req: NextRequest): Promise<string> {
  if (Number(req.headers.get('content-length') || 0) > MAX_CORPS || !req.body) return '';
  const reader = req.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > MAX_CORPS) {
        await reader.cancel().catch(() => {});
        return '';
      }
      morceaux.push(value);
    }
  } catch {
    return '';
  }
  return new TextDecoder().decode(Buffer.concat(morceaux));
}

export async function GET(req: NextRequest) {
  const limite = await enforceSharedAbuseGuard(req, DESABONNEMENT_ABUSE_POLICY, { message: rateLimitMessage() });
  if (limite) return page('limite');
  const client = getSupabaseAdmin();
  if (!client) return page('erreur');
  try {
    const fiche = await ficheVerifiee(req, client);
    if (!fiche) return page('invalide');
    if (fiche.email_opt_out_at) return page('deja', { lang: langue(fiche), email: fiche.email, depuis: fiche.email_opt_out_at });
    return page('confirmer', { lang: langue(fiche), email: fiche.email, action: `${req.nextUrl.pathname}${req.nextUrl.search}` });
  } catch (e) {
    console.error('[desabonnement] GET :', e instanceof Error ? e.message : e);
    return page('erreur');
  }
}

export async function POST(req: NextRequest) {
  const unClic = /List-Unsubscribe=One-Click/i.test(await corps(req));
  const limite = await enforceSharedAbuseGuard(req, unClic ? DESABONNEMENT_UN_CLIC_ABUSE_POLICY : DESABONNEMENT_ABUSE_POLICY, { message: rateLimitMessage() });
  if (limite) return unClic ? limite : page('limite');
  const client = getSupabaseAdmin();
  if (!client) return unClic ? new Response(null, { status: 503 }) : page('erreur');
  try {
    const fiche = await ficheVerifiee(req, client);
    if (!fiche) return unClic ? new Response(null, { status: 400 }) : page('invalide');
    if (!fiche.email_opt_out_at) await optOutAddress(client as unknown as OptOutClient, fiche, unClic ? 'one-click' : 'lien');
    if (unClic) return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    if (fiche.email_opt_out_at) return page('deja', { lang: langue(fiche), email: fiche.email, depuis: fiche.email_opt_out_at });
    return page('fait', { lang: langue(fiche), email: fiche.email });
  } catch (e) {
    console.error('[desabonnement] POST :', e instanceof Error ? e.message : e);
    return unClic ? new Response(null, { status: 503 }) : page('erreur');
  }
}
