// Kit CRM TS (methode-travail) — origine : KHI Educ, lib/turnstile.js, commit 2954590 (2026-10-27) + VieSolution-CSF, src/lib/api/abuse-guard.ts (requireHumanVerification : refus 503 et alerte de clé absente), commit 508f19a (2026-10-30) ; généralisé : porté en TypeScript strict, IP par request-ip.ts, routes et documents du projet retirés, jeton de sonde du kit, messages [à adapter] ; écrit pour le kit : contrôle facultatif du nom d'hôte (TURNSTILE_EXPECTED_HOSTNAME), verdict « failure » si ENFORCE sans clé ; jeton absent en enforce → 403 comme la seconde source (la première renvoyait 400).
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { clientIp, type HeaderSource } from './request-ip';

// Cloudflare Turnstile — protection anti-robots des formulaires publics.
// Le navigateur affiche le widget (clé publique NEXT_PUBLIC_TURNSTILE_SITE_KEY) et joint le jeton
// obtenu au corps JSON (`turnstile_token`) ; le serveur le vérifie auprès de Cloudflare
// (TURNSTILE_SECRET_KEY) avant d'enregistrer quoi que ce soit (et APRÈS la limite de débit).
//
// Déploiement en trois temps, sans jamais casser un formulaire :
//   1. aucune clé                         → rien n'est vérifié ;
//   2. TURNSTILE_SECRET_KEY               → un jeton présent est vérifié (faux → 403) ; un jeton
//                                           absent passe encore (formulaires pas encore équipés) ;
//   3. + TURNSTILE_ENFORCE=1              → jeton obligatoire sur toutes les routes protégées.
// TURNSTILE_ENFORCE=1 SANS clé secrète (clé effacée par erreur) : refus 503, jamais d'ouverture
// silencieuse. Clé absente en production sans ENFORCE : une erreur dans les journaux, une fois par instance.
//
// Qui est en faute ? Un problème de NOTRE côté ne doit jamais bloquer un visiteur :
//   - clé secrète refusée (missing-input-secret, invalid-input-secret) → on laisse passer, journal
//     « [turnstile] CONFIGURATION » ;
//   - Cloudflare en panne (internal-error, réponse non 2xx ou illisible) → on laisse passer, journal
//     « [turnstile] CLOUDFLARE » ; Cloudflare injoignable (exception, délai de TURNSTILE_TIMEOUT_MS)
//     → on laisse passer aussi. Le dernier incident est gardé en mémoire (lastProblem) pour la santé.
//     La limite de débit reste en place dans tous les cas.
// Tout le reste (jeton absent en enforce, invalid-input-response, timeout-or-duplicate, bad-request,
// code inconnu ou aucun code, nom d'hôte inattendu) est refusé : 403 { detail, code: "turnstile", reason }.
// Le message invite à cliquer de nouveau sur le bouton d'envoi, jamais à recharger la page (les réponses
// du formulaire seraient perdues) : le jeton est à usage unique et expire après 300 s.
//
// Piège : une clé publique et une clé secrète de deux widgets différents font répondre
// invalid-input-response pour CHAQUE visiteur, ce que le serveur ne distingue pas d'un jeton forgé.
// Après avoir collé les clés, vérifier la paire avec `siteverify` sur un jeton pris sur le site en ligne.
//
// Nom d'hôte (écrit pour le kit) : si TURNSTILE_EXPECTED_HOSTNAME est posée (un ou plusieurs noms séparés
// par des virgules), un jeton valide émis pour un autre site est refusé (reason « hostname »). Absente :
// aucun contrôle (comportement d'origine). Utile si la clé secrète sert plusieurs widgets.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 2048;
const PROBE_TOKEN = 'kit-health-probe';

// Codes Cloudflare qui accusent notre configuration, pas le visiteur.
const SECRET_CODES = ['missing-input-secret', 'invalid-input-secret'];

export type TurnstileMode = 'off' | 'verify' | 'enforce';

export const turnstileMode = (): TurnstileMode => {
  if (!process.env.TURNSTILE_SECRET_KEY) return 'off';
  return process.env.TURNSTILE_ENFORCE === '1' ? 'enforce' : 'verify';
};

export type TurnstileProblem = { at: string; kind: 'config' | 'cloudflare' | 'injoignable'; codes: string[] };

