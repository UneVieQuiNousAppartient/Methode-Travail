// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/internal-redirect.ts, commit 508f19a (2026-10-30) ; généralisé : composants et domaine du projet retirés des commentaires, préfixes en paramètre (déjà) ; issues d'origine #150, #151 (caractères ambigus), #239 (Referer).
// Validation des chemins de redirection internes (anti open-redirect / XSS).
//
// Module PUR : aucun import serveur, volontairement. Il est utilisé aussi bien
// par les routes API (connexion, retour après action) que par des composants
// client qui écrivent dans `window.location` ou rendent un lien. Un module qui
// importe `next/server` ou le client Supabase admin ne doit jamais être tiré
// dans un bundle client : d'où ce module séparé.
//
// Pourquoi la liste noire d'origine ne suffisait pas :
// la norme URL (WHATWG) retire les tabulations, LF et CR de toute URL avant de
// l'analyser. `/\t/evil.com` passait donc le contrôle « deuxième caractère ≠ `/` »
// puis devenait `//evil.com` — une URL protocole-relative vers un autre site —
// dans `new URL(...)` ou dans la redirection du navigateur.
//
// Approche : on refuse d'abord tout caractère ambigu, puis on laisse l'analyseur
// d'URL résoudre le chemin (`.`/`..` compris) et on valide le RÉSULTAT, pas
// seulement la chaîne d'entrée. Sans ce second contrôle, `/.//evil.com` se
// résoudrait en `//evil.com`.

const PLACEHOLDER_ORIGIN = 'http://x.invalid';

// Caractères de contrôle (dont tab, LF, CR), espaces (dont l'insécable U+00A0)
// et antislash : les navigateurs les retirent (tab, LF, CR), les réécrivent en `/`
// (antislash) ou les traitent de façon ambiguë pendant l'analyse d'une URL.
// eslint-disable-next-line no-control-regex -- la plage \u0000-\u001F est justement ce qu'on veut refuser
const FORBIDDEN_CHARACTERS = /[\u0000-\u001F\u007F\s\\]/;

export interface InternalRedirectOptions {
  /**
   * Préfixes de chemin autorisés (ex. `['/admin']`). Un chemin passe s'il
   * est égal au préfixe, ou s'il le prolonge par `/`, `?` ou `#` — donc
   * `/adminevil` est refusé. Sans cette option, tout chemin interne est accepté.
   */
  allowedPrefixes?: readonly string[];
}

/**
 * Retourne `value` si c'est un chemin interne sûr (même origine garantie),
 * sinon `fallback`. Ne lève jamais d'exception.
 */
export function normalizeInternalRedirectPath(
  value: string | null | undefined,
  fallback: string,
  options?: InternalRedirectOptions,
): string {
  // Le type ne protège pas à l'exécution : un `link` lu dans du JSON peut être
  // un nombre ou un objet, et `.trim()` lèverait.
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();

  // Doit être un chemin interne absolu, jamais une URL vers un autre hôte
  // (`https://…`) ni un schéma exécutable (`javascript:…`).
  if (!candidate.startsWith('/')) return fallback;

  // Caractères de contrôle, espaces, antislash : voir plus haut.
  if (FORBIDDEN_CHARACTERS.test(candidate)) return fallback;

  // `//hôte` : URL protocole-relative.
  if (candidate[1] === '/') return fallback;

  let path: string;
  try {
    const url = new URL(candidate, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    path = url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }

  // Contrôle APRÈS résolution : `/.//evil.com` donne `//evil.com`.
  if (path.startsWith('//') || path.includes('\\')) return fallback;

  const prefixes = options?.allowedPrefixes;
  if (prefixes) {
    const allowed = prefixes.some(
      (prefix) =>
        path === prefix ||
        path.startsWith(`${prefix}/`) ||
        path.startsWith(`${prefix}?`) ||
        path.startsWith(`${prefix}#`),
    );
    if (!allowed) return fallback;
  }

  return path;
}

/**
 * Chemin de retour tiré de l'en-tête `Referer`. Le `Referer` est une URL
 * COMPLÈTE (`https://exemple.test/admin/avis?statut=attente`) : passée telle quelle à
 * `normalizeInternalRedirectPath`, qui n'accepte qu'un chemin, elle était toujours refusée et
 * l'utilisateur revenait sur la liste sans ses filtres. On ne garde `pathname + search` que si
 * l'origine du `Referer` est celle de la requête, puis on applique les mêmes contrôles qu'à tout
 * chemin interne. Pur, ne lève jamais.
 */
export function refererRedirectPath(
  referer: string | null | undefined,
  requestOrigin: string,
  fallback: string,
  options?: InternalRedirectOptions,
): string {
  if (typeof referer !== 'string' || !referer.trim()) return fallback;
  let url: URL;
  try {
    url = new URL(referer.trim());
  } catch {
    return fallback;
  }
  if (url.origin !== requestOrigin) return fallback;
  return normalizeInternalRedirectPath(url.pathname + url.search, fallback, options);
}
