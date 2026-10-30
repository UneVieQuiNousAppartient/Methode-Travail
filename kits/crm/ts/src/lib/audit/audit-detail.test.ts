// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/integrations/audit-detail.test.ts, commit 508f19a (2026-10-30) ; généralisé : réglages d'un fournisseur → libellés passés en argument, actions et champs du kit, acteur sans courriel.
import { describe, expect, it } from 'vitest';
import { fakeUuid } from '@/test-support/fake-supabase';
import type { AuditRow } from './admin-audit';
import { actorLabel, auditDetail, settingLabel } from './audit-detail';

const LABELS = { delai_relance: 'Délai avant relance (jours)', relances_actives: 'Relances automatiques activées' };
const row = (action: string, meta: Record<string, unknown>, target_id: string | null = null): AuditRow =>
  ({ id: 1, actor: `member:${fakeUuid(1)}`, actor_role: 'admin', action, target_type: null, target_id, meta, ip: null, created_at: '2026-10-30T12:00:00Z' }) as AuditRow;

describe('auditDetail', () => {
  it('réglages : libellé lisible, jamais le nom technique', () => {
    const text = auditDetail(
      row('settings.update', { changes: [{ setting: 'delai_relance', before: 7, after: 14 }, { setting: 'relances_actives', before: false, after: true }] }),
      LABELS,
    );
    expect(text).toBe('Délai avant relance (jours) : 7 → 14 ; Relances automatiques activées : non → oui');
    expect(text).not.toContain('delai_relance');
  });

  it('réglage inconnu : son nom tel quel (aucune invention, même pour une clé de prototype)', () => {
    expect(settingLabel('autre_chose', LABELS)).toBe('autre_chose');
    expect(settingLabel('constructor', LABELS)).toBe('constructor');
  });

  it('actions de l’admin : champs en mots simples, rôles et compteurs', () => {
    expect(auditDetail(row('team.role_change', { from: 'employe', to: 'gestionnaire' }, 'id-1'))).toBe('id-1 — Employé → Gestionnaire');
    expect(auditDetail(row('team.add', { role: 'admin' }))).toBe('rôle : Administrateur');
    expect(auditDetail(row('record.archive', { fields: ['name', 'status'] }, 'id-2'))).toBe('id-2 — champs : nom, étape');
    expect(auditDetail(row('export.download', { type: 'leads', format: 'csv', rows: 12 }))).toBe('12 ligne(s) (leads, csv)');
    expect(auditDetail(row('privacy.erase', { counts: { leads: 1, lead_activities: 4 } }, 'empreinte'))).toBe('empreinte — 5 élément(s) effacé(s)');
    expect(auditDetail(row('privacy.erase', { counts: { leads: 1 }, partial: true }))).toBe('1 élément(s) effacé(s) ; PARTIEL : à relancer');
    expect(auditDetail(row('retention.purge', { months: 36, dryRun: true }))).toBe('essai à blanc ; plus de 36 mois sans activité');
    expect(auditDetail(row('mfa.device_forget', { revoked: 2 }))).toBe('2 appareil(s)');
    expect(auditDetail(row('mfa.backup_code_used', { remaining: 9 }))).toBe('9 code(s) restant(s)');
    expect(auditDetail(row('record.delete', {}, 'b1'))).toBe('b1');
    expect(auditDetail(row('auth.logout', {}))).toBe('—');
  });

  it('auteur lisible, sans courriel', () => {
    expect(actorLabel({ actor: `member:${fakeUuid(1)}`, actor_role: 'admin' })).toBe('Administrateur (00000000)');
    expect(actorLabel({ actor: 'system:purge', actor_role: null })).toBe('Tâche planifiée : purge');
  });
});