// Dernier incident de configuration ou de Cloudflare vu par cette instance.
let lastProblem: TurnstileProblem | null = null;
let missingSecretLogged = false;
const recordProblem = (kind: TurnstileProblem['kind'], codes: string[], message: string) => {
  lastProblem = { at: new Date().toISOString(), kind, codes };
  console.error(message);
};

export function resetTurnstileForTests(): void {
  lastProblem = null;
  missingSecretLogged = false;
  probeCache = null;
}

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export type SiteverifyResult = {
  status: number;
  /** false = corps illisible (pas un objet JSON). */
  json: boolean;
  success: boolean;
  error_codes: string[];
  hostname: string | null;
  challenge_ts: string | null;
  /** Clé secrète de TEST publiée par Cloudflare (réponse fixe — aucune vraie vérification). */
  testing_key: boolean;
};

/**
 * Appel brut à Cloudflare (aussi pour vérifier une paire de clés, et pour la sonde de santé).
 * Lève en cas d'exception réseau ou de délai dépassé : à l'appelant de décider.
 */
export const siteverify = async (
  token: string,
  ip: string | null,
  { secret = process.env.TURNSTILE_SECRET_KEY, fetchImpl = fetch as FetchImpl }: { secret?: string; fetchImpl?: FetchImpl } = {},
): Promise<SiteverifyResult> => {
  const res = await fetchImpl(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: secret || '', response: token, ...(ip ? { remoteip: ip } : {}) }),
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });
  let data: unknown = null;
  try {
    data = JSON.parse(await res.text());
  } catch {
    data = null;
  }
  const json = Boolean(data) && typeof data === 'object' && !Array.isArray(data);
  const obj = (json ? data : {}) as Record<string, unknown>;
  const codes = Array.isArray(obj['error-codes']) ? (obj['error-codes'] as unknown[]).map(String) : [];
  const metadata = obj.metadata as { result_with_testing_key?: unknown } | undefined;
  return {
    status: res.status,
    json,
    success: json && obj.success === true,
    error_codes: codes,
    hostname: typeof obj.hostname === 'string' && obj.hostname ? obj.hostname : null,
    challenge_ts: typeof obj.challenge_ts === 'string' && obj.challenge_ts ? obj.challenge_ts : null,
    testing_key: json && metadata?.result_with_testing_key === true,
  };
};

export type TurnstileSkip = 'off' | 'absent' | 'config' | 'cloudflare' | 'injoignable';
export type TurnstileResult = { ok: true; skipped?: TurnstileSkip } | { ok: false; reason: string };

