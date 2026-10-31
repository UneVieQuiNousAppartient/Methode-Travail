// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/abuse-guard.ts (partie « verrou par compte », ACCOUNT_LOGIN_RULE, ACCOUNT_MFA_RULE, accountLockKey, accountLockedFor, recordFailedLogin, accountLockedResponse), commit 508f19a (2026-10-30) ; généralisé : fichier séparé bâti sur hitSharedCounter / hashRateLimitKey du lot 1, courriel normalisé sans aucun espace, verrou mémoire propre au module (le repli verrouille aussi), échecs de code de secours comptés comme des codes faux, réussite sans effet sur un verrou, message 429 [à adapter].
//
// Verrou PAR COMPTE : il s'ajoute au compteur par appareil (`enforceSharedAbuseGuard`), qui ne voit pas une attaque
// répartie sur plusieurs adresses IP.
// - Mot de passe : ACCOUNT_LOGIN_RULE — 9 échecs tolérés dans l'heure, le 10e bloque le compte 1 h.
// - Code de double vérification ET code de secours (même compteur) : ACCOUNT_MFA_RULE — 4 échecs tolérés en
//   15 min, le 5e bloque le compte 15 min, quel que soit l'appareil.
// Seuls les ÉCHECS comptent ; une réussite ne lève JAMAIS un verrou posé et ne remet pas le compteur à zéro
// (sinon un mot de passe deviné une fois effacerait la trace des essais). La clé dépend du courriel, que le compte
// existe ou non : la réponse ne révèle pas si un compte existe. Revers accepté : un tiers qui connaît le courriel
// peut bloquer le compte le temps du blocage.
// Clé = empreinte HMAC du courriel normalisé (`hashRateLimitKey`) : le courriel n'est jamais écrit en clair, ni en
// base ni dans les journaux. Table : `rate_limit_hits` (supabase/migrations/0101_rate_limits.sql) ; aucune autre
// colonne n'est nécessaire (lecture de `blocked_until` seulement).
import type { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server-admin';
import type { RedeemResult } from '@/lib/auth/mfa-backup-codes';
import { hashRateLimitKey, hitSharedCounter, type RpcClient, SHARED_COUNTER_TIMEOUT_MS, SHARED_FALLBACK_ALERT_INTERVAL_MS, tooMany } from './abuse-guard';
import type { CounterRule } from './rate-limit-core';

/** Mot de passe : le 10e échec dans l'heure bloque 1 h (`decideHit` bloque quand le compte DÉPASSE `limit`). */
export const ACCOUNT_LOGIN_RULE: CounterRule = { limit: 9, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 };

/** Code à 6 chiffres ou code de secours : le 5e échec en 15 min bloque 15 min. */
export const ACCOUNT_MFA_RULE: CounterRule = { limit: 4, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };

/** Portée du compteur des codes (double vérification et codes de secours partagent ce compteur). */
export const MFA_LOCK_SCOPE = 'team-mfa';

/** [à adapter] Message du 429 (aucun indice sur l'existence du compte). */
export const ACCOUNT_LOCKED_MESSAGE = '[à adapter] Trop de tentatives sur ce compte. Réessayez plus tard.';

/** Courriel ramené à une forme unique : minuscules, tous les espaces retirés. */
export function normalizeAccountEmail(email: string): string {
  return email.toLowerCase().replace(/\s+/g, '');
}

/** Empreinte du compteur d'un compte pour une portée (connexion de l'équipe, code, espace client…). */
export function accountLockKey(scope: string, email: string): string {
  return hashRateLimitKey(`account:${scope}:${normalizeAccountEmail(email)}`);
}

type LockReadResponse = { data: unknown; error: { message: string } | null };

/** Forme minimale du client pour la lecture du blocage (le client Supabase s'y conforme ; les tests injectent un faux). */
export type LockReadClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<LockReadResponse>;
        /** Annule la requête HTTP au délai ; absent d'un faux client. */
        abortSignal?: (signal: AbortSignal) => { maybeSingle: () => PromiseLike<LockReadResponse> };
      };
    };
  };
};

export type AccountLockClient = RpcClient & LockReadClient;

export type AccountLockOptions = {
  /** Client injecté (tests). `undefined` = `getSupabaseAdmin()` ; `null` = Supabase absent. */
  client?: AccountLockClient | null;
  timeoutMs?: number;
  now?: number;
};

// Verrous posés vus par CETTE instance (base joignable ou non) : le repli mémoire verrouille aussi, et un verrou
// posé reste visible même si la lecture en base tombe en panne ensuite.
const locks = new Map<string, number>();
let fallbackLoggedAt: number | null = null;

export function resetAccountLocksForTests(): void {
  locks.clear();
  fallbackLoggedAt = null;
}

function logFallback(reason: string, now: number): void {
  if (fallbackLoggedAt !== null && now - fallbackLoggedAt < SHARED_FALLBACK_ALERT_INTERVAL_MS) return;
  fallbackLoggedAt = now;
  console.error(`[account-lock] lecture du verrou indisponible (${reason}) : seul le verrou en mémoire de l'instance répond.`);
}

function resolveClient(options: AccountLockOptions): AccountLockClient | null {
  return options.client === undefined ? (getSupabaseAdmin() as unknown as AccountLockClient | null) : options.client;
}

