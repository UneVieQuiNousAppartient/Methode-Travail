// Kit CRM TS (methode-travail) — origine : Vie Solution Web, src/lib/admin/mfa.ts (genererCodesSecours, alphabet, normaliserCodeSecours, estFormatCodeSecours, empreinteCodeSecours, LONGUEUR_MIN_SECRET) et src/lib/admin/mfa-store.ts (utiliserCodeSecours par RPC atomique), commit 59e389a (2026-10-30) ; généralisé : 10 codes par membre (table mfa_backup_codes) au lieu d'une liste unique dans les réglages, préfixe HMAC neutre, secret MFA_BACKUP_SECRET sans repli ; écrit pour le kit : la session de récupération d'une heure au-dessus de Supabase Auth (la source n'utilise pas Supabase Auth).
//
// Codes de secours de la double vérification.
//
// Supabase Auth n'a pas de codes de secours, et un code de secours accepté ne fait PAS passer la session en aal2.
// Conception retenue (à revoir par `securite` avant la mise en ligne) :
// - 10 codes « XXXX-XXXX » par membre, montrés UNE fois ; seule leur empreinte HMAC (clé = MFA_BACKUP_SECRET,
//   32 caractères ou plus, aucun repli) est gardée en base ;
// - un code juste est consommé de façon atomique en base (`consume_mfa_backup_code` : une seule instruction
//   `update … where used_at is null`) : deux requêtes simultanées avec le même code → une seule réussit ;
// - effet : les facteurs du membre sont retirés, ses appareils de confiance révoqués, ses AUTRES sessions fermées,
//   et la session courante reçoit
//   une « session de récupération » (`mfa_trusted_sessions`, raison `backup_code`) d'UNE heure. Cette ligne ne
//   satisfait JAMAIS la double vérification (ni ici, ni dans `mfa_session_ok()`) : elle autorise seulement à
//   réinscrire un facteur. Après une heure sans réinscription, il faut un autre code ;
// - un membre qui a des codes en base a déjà été inscrit : la double vérification reste exigée même sans facteur
//   (sinon retirer le facteur l'éteindrait), et l'inscription d'un nouveau facteur n'est permise que pendant la
//   récupération (sinon le mot de passe seul suffirait à remplacer le facteur) ;
// - les autres codes restent valables ; une nouvelle série efface toutes les anciennes empreintes.
import { createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MfaState } from '@/lib/auth/types';

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_SECRET_MIN_LENGTH = 32;
/** Durée de la session de récupération ouverte par un code juste. */
export const RECOVERY_MINUTES = 60;

export const BACKUP_CODES_TABLE = 'mfa_backup_codes';
export const TRUSTED_SESSIONS_TABLE = 'mfa_trusted_sessions';
export const TRUSTED_DEVICES_TABLE = 'mfa_trusted_devices';
export const CONSUME_BACKUP_CODE_RPC = 'consume_mfa_backup_code';
export const REPLACE_BACKUP_CODES_RPC = 'replace_mfa_backup_codes';

/** Sans 0/O ni 1/I : se recopie sans erreur. 32 signes : `octet % 32` est sans biais (256 = 8 × 32). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HMAC_LABEL = 'mfa-backup|';

type Env = Record<string, string | undefined>;

/** [à adapter] Messages montrés au membre. Jamais de détail technique ni d'indice sur le code. */
export const BACKUP_CODE_MESSAGES = {
  invalid: 'Ce code de secours n’est pas valide ou a déjà servi.',
  unavailable: 'Les codes de secours ne sont pas disponibles pour le moment. Contactez un administrateur.',
  incomplete: 'Le code a été accepté, mais la réinitialisation n’a pas abouti. Réessayez avec un autre code ou contactez un administrateur.',
} as const;

/** MFA_BACKUP_SECRET s'il a 32 caractères ou plus ; sinon `null` (et alors rien n'est généré ni accepté). */
export function backupSecret(env: Env = process.env): string | null {
  const value = env.MFA_BACKUP_SECRET ?? '';
  return value.length >= BACKUP_SECRET_MIN_LENGTH ? value : null;
}

/** `n` codes distincts « XXXX-XXXX ». `random` remplaçable pour les tests seulement. */
export function generateBackupCodes(n: number = BACKUP_CODE_COUNT, random: (size: number) => Uint8Array = randomBytes): string[] {
  const codes = new Set<string>();
  while (codes.size < n) {
    const chars = Array.from(random(8), (byte) => ALPHABET[byte % 32]).join('');
    codes.add(`${chars.slice(0, 4)}-${chars.slice(4)}`);
  }
  return [...codes];
}

