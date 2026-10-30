// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/api/rate-limit-core.test.ts, commit 508f19a (2026-10-30) ; généralisé : tests du plafond de notifications retirés avec le code (lot 2), autres cas repris tels quels.
import { describe, expect, it } from 'vitest';
import {
  type CounterEntry,
  decideHit,
  isPurgeable,
  normalizeIpForRateLimit,
  parseSharedHitResult,
} from './rate-limit-core';

// La règle de décision du compteur anti-abus (même logique que public.hit_rate_limit en SQL).

const rule = { limit: 3, windowMs: 60_000, blockMs: 5 * 60_000 };

function run(times: number, start: number, step = 1000) {
  let entry: CounterEntry | undefined;
  const decisions = [];
  for (let i = 0; i < times; i++) {
    const decision = decideHit(entry, start + i * step, rule);
    entry = decision.entry;
    decisions.push(decision);
  }
  return { entry: entry as CounterEntry, decisions };
}

describe('decideHit', () => {
  it('laisse passer jusqu’à la limite, bloque au-delà avec la durée de blocage', () => {
    const { decisions } = run(4, 0);
    expect(decisions.map((d) => d.blocked)).toEqual([false, false, false, true]);
    expect(decisions[3].retryAfterSeconds).toBe(300);
  });

  it('une fenêtre échue repart à 1', () => {
    const { entry } = run(3, 0);
    const next = decideHit(entry, 60_001, rule);
    expect(next.blocked).toBe(false);
    expect(next.entry).toEqual({ count: 1, windowStart: 60_001, blockedUntil: 0 });
  });

  it('à la limite exacte de la fenêtre (= windowMs), le compteur continue', () => {
    const { entry } = run(3, 0, 0);
    expect(decideHit(entry, 60_000, rule).blocked).toBe(true);
  });

  it('un blocage plus long que la fenêtre est respecté après la fin de fenêtre', () => {
    const { entry } = run(4, 0);
    const later = decideHit(entry, 3000 + 2 * 60_000, rule);
    expect(later.blocked).toBe(true);
    expect(later.retryAfterSeconds).toBe(Math.ceil((entry.blockedUntil - (3000 + 2 * 60_000)) / 1000));
    expect(later.entry).toBe(entry);
  });

  it('blocage terminé et fenêtre échue : la requête repasse', () => {
    const { entry } = run(4, 0);
    const after = decideHit(entry, entry.blockedUntil + 1, rule);
    expect(after.blocked).toBe(false);
    expect(after.entry.count).toBe(1);
  });

  it('ne modifie pas l’entrée reçue (fonction pure)', () => {
    const entry = { count: 1, windowStart: 0, blockedUntil: 0 };
    decideHit(entry, 10, rule);
    expect(entry).toEqual({ count: 1, windowStart: 0, blockedUntil: 0 });
  });
});

describe('isPurgeable', () => {
  it('oublie une entrée de plus d’une heure non bloquée, garde une entrée bloquée', () => {
    expect(isPurgeable({ count: 2, windowStart: 0, blockedUntil: 0 }, 3_600_001)).toBe(true);
    expect(isPurgeable({ count: 2, windowStart: 0, blockedUntil: 4_000_000 }, 3_600_001)).toBe(false);
    expect(isPurgeable({ count: 2, windowStart: 0, blockedUntil: 0 }, 3_600_000)).toBe(false);
  });
});

describe('parseSharedHitResult', () => {
  it('lit la réponse de la RPC', () => {
    expect(parseSharedHitResult({ blocked: false, retry_after: 0 })).toEqual({ blocked: false, retryAfterSeconds: 0 });
    expect(parseSharedHitResult({ blocked: true, retry_after: 120 })).toEqual({ blocked: true, retryAfterSeconds: 120 });
    expect(parseSharedHitResult({ blocked: true, retry_after: 0 })).toEqual({ blocked: true, retryAfterSeconds: 1 });
  });

  it('forme inattendue = null (traitée comme une panne)', () => {
    for (const bad of [null, undefined, 'x', [], {}, { blocked: 'true', retry_after: 0 }, { blocked: true }, { blocked: true, retry_after: -1 }]) {
      expect(parseSharedHitResult(bad)).toBeNull();
    }
  });
});

describe('normalizeIpForRateLimit', () => {
  it('IPv6 ramenée à son préfixe /64, quelle que soit l’écriture', () => {
    const a = normalizeIpForRateLimit('2001:db8:abcd:12:1111:2222:3333:4444');
    expect(a).toBe('2001:db8:abcd:12::/64');
    expect(normalizeIpForRateLimit('2001:0DB8:ABCD:0012:ffff::1')).toBe(a);
    expect(normalizeIpForRateLimit('[2001:db8:abcd:12::9]')).toBe(a);
    expect(normalizeIpForRateLimit('2001:db8:abcd:12::9%eth0')).toBe(a);
    expect(normalizeIpForRateLimit('2001:db8:abcd:13::1')).not.toBe(a);
    expect(normalizeIpForRateLimit('::1')).toBe('0:0:0:0::/64');
  });

  it('IPv4 encapsulée redevient IPv4 ; IPv4 et texte illisible inchangés', () => {
    expect(normalizeIpForRateLimit('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIpForRateLimit('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(normalizeIpForRateLimit(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(normalizeIpForRateLimit('unknown')).toBe('unknown');
    expect(normalizeIpForRateLimit('1:2:3')).toBe('1:2:3');
    expect(normalizeIpForRateLimit('1::2::3')).toBe('1::2::3');
    expect(normalizeIpForRateLimit('zzzz::1')).toBe('zzzz::1');
  });
});
