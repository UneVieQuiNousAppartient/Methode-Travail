// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/integrations/audit-detail.ts, commit 508f19a (2026-10-30) ; généralisé : cas propres au projet retirés (réglages d'un fournisseur, clés d'API, connexion d'agents, champs métier), rôles du kit, acteur lisible sans courriel, libellés [à adapter].
//
// Détail lisible d'une ligne du journal des actions. Module pur (utilisable côté navigateur) : les libellés
// des réglages du projet lui sont passés en argument.
import { ROLE_LABELS } from '@/lib/authz/roles';
import type { AuditRow } from './admin-audit';

/** [à adapter] Noms techniques de champs → mots simples. */
const FIELD_LABELS: Record<string, string> = {
  name: 'nom',
  role: 'rôle',
  status: 'étape',
  priority: 'priorité',
  enabled: 'activé',
  active: 'actif',
  tags: 'étiquettes',
  phone: 'téléphone',
  notes: 'notes',
};

const own = (labels: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(labels, key);

function yesNo(value: unknown): string {
  return value === true ? 'oui' : value === false ? 'non' : value === null || value === undefined ? '—' : String(value);
}

function fieldList(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((field) => (own(FIELD_LABELS, String(field)) ? FIELD_LABELS[String(field)] : String(field))).join(', ');
}

function roleLabel(value: unknown): string {
  const key = String(value);
  return own(ROLE_LABELS, key) ? ROLE_LABELS[key as keyof typeof ROLE_LABELS] : key;
}

/** Libellé d'un réglage (`delai_relance` → « Délai avant relance »), ou son nom s'il est inconnu (aucune invention). */
export function settingLabel(setting: unknown, labels: Record<string, string>): string {
  const key = String(setting);
  return own(labels, key) ? labels[key] : key;
}

/** Auteur lisible : « Administrateur (1a2b3c4d) » ou « Tâche planifiée : purge ». Jamais de courriel (il n'y en a pas). */
export function actorLabel(row: Pick<AuditRow, 'actor' | 'actor_role'>): string {
  if (row.actor.startsWith('system:')) return `Tâche planifiée : ${row.actor.slice('system:'.length)}`;
  if (row.actor.startsWith('member:')) {
    const id = row.actor.slice('member:'.length, 'member:'.length + 8);
    return row.actor_role ? `${roleLabel(row.actor_role)} (${id})` : `Membre (${id})`;
  }
  return row.actor;
}

export function auditDetail(row: AuditRow, settingLabels: Record<string, string> = {}): string {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const target = row.target_id ?? '';

  if (row.action === 'settings.update' && Array.isArray(meta.changes)) {
    const changes = (meta.changes as Array<{ setting?: unknown; before?: unknown; after?: unknown }>)
      .map((change) => `${settingLabel(change.setting, settingLabels)} : ${yesNo(change.before)} → ${yesNo(change.after)}`)
      .join(' ; ');
    return changes || '—';
  }

  const parts: string[] = [];
  const fields = fieldList(meta.fields);
  if (fields) parts.push(`champs : ${fields}`);
  if (row.action === 'team.role_change' && (meta.from !== undefined || meta.to !== undefined)) {
    parts.push(`${meta.from === undefined ? '—' : roleLabel(meta.from)} → ${meta.to === undefined ? '—' : roleLabel(meta.to)}`);
  } else if (typeof meta.role === 'string') parts.push(`rôle : ${roleLabel(meta.role)}`);
  if (typeof meta.dryRun === 'boolean') parts.push(meta.dryRun ? 'essai à blanc' : 'exécution réelle');
  if (typeof meta.rows === 'number') parts.push(`${meta.rows} ligne(s)${typeof meta.type === 'string' ? ` (${meta.type}${typeof meta.format === 'string' ? `, ${meta.format}` : ''})` : ''}`);
  if (meta.counts && typeof meta.counts === 'object') {
    const total = Object.values(meta.counts as Record<string, unknown>).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
    parts.push(`${total} élément(s) ${row.action === 'privacy.access' ? 'exporté(s)' : 'effacé(s)'}`);
  }
  if (meta.partial === true) parts.push('PARTIEL : à relancer');
  if (typeof meta.months === 'number') parts.push(`plus de ${meta.months} mois sans activité`);
  if (typeof meta.revoked === 'number') parts.push(`${meta.revoked} appareil(s)`);
  if (typeof meta.remaining === 'number') parts.push(`${meta.remaining} code(s) restant(s)`);

  const head = target && !parts.length ? target : target ? `${target} — ` : '';
  return parts.length ? `${head}${parts.join(' ; ')}` : head || '—';
}