/** Majuscules, sans espaces ni tirets : « abcd efgh », « ABCD-EFGH » → « ABCDEFGH ». */
export const normalizeBackupCode = (code: string): string => code.toUpperCase().replace(/[\s-]/g, '');

/** Huit signes de l'alphabet après normalisation. */
export const isBackupCodeFormat = (code: unknown): code is string =>
  typeof code === 'string' && code.length <= 32 && /^[A-HJ-NP-Z2-9]{8}$/.test(normalizeBackupCode(code));

/** Empreinte HMAC-SHA256 du code normalisé : la base seule ne permet pas de retrouver un code. */
export const hashBackupCode = (code: string, secret: string): string =>
  createHmac('sha256', `${HMAC_LABEL}${secret}`).update(normalizeBackupCode(code)).digest('hex');

export type IssueResult = { ok: true; codes: string[] } | { ok: false; reason: 'secret_missing' | 'db_error' };

/**
 * Nouvelle série pour `userId` : les anciennes empreintes sont effacées et les nouvelles écrites dans la même
 * fonction SQL. Les codes en clair sont rendus UNE fois (à montrer, jamais à journaliser). La route qui l'appelle
 * DOIT d'abord vérifier `backupCodesManageAllowed(member.mfa)` : session en aal2, jamais une session de confiance
 * (un appareil volé régénérerait la série, utiliserait un code, retirerait le facteur et prendrait le compte).
 */
export async function issueBackupCodes(db: SupabaseClient, userId: string, env: Env = process.env): Promise<IssueResult> {
  const secret = backupSecret(env);
  if (!secret) return { ok: false, reason: 'secret_missing' };
  const codes = generateBackupCodes();
  const { error } = await db.rpc(REPLACE_BACKUP_CODES_RPC, { p_user: userId, p_hashes: codes.map((code) => hashBackupCode(code, secret)) });
  if (error) return { ok: false, reason: 'db_error' };
  return { ok: true, codes };
}

/**
 * Efface toutes les empreintes du membre (il retire volontairement sa double vérification, ou il quitte l'équipe).
 * Ces lignes prouvent une inscription passée : la route qui l'appelle vérifie `backupCodesManageAllowed` (aal2), sinon
 * « retirer son facteur puis ses codes » ferait tomber l'exigence de double vérification.
 */
export async function clearBackupCodes(db: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await db.from(BACKUP_CODES_TABLE).delete().eq('user_id', userId);
  return !error;
}

/** Nombre de codes encore utilisables (pour l'écran : « il vous reste N codes »). `null` si la base ne répond pas. */
export async function remainingBackupCodes(db: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await db
    .from(BACKUP_CODES_TABLE)
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);
  return error ? null : (count ?? 0);
}

/**
 * Générer une nouvelle série ou effacer les codes : seulement un membre inscrit dont la session est en aal2 (code de
 * l'application donné dans CETTE session). Une session de confiance (appareil retenu) ne suffit JAMAIS.
 */
export const backupCodesManageAllowed = (mfa: Pick<MfaState, 'enrolled' | 'aal'> | null | undefined): boolean =>
  Boolean(mfa?.enrolled) && mfa?.aal === 'aal2';

export type RedeemResult =
  | { ok: true; recoveryExpiresAt: string }
  | { ok: false; reason: 'secret_missing' | 'no_session' | 'invalid' | 'db_error' | 'incomplete' };

export interface RedeemInput {
  /** Membre vérifié par `auth.getUser` (jamais un identifiant venu du corps de la requête). */
  userId: string;
  /** `session_id` du jeton vérifié : la récupération ne vaut que pour CETTE session. */
  sessionId: string | null;
  /** Jeton d'accès vérifié de la session : sert à fermer les AUTRES sessions du membre. */
  accessToken: string;
  code: unknown;
  env?: Env;
  now?: Date;
}

/**
 * Utilise un code de secours. `db` = client service_role (fonctions SQL et `auth.admin`).
 * - `invalid` : format faux, code inconnu, déjà utilisé, ou d'un autre membre (même réponse : aucun indice).
 *   La route compte chaque `invalid` comme un échec de code (verrou de compte).
 * - `incomplete` : code consommé mais facteurs, appareils ou récupération pas tous traités ; aucune session de
 *   récupération n'est ouverte (il reste les autres codes).
 */
