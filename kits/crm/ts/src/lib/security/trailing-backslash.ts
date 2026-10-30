// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/trailing-backslash.ts, commit 508f19a (2026-10-30) ; généralisé : noms de pages du projet remplacés par des exemples.
/**
 * En production, une adresse de page existante suivie d'une barre oblique
 * inverse encodée (`/a-propos%5C`) faisait planter le chargeur
 * de Next.js sur Vercel (`Cannot find module './.next/server/pages/a-propos%5C.js'`) : erreur 500 au lieu
 * de 404. Le middleware (`middleware.ts` ou `proxy.ts`) doit répondre 404 à ces adresses avant le chargeur.
 *
 * 404 plutôt qu'une redirection 308 vers l'adresse nettoyée : `//exemple.com%5C` nettoyé donnerait
 * `//exemple.com`, adresse relative au protocole (redirection ouverte). Ces adresses ne viennent que de robots.
 */
const TRAILING_BACKSLASH = /(?:\\|%5c)$/i;

/** Vrai si le chemin (brut ou décodé) se termine par « \ » ou « %5C » (insensible à la casse). */
export function endsWithBackslash(pathname: string): boolean {
  if (TRAILING_BACKSLASH.test(pathname)) return true;
  try {
    return decodeURIComponent(pathname).endsWith('\\');
  } catch {
    return false;
  }
}
