// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/integrations/admin-audit.ts, commit 508f19a (2026-10-30) + KHI Educ, lib/audit.js (audit() qui ne lève jamais), commit 1a02685 (2026-10-30) ; généralisé : catalogue fermé générique (actions métier, clés d'API et connexion d'agents retirées), acteur = AuditActor (jamais de courriel), `meta` filtrée (clés sensibles et adresses retirées, y compris imbriquées), filtres refusés s'ils sont invalides, libellés [à adapter].
//
// Journal des actions de l'administration : qui a fait quoi, sur quoi. Distinct du journal d'accès Loi 25
// (`subject-access.ts`, qui note les LECTURES de fiches).
//
// Règles :
// - `audit()` ne lève JAMAIS : un journal en panne n'empêche pas l'action (l'échec est écrit dans la console,
//   sans donnée personnelle). Il est appelé APRÈS le succès de l'opération.
// - Toute action doit figurer dans `AUDIT_ACTIONS` (catalogue fermé) : une action inconnue est une erreur de
//   type ET est refusée à l'exécution (rien n'est écrit).
// - L'acteur est un `AuditActor` : identifiant du membre et rôle, ou nom d'une tâche planifiée. Jamais son courriel.
// - `meta` ne porte que des identifiants, des compteurs, des noms de champs et des valeurs de réglages :
//   `sanitizeMeta` retire toute clé de type courriel / jeton / secret / mot de passe / code, et toute valeur
//   qui contient une adresse courriel, à toute profondeur.
//
// Module sans import serveur (les libellés peuvent servir côté navigateur) ; `ipOf` vient de `request-ip.ts`.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditActor, TeamRole } from '@/lib/auth/types';
import { clientIp, type HeaderSource } from '@/lib/api/request-ip';

/** Table du journal (migration 0106). */
export const AUDIT_TABLE = 'admin_audit_log';

/** Catalogue FERMÉ des actions journalisées. [à adapter] : un projet ajoute ses actions ici, jamais à la volée. */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'mfa.enroll',
  'mfa.unenroll',
  'mfa.backup_code_used',
  'mfa.backup_codes_regenerated',
  'mfa.device_trust',
  'mfa.device_forget',
  'team.add',
  'team.remove',
  'team.role_change',
  'record.delete',
  'record.archive',
  'record.unarchive',
  'export.download',
  'privacy.access',
  'privacy.erase',
  'settings.update',
  'retention.purge',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** [à adapter] Libellés affichés dans le journal. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login': 'Connexion à l’administration',
  'auth.logout': 'Déconnexion',
  'mfa.enroll': 'Double vérification activée (facteur inscrit)',
  'mfa.unenroll': 'Facteur de double vérification retiré',
  'mfa.backup_code_used': 'Code de secours utilisé',
  'mfa.backup_codes_regenerated': 'Codes de secours régénérés',
  'mfa.device_trust': 'Appareil de confiance retenu',
  'mfa.device_forget': 'Appareil(s) de confiance oublié(s)',
  'team.add': 'Membre de l’équipe ajouté',
  'team.remove': 'Membre de l’équipe retiré (accès coupé)',
  'team.role_change': 'Rôle d’un membre de l’équipe changé',
  'record.delete': 'Fiche supprimée',
  'record.archive': 'Fiche archivée (masquée des listes, pas effacée)',
  'record.unarchive': 'Fiche désarchivée',
  'export.download': 'Export téléchargé',
  'privacy.access': 'Demande d’accès (Loi 25) : données exportées',
  'privacy.erase': 'Demande d’effacement (Loi 25) : personne effacée',
  'settings.update': 'Réglage modifié',
  'retention.purge': 'Purge de conservation (données trop anciennes)',
};

/** [à adapter] Familles du filtre du journal (préfixe → libellé). Chaque action appartient à une famille. */
export const AUDIT_FAMILIES: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: 'auth.', label: 'Connexions' },
  { prefix: 'mfa.', label: 'Double vérification' },
  { prefix: 'team.', label: 'Équipe' },
  { prefix: 'record.', label: 'Fiches (suppression, archivage)' },
  { prefix: 'export.', label: 'Exports' },
  { prefix: 'privacy.', label: 'Vie privée (Loi 25)' },
  { prefix: 'settings.', label: 'Réglages' },
  { prefix: 'retention.', label: 'Conservation' },
];

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);

