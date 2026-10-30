// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/rate-limit-core.ts, commit 508f19a (2026-10-30) ; généralisé : plafond de notifications (NOTIFY_*, notifyCapKeySources) retiré (lot 2), nom de la migration du kit.
/**
 * Logique de décision du compteur anti-abus — fonctions PURES, sans réseau ni horloge.
 *
 * La même règle existe en SQL dans `public.hit_rate_limit` (supabase/migrations/0101_rate_limits.sql) :
 * toute modification ici se reporte là-bas (et inversement).
 * - Un blocage en cours se vérifie AVANT la fin de fenêtre : un blocage plus long que la fenêtre est respecté.
 * - Une fenêtre échue (strictement plus de `windowMs` depuis son début) repart à 1.
 * - Au-delà de `limit` dans la fenêtre : blocage de `blockMs`.
 */

export type CounterEntry = {
  count: number;
  windowStart: number;
  blockedUntil: number;
};

export type HitDecision = {
  entry: CounterEntry;
  blocked: boolean;
  /** Secondes avant de réessayer (0 si non bloqué). */
  retryAfterSeconds: number;
};

export type CounterRule = {
  limit: number;
  windowMs: number;
  blockMs: number;
};

export function decideHit(existing: CounterEntry | undefined, now: number, rule: CounterRule): HitDecision {
  if (existing && existing.blockedUntil > now) {
    return { entry: existing, blocked: true, retryAfterSeconds: Math.ceil((existing.blockedUntil - now) / 1000) };
  }

  if (!existing || now - existing.windowStart > rule.windowMs) {
    return { entry: { count: 1, windowStart: now, blockedUntil: 0 }, blocked: false, retryAfterSeconds: 0 };
  }

  const count = existing.count + 1;
  if (count > rule.limit) {
    return {
      entry: { count, windowStart: existing.windowStart, blockedUntil: now + rule.blockMs },
      blocked: true,
      retryAfterSeconds: Math.ceil(rule.blockMs / 1000),
    };
  }
  return { entry: { count, windowStart: existing.windowStart, blockedUntil: 0 }, blocked: false, retryAfterSeconds: 0 };
}

/** Une entrée peut-elle être oubliée (fenêtre commencée il y a plus d'une heure, blocage terminé) ? */
export function isPurgeable(entry: CounterEntry, now: number): boolean {
  return entry.blockedUntil <= now && now - entry.windowStart > 60 * 60 * 1000;
}

export type SharedHitResult = { blocked: boolean; retryAfterSeconds: number };

/**
 * Lit la réponse de la RPC `hit_rate_limit` ({ blocked, retry_after }). `null` si la forme est inattendue :
 * l'appelant la traite comme une panne (repli sur la mémoire).
 */
export function parseSharedHitResult(data: unknown): SharedHitResult | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { blocked, retry_after: retryAfter } = data as { blocked?: unknown; retry_after?: unknown };
  if (typeof blocked !== 'boolean') return null;
  if (typeof retryAfter !== 'number' || !Number.isFinite(retryAfter) || retryAfter < 0) return null;
  return { blocked, retryAfterSeconds: blocked ? Math.max(1, Math.ceil(retryAfter)) : 0 };
}

/**
 * Adresse IP ramenée à ce qui identifie un visiteur : une IPv6 est réduite à son préfixe /64 (un
 * abonné reçoit souvent un /64 entier : sans cela, il changerait d'adresse à chaque requête) ; une IPv4
 * encapsulée (`::ffff:a.b.c.d`) redevient l'IPv4. IPv4, « unknown » ou texte illisible : inchangés
 * (en minuscules, sans espaces).
 */
export function normalizeIpForRateLimit(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    ip = end > 0 ? ip.slice(1, end) : ip.slice(1);
  }
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  if (!ip.includes(':')) return ip;

  const halves = ip.split('::');
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  // IPv4 en fin d'adresse (`::ffff:1.2.3.4`) : convertie en deux groupes hexadécimaux.
  const groupsSide = tail.length > 0 ? tail : head;
  const last = groupsSide[groupsSide.length - 1] ?? '';
  if (last.includes('.')) {
    const parts = last.split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return ip;
    const octets = parts.map(Number);
    groupsSide.splice(groupsSide.length - 1, 1, ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16));
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return ip;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  const values = groups.map((g) => Number.parseInt(g, 16));

  if (values.slice(0, 5).every((v) => v === 0) && values[5] === 0xffff) {
    return [values[6] >> 8, values[6] & 0xff, values[7] >> 8, values[7] & 0xff].join('.');
  }
  return `${values.slice(0, 4).map((v) => v.toString(16)).join(':')}::/64`;
}
