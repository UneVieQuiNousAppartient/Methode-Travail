// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/lib/crm/conservation.ts, commit 59e389a (2026-10-30) ; généralisé : durée de conservation fixée par un client → RETENTION_MONTHS obligatoire (aucun défaut silencieux), secret d'empreinte PRIVACY_HASH_SECRET seul (aucun repli : une clé, un usage), champs de date de la fiche en paramètre [à adapter].
//
// Conservation limitée et empreinte d'effacement (Loi 25) — règles pures. Rien ne s'efface tout seul :
// l'administration liste les fiches sans activité depuis RETENTION_MONTHS mois, une personne vérifie et
// supprime (`effacement.ts`). Seule une EMPREINTE du courriel d'une personne effacée reste, pour ne plus
// jamais lui écrire.
//
// RETENTION_MONTHS est OBLIGATOIRE : sans valeur (ou valeur invalide), `retentionMonths()` lève avec un
// message clair. Exemple [à adapter] : RETENTION_MONTHS=36 (3 ans sans contact). Les FACTURES ne suivent pas
// cette règle : elles suivent la loi fiscale (durée de conservation des pièces comptables), hors de ce module.
import { createHmac } from 'node:crypto';

type Env = Record<string, string | undefined>;

export const MIN_HASH_SECRET = 32;
export const RETENTION_MAX_MONTHS = 120;

/**
 * Durée de conservation en mois, lue dans RETENTION_MONTHS. Lève si absente ou invalide (entier de 1 à 120) :
 * jamais de durée par défaut silencieuse.
 */
export function retentionMonths(env: Env = process.env): number {
  const raw = (env.RETENTION_MONTHS ?? '').trim();
  if (!raw) throw new Error('RETENTION_MONTHS manquant : fixez la durée de conservation en mois (exemple : 36). Aucune durée par défaut.');
  if (!/^\d+$/.test(raw)) throw new Error(`RETENTION_MONTHS invalide (« ${raw.slice(0, 20)} ») : un nombre entier de mois est attendu (exemple : 36).`);
  const months = Number(raw);
  if (months < 1 || months > RETENTION_MAX_MONTHS) throw new Error(`RETENTION_MONTHS invalide (${months}) : de 1 à ${RETENTION_MAX_MONTHS} mois.`);
  return months;
}

/** [à adapter] Dates d'une fiche qui comptent comme activité. */
export type Dates = { created_at: string; status_changed_at?: string | null; last_contact_at?: string | null; relance_sent_at?: string | null };

function checkMonths(mois: number): number {
  if (!Number.isInteger(mois) || mois < 1 || mois > RETENTION_MAX_MONTHS) throw new Error('Durée de conservation invalide (mois entier de 1 à 120) : voir RETENTION_MONTHS.');
  return mois;
}

/** Dernière activité d'une fiche : création, changement d'étape, dernier contact, dernière relance. */
export function derniereActivite(l: Dates): Date | null {
  const t = [l.created_at, l.status_changed_at, l.last_contact_at, l.relance_sent_at]
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  return t.length ? new Date(Math.max(...t)) : null;
}

/** Date à partir de laquelle la fiche peut être supprimée : dernière activité + `mois` mois civils (UTC). `mois` obligatoire. */
export function aConserverJusquau(l: Dates, mois: number): Date | null {
  checkMonths(mois);
  const d = derniereActivite(l);
  if (!d) return null;
  const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, 1));
  const dernierJour = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d.getUTCDate(), dernierJour));
  f.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  return f;
}

/** Sans activité depuis au moins `mois` mois ? Une fiche sans date lisible n'est JAMAIS proposée. */
export const aSupprimer = (l: Dates, maintenant: Date, mois: number): boolean => {
  const f = aConserverJusquau(l, mois);
  return Boolean(f && f.getTime() <= maintenant.getTime());
};

/**
 * Secret de l'empreinte : PRIVACY_HASH_SECRET, 32 caractères ou plus. Aucun repli (pas même UNSUBSCRIBE_SECRET :
 * une clé ne sert qu'à un usage). Absent ou trop court → '' → l'effacement est refusé.
 * Changer ce secret empêche de reconnaître les empreintes déjà écrites : chaque empreinte garde l'identifiant
 * de sa clé (`hashKeyId`).
 */
export function privacyHashSecret(env: Env = process.env): string {
  const own = env.PRIVACY_HASH_SECRET ?? '';
  return own.length >= MIN_HASH_SECRET ? own : '';
}

/** Identifiant court de la clé (8 caractères), jamais la clé : savoir quelles empreintes ne se reconnaissent plus. */
export const hashKeyId = (cle: string): string => (cle ? createHmac('sha256', cle).update('kid').digest('hex').slice(0, 8) : '');

/** Empreinte du courriel d'une personne (HMAC, jamais le courriel lui-même). '' sans secret ou sans courriel. */
export const empreinteCourriel = (courriel: string, cle: string): string =>
  cle && courriel.trim() ? createHmac('sha256', cle).update(`efface:${courriel.trim().toLowerCase()}`).digest('hex') : '';

/** Motif ILIKE échappé (« \ », « % » et « _ » littéraux) : aucun joker ne vise une autre adresse. */
export const motifExact = (courriel: string): string => courriel.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
