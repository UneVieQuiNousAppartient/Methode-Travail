// Kit CRM TS (methode-travail) — origine : KHI Educ, lib/siteUrl.js, commit 2954590 (2026-10-27) ; généralisé : porté en TypeScript strict, exemple de domaine du projet retiré.
// URL publique du site — une seule source : NEXT_PUBLIC_SITE_URL.
//
// Tant que le domaine du client n'est pas branché, la variable peut rester vide :
// sur Vercel, on se rabat alors sur l'URL de production fournie par la plateforme
// (VERCEL_PROJECT_PRODUCTION_URL, ex. mon-projet.vercel.app) — ce n'est
// pas un domaine deviné, c'est celui qui sert réellement le site. Sinon, les liens
// absolus sont omis (courriels, IA, llms.txt). Aucun domaine en dur nulle part
// (exemple commenté `domaine-en-dur` de scripts/check-rules.mjs). Utilisable côté serveur et côté navigateur.

const raw = (): string => {
  const u = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (u) return u;
  const v = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/\/+$/, '');
  return v ? `https://${v.replace(/^https?:\/\//, '')}` : '';
};

export type SiteUrlSource = 'env' | 'vercel' | 'none';

/** D'où vient l'URL : "env" (NEXT_PUBLIC_SITE_URL), "vercel" (repli plateforme) ou "none". */
export const siteUrlSource = (): SiteUrlSource =>
  process.env.NEXT_PUBLIC_SITE_URL ? 'env' : process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'vercel' : 'none';

/** URL configurée, sans slash final ("" si absente). */
export const getSiteUrl = (): string => raw();

/** URL utilisable publiquement (https, ni vide ni locale, sans chemin) — sinon "". */
export const getPublicSiteUrl = (): string => {
  const u = raw();
  return /^https:\/\/[^/\s]+$/i.test(u) && !/^https:\/\/(localhost|127\.)/i.test(u) ? u : '';
};

/** Chemin absolu si l'URL publique est connue, sinon le chemin relatif tel quel. */
export const absoluteUrl = (path = '/'): string => {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getPublicSiteUrl();
  return base ? `${base}${p}` : p;
};
