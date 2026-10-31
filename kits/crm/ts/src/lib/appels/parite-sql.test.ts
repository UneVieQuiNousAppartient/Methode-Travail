// Kit CRM TS (methode-travail) — origine : écrit pour le kit (test de parité entre la configuration d'exemple et les listes [à adapter] de 0112_call_result.sql ; un projet qui change l'un change l'autre, ou ce test échoue).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_APPELS_EXEMPLE as C, ISSUES, RESULTATS } from './regles';

const sql = readFileSync(fileURLToPath(new URL('../../../supabase/migrations/0112_call_result.sql', import.meta.url)), 'utf8');

/** `c_nom constant text[] := array['a', 'b'];` → ['a', 'b'] ; `c_nom constant text := 'a';` → ['a']. */
function constante(nom: string): string[] {
  const m = sql.match(new RegExp(`${nom} constant text(?:\\[\\])? := (?:array\\[)?([^\\];]+)\\]?;`));
  if (!m) throw new Error(`constante ${nom} absente du SQL`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('parité regles.ts ↔ 0112_call_result.sql', () => {
  it('étapes, étapes protégées, étape « perdu »', () => {
    expect(constante('c_etapes').sort()).toEqual(Object.keys(C.etapes).sort());
    expect(constante('c_protegees').sort()).toEqual([...C.etapesProtegees].sort());
    expect(constante('c_perdu')).toEqual([C.etapePerdue]);
  });
  it('passage automatique quand la personne est jointe (c_nouvelles → c_contacte = avanceeQuandJoint)', () => {
    expect(C.avanceeQuandJoint).not.toBeNull();
    expect(constante('c_nouvelles').sort()).toEqual([...(C.avanceeQuandJoint?.depuis ?? [])].sort());
    expect(constante('c_contacte')).toEqual([C.avanceeQuandJoint?.vers]);
    expect(sql).toMatch(/case when v_joint and v_status_before = any \(c_nouvelles\) then c_contacte end/);
  });
  it('lead archivé refusé comme introuvable', () => {
    expect(sql).toMatch(/if v_archived_at is not null then\s+raise exception 'record_call_result: lead introuvable'/);
  });
  it('raisons de perte et étapes visées par les règles connues du SQL', () => {
    const raisons = constante('c_raisons');
    for (const r of RESULTATS) {
      const regle = C.regles[r];
      if (regle.raisonPerte) expect(raisons, r).toContain(regle.raisonPerte);
      if (regle.etape) expect(constante('c_etapes'), r).toContain(regle.etape);
    }
  });
  it('issues identiques ; fonction réservée à service_role', () => {
    const m = sql.match(/p_outcome not in \(([^)]+)\)/);
    expect([...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()).toEqual([...ISSUES].sort());
    expect(sql).toMatch(/security definer\s+set search_path = public, pg_temp/);
    expect(sql).toMatch(/revoke all on function public\.record_call_result\([^)]*\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.record_call_result\([^)]*\) to service_role;/);
  });
  it('garde « ne recule jamais » présente dans le SQL', () => {
    expect(sql).toMatch(/if v_status_before = any \(c_protegees\) or v_target = v_status_before then\s+v_target := null;/);
  });
});
