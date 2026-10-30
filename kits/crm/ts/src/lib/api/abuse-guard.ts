// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/abuse-guard.ts, commit 508f19a (2026-10-30) ; généralisé : libellé HMAC → RATE_LIMIT_KEY_LABEL, message 429 en option ; retirés : verrou par compte et code MFA (lot 2), empreinte « visiteur » du plafond d'alertes (lot 2), requireHumanVerification (→ turnstile.ts).
import { createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server-admin';
import {
  type CounterEntry,
  type CounterRule,
  decideHit,
  isPurgeable,
  normalizeIpForRateLimit,
  parseSharedHitResult,
  type SharedHitResult,
} from './rate-limit-core';
import { clientIp } from './request-ip';

type Policy = {
  scope: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

const entries = new Map<string, CounterEntry>();

function getRequestIp(request: NextRequest): string {
  // Adresse lue en un seul endroit (`request-ip.ts`) : jamais `x-forwarded-for` directement ici.
  return clientIp(request) ?? 'unknown';
}

// Deux compteurs par portée.
// - Par IP seule, limite haute (×IP_ONLY_FACTOR) : changer de user-agent à chaque requête ne permet
//   plus de passer sous la limite indéfiniment.
// - Par IP + user-agent, limite de la politique : les appareils d'un même réseau (Wi-Fi d'un atelier,
//   bureau, réseau mobile partagé) ne se bloquent pas entre eux à la 9e soumission.
export const IP_ONLY_FACTOR = 4;

// Empreintes en HMAC-SHA256 avec un secret serveur, pas un SHA-256
// simple — l'espace des IPv4 est assez petit pour qu'un SHA-256 nu se renverse par force brute. Secret :
// RATE_LIMIT_PEPPER, sinon CRON_SECRET, sinon SUPABASE_SERVICE_ROLE_KEY ; la clé HMAC en est DÉRIVÉE
// (jamais le secret brut, qui sert ailleurs). Aucun des trois : clé aléatoire propre à l'instance — sans
// clé de service, il n'y a de toute façon pas de compteur partagé. Aucune valeur n'est jamais journalisée.
let derivedKey: { source: string; key: Buffer } | null = null;

/**
 * Libellé de dérivation de la clé HMAC. Le changer (ou changer de secret) change toutes les empreintes :
 * les compteurs repartent de zéro. Un projet peut y mettre son nom ; la base ne le voit jamais.
 */
export const RATE_LIMIT_KEY_LABEL = 'kit-crm:rate-limit:v1';
let instanceKey: Buffer | null = null;

function rateLimitKey(): Buffer {
  const secret =
    process.env.RATE_LIMIT_PEPPER?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    '';
  if (!secret) {
    instanceKey ??= randomBytes(32);
    return instanceKey;
  }
  if (derivedKey?.source !== secret) {
    derivedKey = { source: secret, key: createHmac('sha256', secret).update(RATE_LIMIT_KEY_LABEL).digest() };
  }
  return derivedKey.key;
}

/** Empreinte d'une clé de compteur : HMAC-SHA256 hexadécimal (64 caractères, format exigé par la base). */
export function hashRateLimitKey(source: string): string {
  return createHmac('sha256', rateLimitKey()).update(source).digest('hex');
}

/** Adresse du visiteur normalisée (IPv6 → préfixe /64). */
function getRateLimitIp(request: NextRequest): string {
  return normalizeIpForRateLimit(getRequestIp(request));
}

export function getFingerprint(request: NextRequest, scope: string, withUserAgent = false): string {
  const ua = withUserAgent ? `:${request.headers.get('user-agent') ?? 'unknown'}` : '';
  return hashRateLimitKey(`${scope}:${getRateLimitIp(request)}${ua}`);
}

/** Réponse 429 avec `Retry-After`. Message par défaut d'origine ; texte FR/EN : `rateLimitMessage` (abuse-policies.ts). */
export function tooMany(retryAfterSeconds: number, message = 'Too many attempts. Try again later.'): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

// Compteur en mémoire de l'instance (logique dans rate-limit-core.ts, la même qu'en SQL).
function hitMemory(key: string, rule: CounterRule, now: number): SharedHitResult {
  const decision = decideHit(entries.get(key), now, rule);
  entries.set(key, decision.entry);
  return { blocked: decision.blocked, retryAfterSeconds: decision.retryAfterSeconds };
}

function hit(key: string, limit: number, policy: Policy, now: number): NextResponse | null {
  const result = hitMemory(key, { limit, windowMs: policy.windowMs, blockMs: policy.blockMs }, now);
  return result.blocked ? tooMany(result.retryAfterSeconds) : null;
}

function purgeExpired(now: number) {
  // Le compteur est en mémoire : on le vide de temps en temps pour qu'il ne grossisse pas sans fin.
  if (entries.size < 5000) return;
  for (const [key, entry] of entries) {
    if (isPurgeable(entry, now)) entries.delete(key);
  }
}

export function enforceAbuseGuard(request: NextRequest, policy: Policy): NextResponse | null {
  const now = Date.now();
  purgeExpired(now);
  return (
    hit(getFingerprint(request, policy.scope), policy.limit * IP_ONLY_FACTOR, policy, now) ??
    hit(getFingerprint(request, policy.scope, true), policy.limit, policy, now)
  );
}

// ---------------------------------------------------------------------------------------------------
// Compteur PARTAGÉ entre les instances Vercel : RPC `public.hit_rate_limit`
// (supabase/migrations/0101_rate_limits.sql). Ouverture en cas de panne : Supabase absent, erreur,
// réponse inattendue ou plus de SHARED_COUNTER_TIMEOUT_MS → compteur en mémoire de l'instance, et une
// erreur dans les journaux par instance, réarmée toutes les 15 minutes tant que la panne dure.
// Jamais d'erreur 500 à cause du compteur, et jamais de « laisser passer » aveugle : la mémoire LIMITE
// toujours (corrige l'écart n° 3 de la comparaison des projets, où la panne laissait tout passer).
// ---------------------------------------------------------------------------------------------------

/** Délai d'attente de la base avant le repli mémoire (une requête publique n'attend jamais plus). */
export const SHARED_COUNTER_TIMEOUT_MS = 800;
export const SHARED_FALLBACK_ALERT_INTERVAL_MS = 15 * 60 * 1000;

type RpcResponse = { data: unknown; error: { message: string } | null };

// Forme minimale du client utilisée ici (le client Supabase s'y conforme ; les tests injectent un faux).
// `abortSignal` (PostgrestFilterBuilder) annule la requête HTTP au délai ; absent d'un faux client.
export type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResponse> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResponse> };
};