/** Actions d'une famille (« team. » → toutes les actions qui commencent par « team. »). */
export function auditActionsOf(prefix: string): AuditAction[] {
  return AUDIT_ACTIONS.filter((action) => action.startsWith(prefix));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM_NAME = /^[a-z0-9_-]{1,60}$/;
/** Format de la colonne `actor` (contrainte SQL identique, migration 0106) : jamais un courriel. */
export const ACTOR_KEY = /^(member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|system:[a-z0-9_-]{1,60})$/;

/** `member:<uuid>` ou `system:<nom>` ; null si l'acteur est invalide (rien n'est alors écrit). */
export function actorKey(actor: AuditActor | null | undefined): string | null {
  if (!actor || typeof actor !== 'object') return null;
  if (actor.kind === 'member') return typeof actor.userId === 'string' && UUID.test(actor.userId) ? `member:${actor.userId.toLowerCase()}` : null;
  if (actor.kind === 'system') return typeof actor.name === 'string' && SYSTEM_NAME.test(actor.name) ? `system:${actor.name}` : null;
  return null;
}

// --- Filtre de `meta` ----------------------------------------------------------------------------------

/** Mots interdits dans une clé de `meta` (comparés par segment, sans tenir compte de la casse). */
const FORBIDDEN_SEGMENTS = new Set(['email', 'emails', 'mail', 'courriel', 'token', 'tokens', 'jeton', 'secret', 'secrets', 'password', 'passwd', 'pwd', 'code', 'otp', 'totp']);
/** Clés interdites une fois les séparateurs retirés (« mot_de_passe », « api-key »…). */
const FORBIDDEN_COMPACT = new Set(['motdepasse', 'apikey', 'accesstoken', 'refreshtoken', 'emailaddress']);
const EMAIL_IN_TEXT = /[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+/;
const MAX_DEPTH = 4;
const MAX_STRING = 500;
export const REDACTED = '[retiré]';

/** Vrai si la clé ressemble à un courriel, un jeton, un secret, un mot de passe ou un code. */
export function isSensitiveKey(key: string): boolean {
  const segments = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return true;
  return FORBIDDEN_COMPACT.has(segments.join(''));
}

function cleanValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return EMAIL_IN_TEXT.test(value) ? REDACTED : value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return '[tronqué]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => cleanValue(item, depth + 1));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return sanitizeMeta(value as Record<string, unknown>, depth + 1);
  }
  return null; // fonction, date, classe… : rien d'implicite dans le journal
}

/** `meta` sans clé sensible ni adresse courriel, bornée en profondeur et en longueur. Toujours un objet. */
export function sanitizeMeta(meta: unknown, depth = 0): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (isSensitiveKey(key) || EMAIL_IN_TEXT.test(key)) continue;
    out[key.slice(0, 60)] = cleanValue(value, depth);
  }
  return out;
}

// --- Écriture ------------------------------------------------------------------------------------------

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  target_type?: string | null;
  target_id?: string | null;
  meta?: Record<string, unknown>;
}

export interface AuditInsert {
  actor: string;
  actor_role: TeamRole | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
}

export interface AuditRow extends AuditInsert {
  id: number;
  created_at: string;
}

/** IP du client : même extraction que l'anti-abus (`request-ip.ts`). */
export const ipOf = clientIp;

/** Cible : jamais une adresse courriel (une personne se désigne par l'identifiant de sa fiche ou une empreinte). */
const cleanTarget = (value: string | null | undefined, max: number) => {
  if (!value) return null;
  const text = String(value).slice(0, max);
  return EMAIL_IN_TEXT.test(text) ? REDACTED : text;
};

/** Ligne à insérer (fonction pure), ou null si l'action est hors catalogue ou l'acteur invalide. */
export function auditRow(entry: AuditEntry, request?: HeaderSource): AuditInsert | null {
  if (!entry || !isAuditAction(entry.action)) return null;
  const actor = actorKey(entry.actor);
  if (!actor) return null;
  return {
    actor,
    actor_role: entry.actor.kind === 'member' ? entry.actor.role : null,
    action: entry.action,
    target_type: cleanTarget(entry.target_type, 40),
    target_id: cleanTarget(entry.target_id, 100),
    meta: sanitizeMeta(entry.meta),
    ip: ipOf(request),
  };
}

