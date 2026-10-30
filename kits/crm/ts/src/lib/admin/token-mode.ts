// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/admin/token-mode.ts, commit 508f19a (2026-10-30) ; généralisé : message [à adapter] sans les variables propres à la source.
//
// Mot de passe partagé (« mode jeton ») interdit en ligne. Le kit ne FOURNIT PAS de mode jeton : un accès par
// mot de passe commun donne tous les droits sans identité nominative (donc sans double vérification ni auteur
// dans le journal). Cette garde sert à un projet qui en a hérité, et au point de santé (verdict « mode jeton »).
// Verrou unique, fermé par défaut :
// - refusé dès que `VERCEL` est défini et non vide (posé par la plateforme en production ET sur les aperçus) ;
// - refusé quand `NODE_ENV === 'production'` (ex. `next start`), sauf `ADMIN_TOKEN_MODE_LOCAL=1` hors Vercel ;
// - permis en développement et dans les tests (Vitest : `NODE_ENV=test`).
// Module pur, sans import.

/** [à adapter] Message affiché quand quelqu'un tente l'accès par mot de passe partagé en ligne. */
export const TOKEN_MODE_REFUSED_MESSAGE =
  "La connexion par mot de passe partagé est désactivée en ligne. Connectez-vous avec votre adresse courriel.";

export function isTokenModeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL?.trim()) return false;
  if (env.NODE_ENV === 'production') return env.ADMIN_TOKEN_MODE_LOCAL?.trim() === '1';
  return true;
}