function adminRpcClient(): RpcClient | null {
  const client: SupabaseClient | null = getSupabaseAdmin();
  return client as RpcClient | null;
}

export type SharedCounterOptions = {
  /** Client injecté (tests). `undefined` = `getSupabaseAdmin()` ; `null` = Supabase absent. */
  client?: RpcClient | null;
  timeoutMs?: number;
  now?: number;
};

let sharedFallbackLoggedAt: number | null = null;

export function resetSharedCounterAlertForTests(): void {
  sharedFallbackLoggedAt = null;
  entries.clear();
}

function logSharedFallback(reason: string, now: number): void {
  if (sharedFallbackLoggedAt !== null && now - sharedFallbackLoggedAt < SHARED_FALLBACK_ALERT_INTERVAL_MS) return;
  sharedFallbackLoggedAt = now;
  console.error(`[abuse-guard] compteur partagé indisponible (${reason}) : repli sur le compteur en mémoire de l'instance.`);
}

async function callSharedCounter(client: RpcClient, key: string, rule: CounterRule, timeoutMs: number): Promise<SharedHitResult | string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`plus de ${timeoutMs} ms`), timeoutMs);
  });
  const call = (async (): Promise<SharedHitResult | string> => {
    const builder = client.rpc('hit_rate_limit', {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: Math.ceil(rule.windowMs / 1000),
      p_block_seconds: Math.ceil(rule.blockMs / 1000),
    });
    // La requête est annulée au délai (pas seulement ignorée) quand le client le permet.
    const { data, error } =
      typeof builder.abortSignal === 'function' ? await builder.abortSignal(AbortSignal.timeout(timeoutMs)) : await builder;
    if (error) return `erreur : ${error.message}`;
    return parseSharedHitResult(data) ?? 'réponse inattendue';
  })().catch((error: unknown) => `exception : ${error instanceof Error ? error.message : String(error)}`);

  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Un passage sur un compteur partagé. `key` est déjà une empreinte (`hashRateLimitKey` : 64 caractères
 * hexadécimaux, contrainte SQL).
 * `degraded` = le compteur en mémoire a répondu à la place de la base.
 */