export async function redeemBackupCode(db: SupabaseClient, input: RedeemInput): Promise<RedeemResult> {
  const secret = backupSecret(input.env);
  if (!secret) return { ok: false, reason: 'secret_missing' };
  if (!input.sessionId) return { ok: false, reason: 'no_session' };
  if (!isBackupCodeFormat(input.code)) return { ok: false, reason: 'invalid' };

  const consumed = await db.rpc(CONSUME_BACKUP_CODE_RPC, { p_user: input.userId, p_hash: hashBackupCode(input.code, secret) });
  if (consumed.error) return { ok: false, reason: 'db_error' };
  if (consumed.data !== true) return { ok: false, reason: 'invalid' };

  const now = input.now ?? new Date();
  // 1. Retirer TOUS les facteurs (vérifiés ou non) : Supabase refuse d'inscrire un facteur en aal1 tant qu'un
  //    facteur vérifié existe, et l'ancien est réputé perdu.
  const listed = await db.auth.admin.mfa.listFactors({ userId: input.userId });
  if (listed.error || !listed.data) return { ok: false, reason: 'incomplete' };
  for (const factor of listed.data.factors) {
    const removed = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: input.userId });
    if (removed.error) return { ok: false, reason: 'incomplete' };
  }
  // 2. Révoquer les appareils de confiance (le téléphone perdu peut être accompagné d'un ordinateur perdu).
  const revoked = await db
    .from(TRUSTED_DEVICES_TABLE)
    .update({ revoked_at: now.toISOString() })
    .eq('user_id', input.userId)
    .is('revoked_at', null);
  if (revoked.error) return { ok: false, reason: 'incomplete' };
  // 3. Fermer les autres sessions du membre (l'ordinateur perdu avec le téléphone garderait la sienne).
  const signedOut = await db.auth.admin.signOut(input.accessToken, 'others');
  if (signedOut.error) return { ok: false, reason: 'incomplete' };
  // 4. Ouvrir la récupération pour cette session seulement.
  const recoveryExpiresAt = new Date(now.getTime() + RECOVERY_MINUTES * 60_000).toISOString();
  const opened = await db.from(TRUSTED_SESSIONS_TABLE).upsert(
    { user_id: input.userId, session_id: input.sessionId, device_id: null, reason: 'backup_code', expires_at: recoveryExpiresAt },
    { onConflict: 'user_id,session_id,reason' },
  );
  if (opened.error) return { ok: false, reason: 'incomplete' };
  return { ok: true, recoveryExpiresAt };
}

/** Ferme la récupération de la session (après la réinscription réussie, ou à la déconnexion). */
export async function endRecovery(db: SupabaseClient, userId: string, sessionId: string): Promise<boolean> {
  const { error } = await db
    .from(TRUSTED_SESSIONS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('reason', 'backup_code');
  return !error;
}

/** `enrollmentAllowed` lu directement dans l'état calculé par le point d'entrée (`member.mfa`). */
export const enrollmentAllowedFor = (mfa: MfaState): boolean =>
  enrollmentAllowed({ enrolled: mfa.enrolled, aal: mfa.aal, hasBackupCodes: Boolean(mfa.hasBackupCodes), recovery: Boolean(mfa.recovery) });

export interface EnrollmentContext {
  /** Au moins un facteur vérifié. */
  enrolled: boolean;
  /** Niveau de la session, lu dans le jeton VÉRIFIÉ. */
  aal: 'aal1' | 'aal2' | null;
  /** Le membre a des codes en base (utilisés ou non) : il a déjà été inscrit. */
  hasBackupCodes: boolean;
  /** Session de récupération valide (non expirée) pour CETTE session. */
  recovery: boolean;
}

/**
 * Inscrire un nouveau facteur est-il permis ? Fonction pure, appelée par la route d'inscription AVANT Supabase.
 * - déjà inscrit : seulement en aal2 (ajouter un second facteur après avoir donné le code) ;
 * - jamais inscrit (ni facteur, ni codes) : oui — première inscription, le mot de passe suffit ;
 * - inscrit autrefois (codes en base) sans facteur : seulement pendant la récupération ouverte par un code.
 */
export function enrollmentAllowed(context: EnrollmentContext): boolean {
  if (context.enrolled) return context.aal === 'aal2';
  if (!context.hasBackupCodes) return true;
  return context.recovery;
}
