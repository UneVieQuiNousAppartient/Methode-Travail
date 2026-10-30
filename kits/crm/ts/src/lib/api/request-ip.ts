// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/request-ip.ts, commit 508f19a (2026-10-30) ; généralisé : références d'issue et de modules propres au projet retirées.
// Adresse IP du client, en un seul endroit : utilisée par l'anti-abus (`abuse-guard.ts`), Turnstile et tout
// journal d'actions. Module pur, sans import : il peut être chargé côté navigateur sans tirer `node:crypto` ni Supabase.
//
// Ordre : `x-vercel-forwarded-for` (posé par Vercel, le client ne peut pas le fixer),
// puis `x-real-ip`, puis le premier élément de `x-forwarded-for`.
// CONDITION DE DÉPLOIEMENT : aucun relais non fiable (CDN, proxy tiers) devant Vercel. Avec un tel relais,
// ces en-têtes porteraient l'adresse du relais, ou une valeur choisie par le client : revoir cet ordre.
export type HeaderSource = { headers: { get(name: string): string | null | undefined } } | null | undefined;

const first = (value: string | null | undefined) => value?.split(',')[0]?.trim() || null;

/** IP du client, ou `null` si aucun en-tête ne la donne. */
export function clientIp(request: HeaderSource): string | null {
  if (!request?.headers) return null;
  return (
    first(request.headers.get('x-vercel-forwarded-for')) ||
    request.headers.get('x-real-ip')?.trim() ||
    first(request.headers.get('x-forwarded-for'))
  );
}