export async function hitSharedCounter(
  key: string,
  rule: CounterRule,
  options: SharedCounterOptions = {},
): Promise<SharedHitResult & { degraded: boolean }> {
  const now = options.now ?? Date.now();
  const client = options.client === undefined ? adminRpcClient() : options.client;
  if (!client) {
    logSharedFallback('Supabase non configuré', now);
    return { ...hitMemory(key, rule, now), degraded: true };
  }
  const result = await callSharedCounter(client, key, rule, options.timeoutMs ?? SHARED_COUNTER_TIMEOUT_MS);
  if (typeof result === 'string') {
    logSharedFallback(result, now);
    return { ...hitMemory(key, rule, now), degraded: true };
  }
  return { ...result, degraded: false };
}

/**
 * Purge horaire des compteurs échus, à appeler depuis une tâche planifiée protégée par `cron/auth.ts`. Renvoie le nombre de
 * lignes supprimées, ou null si la purge n'a pas pu tourner (migration absente, panne) — jamais d'exception.
 */
export async function purgeSharedCounters(client: RpcClient, maxRows = 5000): Promise<number | null> {
  try {
    const { data, error } = await client.rpc('purge_rate_limit_hits', { p_max: maxRows });
    if (error) {
      console.warn('[abuse-guard] purge des compteurs impossible :', error.message);
      return null;
    }
    return typeof data === 'number' ? data : null;
  } catch (error) {
    console.warn('[abuse-guard] purge des compteurs impossible :', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Version partagée d'`enforceAbuseGuard` (mêmes deux empreintes, même politique) pour les routes
 * publiques qui créent des données ou coûtent cher. Si la base ne répond pas au premier compteur, le
 * second va directement en mémoire (pas deux attentes de SHARED_COUNTER_TIMEOUT_MS).
 */
export async function enforceSharedAbuseGuard(
  request: NextRequest,
  policy: Policy,
  options: SharedCounterOptions & { message?: string } = {},
): Promise<NextResponse | null> {
  const now = options.now ?? Date.now();
  purgeExpired(now);
  const rule = { windowMs: policy.windowMs, blockMs: policy.blockMs };

  const ipOnly = await hitSharedCounter(
    getFingerprint(request, policy.scope),
    { ...rule, limit: policy.limit * IP_ONLY_FACTOR },
    { ...options, now },
  );
  if (ipOnly.blocked) return tooMany(ipOnly.retryAfterSeconds, options.message);

  const withUaKey = getFingerprint(request, policy.scope, true);
  const withUa = ipOnly.degraded
    ? hitMemory(withUaKey, { ...rule, limit: policy.limit }, now)
    : await hitSharedCounter(withUaKey, { ...rule, limit: policy.limit }, { ...options, now });
  return withUa.blocked ? tooMany(withUa.retryAfterSeconds, options.message) : null;
}

// ---------------------------------------------------------------------------------------------------
// Lecture d'un corps JSON avec plafond : `validateJsonRequest` ne regarde la taille que si
// `content-length` est présent. Ici le flux est lu morceau par morceau et coupé au-delà de `maxBytes`.
// ---------------------------------------------------------------------------------------------------

export const DEFAULT_JSON_MAX_BYTES = 32 * 1024;

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: NextResponse };

/**
 * Lit le corps JSON sans jamais dépasser `maxBytes`. Corps absent, vide ou JSON invalide : `body = null`
 * (même comportement qu'avant avec `request.json().catch(() => null)`). Trop gros : réponse 413.
 */
export async function readJsonBodyWithLimit(request: Request, maxBytes: number = DEFAULT_JSON_MAX_BYTES): Promise<JsonBodyResult> {
  if (!request.body) return { ok: true, body: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, response: NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 }) };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: true, body: null };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: true, body: null };
  }
}

export function validateJsonRequest(
  request: NextRequest,
  options?: { maxBytes?: number; requireJsonContentType?: boolean },
): NextResponse | null {
  const maxBytes = options?.maxBytes ?? 32 * 1024;
  const requireJsonContentType = options?.requireJsonContentType ?? true;

  if (requireJsonContentType) {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Unsupported content type.' }, { status: 415 });
    }
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 });
    }
  }

  return null;
}

export function validateFormRequest(
  request: NextRequest,
  options?: { maxBytes?: number; allowUrlEncoded?: boolean },
): NextResponse | null {
  const maxBytes = options?.maxBytes ?? 256 * 1024;
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  const acceptedTypes = options?.allowUrlEncoded
    ? ['multipart/form-data', 'application/x-www-form-urlencoded']
    : ['multipart/form-data'];

  if (!acceptedTypes.some((type) => contentType.includes(type))) {
    return NextResponse.json({ ok: false, error: 'Unsupported content type.' }, { status: 415 });
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 });
    }
  }

  return null;
}
