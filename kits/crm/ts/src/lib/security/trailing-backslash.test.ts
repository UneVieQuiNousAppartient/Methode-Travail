// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/trailing-backslash.test.ts, commit 508f19a (2026-10-30) ; généralisé : repris tel quel.
import { describe, expect, it } from 'vitest';
import { endsWithBackslash } from './trailing-backslash';

// `/a-propos%5C` renvoyait 500 en production ; le middleware doit répondre 404.
describe('endsWithBackslash', () => {
  it.each(['/a-propos%5C', '/a-propos%5c', '/a-propos\\', '/a-propos/%5C', '/comparer%5C%5C', '/admin%5C'])(
    'reconnaît %s',
    (path) => {
      expect(endsWithBackslash(path)).toBe(true);
    },
  );

  it.each(['/', '/a-propos', '/a-propos/', '/a-propos%5Cx', '/a-propos%255C', '/blog/5c', '/%E0%A4%A'])('laisse passer %s', (path) => {
    expect(endsWithBackslash(path)).toBe(false);
  });
});
