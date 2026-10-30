// Kit CRM TS (methode-travail) — origine : écrit pour le kit (aucune des sources ne teste sa route de rapports CSP).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CSP_RAPPORT_ABUSE_POLICY } from '@/lib/api/abuse-policies';
import { CSP_REPORT_MAX_BYTES, POST } from './route';

afterEach(() => vi.restoreAllMocks());

const report = (body: string, ip: string, headers: Record<string, string> = {}) =>
  new NextRequest('https://exemple.test/api/csp-rapport', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/csp-report', 'x-vercel-forwarded-for': ip, 'user-agent': 'navigateur', ...headers },
  });
const violation = JSON.stringify({ 'csp-report': { 'document-uri': 'https://exemple.test/contact?courriel=a%40b.test', 'effective-directive': 'img-src', 'blocked-uri': 'https://cdn.tiers.test/i.png?t=1' } });

describe('POST /api/csp-rapport', () => {
  it('204 et une ligne de journal sans paramètres d’adresse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(report(violation, '192.0.2.1'));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(' ');
    expect(line).toContain('"page":"/contact"');
    expect(line).toContain('"blocked":"https://cdn.tiers.test"');
    expect(line).not.toContain('courriel');
  });

  it('corps illisible → 204, rien de journalisé', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await POST(report('{pas du json', '192.0.2.2'))).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('corps trop gros → 413 (content-length annoncé ou flux plus long)', async () => {
    const big = 'x'.repeat(CSP_REPORT_MAX_BYTES + 10);
    expect((await POST(report(big, '192.0.2.3', { 'content-length': String(big.length) }))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new NextRequest('https://exemple.test/api/csp-rapport', {
      method: 'POST', body: stream, headers: { 'content-type': 'application/csp-report', 'x-vercel-forwarded-for': '192.0.2.4' }, duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1] & { duplex: 'half' });
    expect((await POST(req)).status).toBe(413);
  });

  it('débit limité (politique csp-rapport) : 429 au-delà de la limite pour un même appareil', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statuses: number[] = [];
    for (let i = 0; i < CSP_RAPPORT_ABUSE_POLICY.limit + 1; i++) statuses.push((await POST(report(violation, '198.51.100.200'))).status);
    expect(statuses.slice(0, CSP_RAPPORT_ABUSE_POLICY.limit).every((s) => s === 204)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