function memoryLockSeconds(key: string, now: number): number {
  const until = locks.get(key);
  if (until === undefined) return 0;
  if (until <= now) {
    locks.delete(key);
    return 0;
  }
  return Math.ceil((until - now) / 1000);
}

/**
 * Secondes restantes de blocage du compte (0 = libre). Ne compte rien. Panne ou délai dépassé → seul le verrou en
 * mémoire de l'instance répond.
 */
export async function accountLockedFor(key: string, options: AccountLockOptions = {}): Promise<number> {
  const now = options.now ?? Date.now();
  const memory = memoryLockSeconds(key, now);
  if (memory > 0) return memory;
  const client = resolveClient(options);
  if (!client) return 0;

  const timeoutMs = options.timeoutMs ?? SHARED_COUNTER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`plus de ${timeoutMs} ms`), timeoutMs);
  });
  const read = (async (): Promise<number | string> => {
    const filtered = client.from('rate_limit_hits').select('blocked_until').eq('key', key);
    const { data, error } =
      typeof filtered.abortSignal === 'function'
        ? await filtered.abortSignal(AbortSignal.timeout(timeoutMs)).maybeSingle()
        : await filtered.maybeSingle();
    if (error) return `erreur : ${error.message}`;
    const raw = (data as { blocked_until?: unknown } | null)?.blocked_until;
    if (raw === null || raw === undefined) return 0;
    const until = typeof raw === 'string' ? Date.parse(raw) : NaN;
    if (!Number.isFinite(until)) return 'réponse inattendue';
    return until > now ? Math.ceil((until - now) / 1000) : 0;
  })().catch((error: unknown) => `exception : ${error instanceof Error ? error.message : String(error)}`);

  try {
    const result = await Promise.race([read, timeout]);
    if (typeof result === 'string') {
      logFallback(result, now);
      return 0;
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Un échec sur ce compte. Renvoie les secondes de blocage s'il est (ou reste) bloqué, 0 sinon.
 * `rule` : ACCOUNT_LOGIN_RULE par défaut (mot de passe) ; ACCOUNT_MFA_RULE pour un code (`recordFailedMfaCode`).
 */
export async function recordFailedLogin(key: string, options: AccountLockOptions = {}, rule: CounterRule = ACCOUNT_LOGIN_RULE): Promise<number> {
  const now = options.now ?? Date.now();
  const result = await hitSharedCounter(key, rule, { client: resolveClient(options), timeoutMs: options.timeoutMs, now });
  if (!result.blocked) return 0;
  const until = now + result.retryAfterSeconds * 1000;
  locks.set(key, Math.max(locks.get(key) ?? 0, until));
  return result.retryAfterSeconds;
}

/** Un code de double vérification faux (ACCOUNT_MFA_RULE). */
export function recordFailedMfaCode(key: string, options: AccountLockOptions = {}): Promise<number> {
  return recordFailedLogin(key, options, ACCOUNT_MFA_RULE);
}

/**
 * Résultat de `redeemBackupCode` : chaque `invalid` compte comme un code faux, sur le MÊME compteur que la double
 * vérification (on ne contourne pas le verrou en passant aux codes de secours). Les autres refus (secret absent,
 * base en panne, session absente) ne sont pas des essais du visiteur et ne comptent pas. Une réussite ne lève rien.
 */
export async function recordBackupCodeResult(key: string, result: RedeemResult, options: AccountLockOptions = {}): Promise<number> {
  if (result.ok || result.reason !== 'invalid') return 0;
  return recordFailedMfaCode(key, options);
}

/**
 * Point d'appel d'une réussite (mot de passe ou code justes). Volontairement sans effet : une réussite ne lève JAMAIS
 * un verrou posé et ne remet pas le compteur à zéro. Le verrou tombe seulement à la fin de son délai.
 */
export function recordSuccessfulLogin(key: string): void {
  void key;
}

/** Réponse 429 avec `Retry-After`, même forme que le compteur par appareil (aucun indice sur le compte). */
export function accountLockedResponse(retryAfterSeconds: number, message: string = ACCOUNT_LOCKED_MESSAGE): NextResponse {
  return tooMany(retryAfterSeconds, message);
}

export type AccountAttempt = { ok: true } | { ok: false; response: NextResponse | null };

/**
 * Tentative complète sur un compte : compte verrouillé → 429 SANS appeler `verify` (même un bon mot de passe est
 * refusé) ; `verify` faux → un échec compté (429 s'il vient de bloquer, sinon `response: null` : la route répond son
 * refus habituel) ; `verify` juste → ok, sans toucher au verrou.
 */
export async function attemptAccountLogin(
  input: { scope: string; email: string; verify: () => Promise<boolean>; rule?: CounterRule; message?: string },
  options: AccountLockOptions = {},
): Promise<AccountAttempt> {
  const key = accountLockKey(input.scope, input.email);
  const lockedFor = await accountLockedFor(key, options);
  if (lockedFor > 0) return { ok: false, response: accountLockedResponse(lockedFor, input.message) };
  if (await input.verify()) {
    recordSuccessfulLogin(key);
    return { ok: true };
  }
  const blockedFor = await recordFailedLogin(key, options, input.rule ?? ACCOUNT_LOGIN_RULE);
  return { ok: false, response: blockedFor > 0 ? accountLockedResponse(blockedFor, input.message) : null };
}