const expectedHostnames = (): string[] =>
  String(process.env.TURNSTILE_EXPECTED_HOSTNAME || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/**
 * → { ok: true, skipped? } ou { ok: false, reason } ; reason : absent, invalide, indisponible (ENFORCE
 * sans clé), hostname, ou les codes Cloudflare (pour le journal).
 */
export const verifyTurnstile = async (
  token: unknown,
  ip: string | null,
  { fetchImpl = fetch as FetchImpl }: { fetchImpl?: FetchImpl } = {},
): Promise<TurnstileResult> => {
  const mode = turnstileMode();
  if (mode === 'off') {
    if (process.env.TURNSTILE_ENFORCE === '1') {
      console.error('[turnstile] TURNSTILE_SECRET_KEY absente alors que TURNSTILE_ENFORCE=1 : requête refusée (503).');
      return { ok: false, reason: 'indisponible' };
    }
    if (process.env.VERCEL_ENV === 'production' && !missingSecretLogged) {
      missingSecretLogged = true;
      console.error('[turnstile] TURNSTILE_SECRET_KEY absente en production : les formulaires publics passent SANS vérification anti-robot.');
    }
    return { ok: true, skipped: 'off' };
  }
  const t = typeof token === 'string' ? token.trim() : '';
  if (!t) return mode === 'enforce' ? { ok: false, reason: 'absent' } : { ok: true, skipped: 'absent' };
  if (t.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'invalide' };
  let r: SiteverifyResult;
  try {
    r = await siteverify(t, ip, { fetchImpl });
  } catch (e) {
    recordProblem('injoignable', [], `[turnstile] vérification impossible (requête acceptée sans vérification) : ${e instanceof Error ? e.message : String(e)}`);
    return { ok: true, skipped: 'injoignable' };
  }
  const codes = r.error_codes.join(',').slice(0, 120);
  if (r.error_codes.some((c) => SECRET_CODES.includes(c))) {
    recordProblem(
      'config',
      r.error_codes,
      `[turnstile] CONFIGURATION : Cloudflare refuse la clé secrète (${codes}) — requête acceptée SANS vérification. Recopier TURNSTILE_SECRET_KEY depuis Cloudflare (même widget que NEXT_PUBLIC_TURNSTILE_SITE_KEY), puis redéployer.`,
    );
    return { ok: true, skipped: 'config' };
  }
  if (r.status < 200 || r.status >= 300 || !r.json || r.error_codes.includes('internal-error')) {
    recordProblem(
      'cloudflare',
      r.error_codes,
      `[turnstile] CLOUDFLARE : réponse inattendue (HTTP ${r.status}${r.json ? '' : ', corps illisible'}${codes ? `, ${codes}` : ''}) — requête acceptée sans vérification.`,
    );
    return { ok: true, skipped: 'cloudflare' };
  }
  if (r.success) {
    const expected = expectedHostnames();
    if (expected.length && !expected.includes(String(r.hostname || '').toLowerCase())) return { ok: false, reason: 'hostname' };
    return { ok: true };
  }
  return { ok: false, reason: codes || 'invalide' };
};

export type TurnstileLang = 'fr' | 'en';

// Messages au visiteur [à adapter] : ses réponses restent dans le formulaire, il suffit de renvoyer.
export const TURNSTILE_MESSAGES = {
  absent: {
    fr: "La vérification de sécurité n'est pas encore terminée. Patientez quelques secondes (cochez la case si elle apparaît), puis cliquez de nouveau sur le bouton d'envoi : vos réponses sont conservées.",
    en: 'The security check is not finished yet. Wait a few seconds (tick the box if it appears), then click the submit button again: your answers are kept.',
  },
  refuse: {
    fr: "La vérification de sécurité a expiré ou n'a pas abouti. Cliquez de nouveau sur le bouton d'envoi : vos réponses sont conservées.",
    en: 'The security check expired or did not complete. Click the submit button again: your answers are kept.',
  },
  indisponible: {
    fr: "La vérification de sécurité est momentanément indisponible. Réessayez dans quelques minutes : vos réponses sont conservées.",
    en: 'The security check is temporarily unavailable. Try again in a few minutes: your answers are kept.',
  },
} as const;

type GuardRequest = HeaderSource & { nextUrl?: { pathname?: string } };

/** Pour les routes : réponse 403 (503 si ENFORCE sans clé) prête à renvoyer, ou null si la requête peut continuer. */
export const turnstileGuard = async (
  request: GuardRequest,
  body: { turnstile_token?: unknown } | null | undefined,
  { lang = 'fr', fetchImpl }: { lang?: TurnstileLang; fetchImpl?: FetchImpl } = {},
): Promise<NextResponse | null> => {
  const r = await verifyTurnstile(body?.turnstile_token, clientIp(request), fetchImpl ? { fetchImpl } : {});
  if (r.ok) return null;
  const reason = r.reason === 'absent' ? 'absent' : r.reason === 'indisponible' ? 'indisponible' : 'refuse';
  console.error(`[turnstile] refus (${r.reason}) ${request?.nextUrl?.pathname || ''}`);
  return NextResponse.json(
    { detail: TURNSTILE_MESSAGES[reason][lang === 'en' ? 'en' : 'fr'], code: 'turnstile', reason },
    { status: reason === 'indisponible' ? 503 : 403 },
  );
};

// Sonde de la clé secrète pour une page de santé : jeton volontairement faux, la réponse dit
// seulement si Cloudflare accepte la clé (invalid-input-response attendu → "ok"). Résultat gardé
// 10 min par instance (et par clé), pour ne pas appeler Cloudflare à chaque ouverture.
const PROBE_TTL_MS = 10 * 60 * 1000;
export type ProbeValue = 'ok' | 'invalide' | 'injoignable' | 'test';
let probeCache: { key: string; at: number; value: ProbeValue } | null = null;

export const probeTurnstileSecret = async ({ fetchImpl = fetch as FetchImpl, now = Date.now() }: { fetchImpl?: FetchImpl; now?: number } = {}): Promise<ProbeValue> => {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  const key = createHash('sha256').update(secret).digest('hex').slice(0, 16);
  if (probeCache && probeCache.key === key && now - probeCache.at < PROBE_TTL_MS) return probeCache.value;
  let value: ProbeValue;
  try {
    const r = await siteverify(PROBE_TOKEN, null, { secret, fetchImpl });
    if (r.error_codes.some((c) => SECRET_CODES.includes(c))) value = 'invalide';
    else if (r.testing_key) value = 'test';
    // internal-error : Cloudflare n'a pas jugé la clé, on ne peut pas dire « ok ».
    else if (r.status < 200 || r.status >= 300 || !r.json || r.error_codes.includes('internal-error')) value = 'injoignable';
    else value = 'ok';
  } catch {
    value = 'injoignable';
  }
  probeCache = { key, at: now, value };
  return value;
};

export type TurnstileHealth = {
  mode: TurnstileMode;
  site_key: boolean;
  secret: ProbeValue | null;
  last_problem: TurnstileProblem | null;
  production: boolean;
  /** TURNSTILE_ENFORCE=1 sans clé secrète (ajouté pour le kit) : chaque envoi est refusé en 503. */
  enforce_sans_cle?: boolean;
};

/** État sans secret. `secret` null quand aucune clé n'est configurée. */
export const turnstileHealth = async ({ fetchImpl, now }: { fetchImpl?: FetchImpl; now?: number } = {}): Promise<TurnstileHealth> => {
  const mode = turnstileMode();
  return {
    mode,
    site_key: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    secret: mode === 'off' ? null : await probeTurnstileSecret({ fetchImpl, now }),
    last_problem: lastProblem,
    production: process.env.VERCEL_ENV === 'production',
    ...(mode === 'off' && process.env.TURNSTILE_ENFORCE === '1' ? { enforce_sans_cle: true } : {}),
  };
};

// Lecture de turnstileHealth() : ok | warning | failure + phrase.
//   failure : clé secrète refusée (formulaires sans vérification), ou enforce sans clé publique
//             (aucun widget → chaque envoi refusé) ;
//   warning : Turnstile inactif, clé publique absente du build, Cloudflare injoignable, incident de moins
//             de 24 h (un incident plus ancien reste lisible dans last_problem sans colorer la santé) ;
//   clé secrète de TEST Cloudflare : failure en production (aucune protection réelle), warning ailleurs.
const RECENT_MS = 24 * 60 * 60 * 1000;
export type TurnstileVerdict = { level: 'ok' | 'warning' | 'failure'; problem: string | null };

export const turnstileVerdict = (h: TurnstileHealth | null | undefined, now = Date.now()): TurnstileVerdict => {
  if (h?.mode === 'off' && h.enforce_sans_cle) return { level: 'failure', problem: 'TURNSTILE_ENFORCE=1 sans TURNSTILE_SECRET_KEY : chaque envoi de formulaire est refusé (503) — recoller la clé secrète, ou retirer TURNSTILE_ENFORCE' };
  if (!h || h.mode === 'off') return { level: 'warning', problem: 'inactif : aucune clé secrète (TURNSTILE_SECRET_KEY), les formulaires ne sont protégés que par la limite de débit' };
  if (h.secret === 'test') return { level: h.production ? 'failure' : 'warning', problem: 'clé secrète de TEST Cloudflare : réponse fixe, aucune vraie vérification des visiteurs — coller la vraie clé secrète du widget, puis redéployer' };
  if (h.secret === 'invalide') return { level: 'failure', problem: 'clé secrète refusée par Cloudflare : les formulaires passent SANS vérification — recopier TURNSTILE_SECRET_KEY depuis Cloudflare, puis redéployer' };
  if (!h.site_key) {
    return h.mode === 'enforce'
      ? { level: 'failure', problem: 'TURNSTILE_ENFORCE=1 sans NEXT_PUBLIC_TURNSTILE_SITE_KEY au build : aucun widget, chaque envoi de formulaire est refusé — ajouter la clé publique et redéployer, ou retirer TURNSTILE_ENFORCE' }
      : { level: 'warning', problem: "NEXT_PUBLIC_TURNSTILE_SITE_KEY absente au build : le widget ne s'affiche pas, aucun jeton n'est envoyé — ajouter la clé publique et redéployer" };
  }
  if (h.secret === 'injoignable') return { level: 'warning', problem: "Cloudflare n'a pas répondu au test de la clé secrète (nouvel essai dans 10 min)" };
  const lp = h.last_problem;
  if (lp && now - Date.parse(lp.at) < RECENT_MS) {
    return { level: 'warning', problem: `incident ${lp.kind} le ${lp.at}${lp.codes.length ? ` (${lp.codes.join(', ')})` : ''} : requêtes acceptées sans vérification — voir les journaux « [turnstile] »` };
  }
  return { level: 'ok', problem: null };
};