/**
 * Écrit une ligne. Ne lève JAMAIS : `true` si la ligne est écrite, `false` sinon (action hors catalogue,
 * acteur invalide, base absente ou en erreur — un avertissement sans donnée personnelle est écrit).
 */
export async function audit(supabase: SupabaseClient | null, entry: AuditEntry, request?: HeaderSource): Promise<boolean> {
  try {
    const row = auditRow(entry, request);
    if (!row) {
      console.error('[audit] entrée refusée (action hors catalogue ou acteur invalide)');
      return false;
    }
    if (!supabase) {
      console.error('[audit] base indisponible, action non journalisée', row.action);
      return false;
    }
    const { error } = await supabase.from(AUDIT_TABLE).insert(row);
    if (error) {
      console.error('[audit] écriture en échec', row.action, error.code ?? 'inconnu');
      return false;
    }
    return true;
  } catch (error) {
    console.error('[audit] écriture en échec', error instanceof Error ? error.name : 'inconnu');
    return false;
  }
}

// --- Lecture -------------------------------------------------------------------------------------------

export interface AuditFilters {
  actor: string | null;
  action: string | null;
  since: string | null;
  until: string | null;
  limit: number;
  offset: number;
}

export type ParsedAuditFilters = { ok: true; filters: AuditFilters } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** Date ISO réelle (« 2026-02-31 » refusée), ou undefined si invalide ; null si absente. */
function isoOrInvalid(value: string | null): string | null | undefined {
  if (value === null || value === '') return null;
  if (!ISO_DATE.test(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  // Jour inexistant : `Date` le reporte au mois suivant ; on compare la partie date d'une date sans heure.
  if (value.length === 10 && date.toISOString().slice(0, 10) !== value) return undefined;
  return date.toISOString();
}

/**
 * Filtres de la route lus depuis l'adresse. Un filtre INVALIDE est refusé (jamais ignoré en silence, ce qui
 * élargirait la recherche) : action hors catalogue, acteur mal formé, date invalide, période à l'envers.
 */
export function parseAuditFilters(params: URLSearchParams): ParsedAuditFilters {
  const actor = params.get('actor') || null;
  if (actor !== null && !ACTOR_KEY.test(actor)) return { ok: false, error: 'Acteur invalide.' };
  const action = params.get('action') || null;
  // Action exacte du catalogue, ou famille déclarée (« team. ») : rien d'autre n'atteint la requête.
  if (action !== null && !isAuditAction(action) && !AUDIT_FAMILIES.some((family) => family.prefix === action)) {
    return { ok: false, error: 'Action inconnue.' };
  }
  const since = isoOrInvalid(params.get('since'));
  const until = isoOrInvalid(params.get('until'));
  if (since === undefined || until === undefined) return { ok: false, error: 'Date invalide (format attendu : AAAA-MM-JJ).' };
  if (since && until && since > until) return { ok: false, error: 'Période invalide (début après la fin).' };
  return {
    ok: true,
    filters: {
      actor,
      action,
      since,
      until,
      limit: Math.min(200, Math.max(1, Math.floor(Number(params.get('limit'))) || 50)),
      offset: Math.max(0, Math.floor(Number(params.get('offset')) || 0)),
    },
  };
}

/** Lecture paginée, du plus récent au plus ancien. Lève si la base répond en erreur (pas de liste vide trompeuse). */
export async function listAudit(supabase: SupabaseClient, filters: Partial<AuditFilters>): Promise<{ items: AuditRow[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  let query = supabase
    .from(AUDIT_TABLE)
    .select('id, actor, actor_role, action, target_type, target_id, meta, ip, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (filters.actor) query = query.eq('actor', filters.actor);
  // Famille : liste EXPLICITE des actions connues — pas de `like`, où « _ » et « % » seraient des jokers.
  if (filters.action) query = filters.action.endsWith('.') ? query.in('action', auditActionsOf(filters.action)) : query.eq('action', filters.action);
  if (filters.since) query = query.gte('created_at', filters.since);
  if (filters.until) query = query.lte('created_at', filters.until);
  const { data, count, error } = await query;
  if (error) throw new Error(`${AUDIT_TABLE} : ${error.code ?? 'erreur'}`);
  return { items: (data ?? []) as AuditRow[], total: count ?? 0 };
}
