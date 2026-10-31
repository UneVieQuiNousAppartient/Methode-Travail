// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/health/verdict.ts, commit 508f19a (2026-10-30) + KHI Educ, app/v1/admin/health/route.js (liste des contrôles : URL publique du site, anti-robots, secret de désabonnement), commit 1a02685 (2026-10-30) ; généralisé : variables du kit avec longueur minimale (état présent / trop court / absent, jamais la valeur), CRON_SECRET versé dans cette liste, verdict de l'agenda retiré (lot 3), tick jamais passé → panne, textes [à adapter] ; écrit pour le kit : verdictTurnstile, verdictSiteUrl, états lus par token-mode.ts et mfa.ts, exemple d'assemblage.
//
// Point de santé de l'admin : un VERDICT par contrôle et un verdict global (`ok` vert, `attention` jaune, `panne`
// rouge), chacun avec l'action à faire en français simple ; l'écran n'a qu'à afficher.
//
// Règle de sécurité : les verdicts ne reçoivent que des états (variable présente / trop courte / absente, booléens,
// dates). Ils ne voient jamais la valeur d'un secret, donc ne peuvent pas la renvoyer. Les seules fonctions qui
// lisent l'environnement (`etatVariables`, `etatModeJeton`, `etatSiteUrl`, `controlesEnvironnement`) le
// réduisent à ces états.
//
// Verdicts purs (la date est un paramètre), testés dans `verdict.test.ts`.
// [à adapter] Tous les textes `message` / `action` (ils citent l'hébergeur et les écrans de l'admin).
//
// EXEMPLE D'ASSEMBLAGE (pas de route dans le kit : elle dépend des écrans). Route réservée au rang `admin` :
//   import { NextResponse } from 'next/server';
//   import { deny, getTeamMember } from '@/lib/auth/team-session';
//   import { getSupabaseAdmin } from '@/lib/supabase/server-admin';
//   import { turnstileHealth } from '@/lib/api/turnstile';
//   import { lireDernierTick, HEARTBEAT_TABLE } from '@/lib/health/heartbeat';
//   import * as s from '@/lib/health/verdict';
//
//   export async function GET(request: Request) {
//     const db = getSupabaseAdmin();
//     const session = await getTeamMember(request, { db, minRole: 'admin' });
//     if (!session.ok) return deny(session.refusal);
//     const [tick, base, turnstile] = await Promise.all([
//       s.avecDelai(async () => s.verdictTick(await lireDernierTick(db!), new Date()), s.DELAI_CONTROLE_MS,
//         s.controleInjoignable('automatisations', 'Automatisations')),
//       s.avecDelai(async () => s.verdictBase(!(await db!.from(HEARTBEAT_TABLE).select('name', { head: true })).error),
//         s.DELAI_CONTROLE_MS, s.verdictBase(false)),
//       s.avecDelai(async () => s.verdictTurnstile(await turnstileHealth()), s.DELAI_CONTROLE_MS,
//         s.controleInjoignable('turnstile', 'Anti-robots des formulaires')),
//     ]);
//     const controles = [tick, base, turnstile, s.verdictSiteUrl(s.etatSiteUrl()), ...s.controlesEnvironnement()];
//     return NextResponse.json({ niveau: s.verdictGlobal(controles), controles }, { headers: { 'Cache-Control': 'no-store' } });
//   }
import { isTokenModeAllowed } from '@/lib/admin/token-mode';
import { turnstileVerdict, type TurnstileHealth } from '@/lib/api/turnstile';
import { mfaRequiredForAll } from '@/lib/auth/mfa';
import { getPublicSiteUrl, siteUrlSource, type SiteUrlSource } from '@/lib/site/site-url';

type Env = Record<string, string | undefined>;

export type Niveau = 'ok' | 'attention' | 'panne';

export interface Controle {
  id: string;
  libelle: string;
  niveau: Niveau;
  message: string;
  /** Quoi faire, en français simple ; `null` seulement quand tout va bien. */
  action: string | null;
}

const RANG: Record<Niveau, number> = { ok: 0, attention: 1, panne: 2 };

/** Pire niveau d'une liste de contrôles ; liste vide → `ok`. */
export function verdictGlobal(controles: readonly Pick<Controle, 'niveau'>[]): Niveau {
  return controles.reduce<Niveau>((pire, c) => (RANG[c.niveau] > RANG[pire] ? c.niveau : pire), 'ok');
}

// ---------------------------------------------------------------------------
// Automatisations : dernier passage du tick (table `cron_heartbeats`, ligne `tick`)
// ---------------------------------------------------------------------------

/** Le tick tourne toutes les heures : jaune après 2 h sans passage, rouge après 6 h. */
export const TICK_ATTENTION_HEURES = 2;
export const TICK_PANNE_HEURES = 6;
const HEURE_MS = 60 * 60 * 1000;

export interface DernierTick {
  lastFinishedAt: string | null;
  lastOk: boolean | null;
}

const ACTION_TICK =
  'Ouvrez l’hébergeur › Cron Jobs : vérifiez que la route du tick est planifiée et que CRON_SECRET est posé, puis lancez-la une fois à la main.';

/**
 * Verdict du dernier passage des automatisations.
 * - aucune ligne (jamais passé depuis la migration) → panne : aucune relance ne part ;
 * - fin de passage > 6 h (ou date illisible ou absente) → panne ; > 2 h → attention ;
 * - à l'heure mais `last_ok = false` → attention « dernier passage en erreur » ;
 * - sinon ok.
 */
export function verdictTick(tick: DernierTick | null, now: Date): Controle {
  const base = { id: 'automatisations', libelle: 'Automatisations' };
  if (!tick) {
    return {
      ...base,
      niveau: 'panne',
      message: 'Aucun passage enregistré : les relances et automatisations ne tournent pas.',
      action: ACTION_TICK,
    };
  }
  const fin = tick.lastFinishedAt ? new Date(tick.lastFinishedAt).getTime() : Number.NaN;
  if (!Number.isFinite(fin)) {
    return { ...base, niveau: 'panne', message: 'Date du dernier passage illisible.', action: ACTION_TICK };
  }
  const heures = (now.getTime() - fin) / HEURE_MS;
  const depuis = heures < 1 ? 'moins d’une heure' : `${Math.floor(heures)} h`;
  if (heures > TICK_PANNE_HEURES) {
    return { ...base, niveau: 'panne', message: `Aucun passage depuis ${depuis} : les relances sont arrêtées.`, action: ACTION_TICK };
  }
  if (heures > TICK_ATTENTION_HEURES) {
    return { ...base, niveau: 'attention', message: `Dernier passage il y a ${depuis} (prévu toutes les heures).`, action: ACTION_TICK };
  }
  if (tick.lastOk === false) {
    return {
      ...base,
      niveau: 'attention',
      message: `Passage il y a ${depuis}, mais le dernier passage en erreur.`,
      action: 'Ouvrez l’écran des automatisations pour voir la règle en erreur, ou les journaux de la route du tick.',
    };
  }
  return { ...base, niveau: 'ok', message: `Dernier passage il y a ${depuis}.`, action: null };
}

// ---------------------------------------------------------------------------
// Variables d'environnement : présente / trop courte / absente, jamais la valeur
// ---------------------------------------------------------------------------

export type EtatVariable = 'presente' | 'trop-courte' | 'absente';

export interface VariableAttendue {
  nom: string;
  /** Ce qui ne marche pas sans elle (affiché). */
  role: string;
  /** Niveau quand elle manque ou est trop courte. */
  siAbsente: Exclude<Niveau, 'ok'>;
  /** Longueur minimale d'un secret : plus court, il ne protège rien (même règle que le module qui le lit). */
  longueurMin?: number;
}

/** Longueur minimale de `CRON_SECRET` : plus court, il vaut « absent ». */
export const CRON_SECRET_LONGUEUR_MIN = 16;
/** Longueur minimale des secrets de signature et d'empreinte du kit (désabonnement, codes de secours, Loi 25). */
export const SECRET_LONGUEUR_MIN = 32;

/**
 * Variables des lots 1 et 2 du kit. Extensible : un projet ajoute les siennes
 * (`[...VARIABLES_ATTENDUES, { nom: 'ANTHROPIC_API_KEY', role: '…', siAbsente: 'attention' }]`).
 */
export const VARIABLES_ATTENDUES: readonly VariableAttendue[] = [
  { nom: 'NEXT_PUBLIC_SITE_URL', role: 'liens absolus des courriels et lien de désabonnement', siAbsente: 'attention' },
  { nom: 'SUPABASE_SERVICE_ROLE_KEY', role: 'base de données côté serveur (leads, admin)', siAbsente: 'panne' },
  { nom: 'CRON_SECRET', role: 'passage horaire des automatisations', siAbsente: 'panne', longueurMin: CRON_SECRET_LONGUEUR_MIN },
  { nom: 'UNSUBSCRIBE_SECRET', role: 'liens de désabonnement des courriels', siAbsente: 'attention', longueurMin: SECRET_LONGUEUR_MIN },
  { nom: 'TURNSTILE_SECRET_KEY', role: 'anti-robots des formulaires publics', siAbsente: 'attention' },
  { nom: 'RESEND_API_KEY', role: 'envoi des courriels', siAbsente: 'panne' },
  { nom: 'MFA_BACKUP_SECRET', role: 'codes de secours de la double vérification', siAbsente: 'attention', longueurMin: SECRET_LONGUEUR_MIN },
  { nom: 'PRIVACY_HASH_SECRET', role: 'effacement Loi 25 (empreinte des personnes effacées)', siAbsente: 'attention', longueurMin: SECRET_LONGUEUR_MIN },
];

/** Réduit l'environnement à un état par variable. Seule fonction de ce module qui voit une valeur ; elle ne la rend pas. */
export function etatVariables(env: Env = process.env, liste: readonly VariableAttendue[] = VARIABLES_ATTENDUES): Record<string, EtatVariable> {
  const etats: Record<string, EtatVariable> = {};
  for (const v of liste) {
    const longueur = (env[v.nom] ?? '').trim().length;
    etats[v.nom] = longueur === 0 ? 'absente' : longueur < (v.longueurMin ?? 1) ? 'trop-courte' : 'presente';
  }
  return etats;
}

export function verdictVariables(
  etats: Readonly<Record<string, EtatVariable>>,
  liste: readonly VariableAttendue[] = VARIABLES_ATTENDUES,
): Controle[] {
  return liste.map((v): Controle => {
    const etat = etats[v.nom] ?? 'absente';
    const base = { id: `env:${v.nom}`, libelle: v.nom };
    if (etat === 'presente') return { ...base, niveau: 'ok', message: 'Présente.', action: null };
    if (etat === 'trop-courte') {
      return {
        ...base,
        niveau: v.siAbsente,
        message: `Trop courte (moins de ${v.longueurMin} caractères) : ${v.role} ne fonctionne pas.`,
        action: `Remplacez ${v.nom} par au moins ${v.longueurMin} caractères aléatoires dans les variables de production, puis redéployez.`,
      };
    }
    return {
      ...base,
      niveau: v.siAbsente,
      message: `Absente : ${v.role} ne fonctionne pas.`,
      action: `Ajoutez ${v.nom} dans les variables d’environnement de production, puis redéployez.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Sécurité de l'admin
// ---------------------------------------------------------------------------

/** État du mode jeton, lu par la garde du kit (`token-mode.ts`). */
export function etatModeJeton(env: Env = process.env): { permis: boolean; enLigne: boolean } {
  return { permis: isTokenModeAllowed(env), enLigne: Boolean(env.VERCEL?.trim()) || env.NODE_ENV === 'production' };
}

export function verdictModeJeton(modeJetonPermis: boolean, enLigne: boolean): Controle {
  const risque = modeJetonPermis && enLigne;
  return {
    id: 'mode-jeton',
    libelle: 'Connexion par mot de passe partagé',
    niveau: risque ? 'attention' : 'ok',
    message: risque ? 'La connexion par mot de passe partagé (sans identité) est permise en ligne.' : 'Désactivée en ligne.',
    action: risque ? 'Retirez ADMIN_TOKEN_MODE_LOCAL des variables du serveur : chaque membre se connecte avec son courriel.' : null,
  };
}

export function verdictMfa(obligatoire: boolean): Controle {
  return {
    id: 'mfa',
    libelle: 'Double vérification',
    niveau: obligatoire ? 'ok' : 'attention',
    message: obligatoire ? 'Obligatoire pour toute l’équipe.' : 'Facultative : seuls les membres inscrits la font.',
    action: obligatoire
      ? null
      : 'Quand toute l’équipe a inscrit son application d’authentification, posez ADMIN_MFA_REQUIRED=1, puis redéployez.',
  };
}

export function verdictBase(joignable: boolean): Controle {
  return {
    id: 'base',
    libelle: 'Base de données',
    niveau: joignable ? 'ok' : 'panne',
    message: joignable ? 'Joignable.' : 'Ne répond pas : le site ne peut ni enregistrer ni lire les demandes.',
    action: joignable ? null : 'Ouvrez Supabase › projet : vérifiez qu’il n’est pas en pause et qu’aucun incident n’est annoncé.',
  };
}

// ---------------------------------------------------------------------------
// Anti-robots (Turnstile) et URL publique du site
// ---------------------------------------------------------------------------

const NIVEAU_TURNSTILE = { ok: 'ok', warning: 'attention', failure: 'panne' } as const;

/** Lecture de `turnstileHealth()` (état sans secret) par `turnstileVerdict`, en verdict du point de santé. */
export function verdictTurnstile(sante: TurnstileHealth | null | undefined, now: number = Date.now()): Controle {
  const v = turnstileVerdict(sante, now);
  const niveau = NIVEAU_TURNSTILE[v.level];
  const base = { id: 'turnstile', libelle: 'Anti-robots des formulaires' };
  if (niveau === 'ok') return { ...base, niveau, message: 'Actif.', action: null };
  return {
    ...base,
    niveau,
    message: niveau === 'panne' ? 'En défaut : les formulaires ne sont pas protégés comme prévu.' : 'À surveiller.',
    action: `${v.problem ?? 'état inconnu'}.`,
  };
}

export interface EtatSiteUrl {
  /** Une URL https publique est utilisable (`getPublicSiteUrl`). */
  publique: boolean;
  source: SiteUrlSource;
}

export function etatSiteUrl(): EtatSiteUrl {
  return { publique: Boolean(getPublicSiteUrl()), source: siteUrlSource() };
}

export function verdictSiteUrl(etat: EtatSiteUrl): Controle {
  const base = { id: 'site-url', libelle: 'Adresse publique du site' };
  if (!etat.publique) {
    return {
      ...base,
      niveau: 'panne',
      message: 'Aucune adresse https publique : les courriels partent sans liens absolus ni lien de désabonnement.',
      action: 'Posez NEXT_PUBLIC_SITE_URL (https://…, sans chemin) dans les variables de production, puis redéployez.',
    };
  }
  if (etat.source !== 'env') {
    return {
      ...base,
      niveau: 'attention',
      message: 'Adresse de repli de l’hébergeur : le domaine du client n’est pas encore déclaré.',
      action: 'Quand le domaine est branché, posez NEXT_PUBLIC_SITE_URL avec ce domaine, puis redéployez.',
    };
  }
  return { ...base, niveau: 'ok', message: 'Déclarée.', action: null };
}

/** Contrôles qui ne demandent que l'environnement (synchrones) : variables, mode jeton, double vérification. */
export function controlesEnvironnement(env: Env = process.env, liste: readonly VariableAttendue[] = VARIABLES_ATTENDUES): Controle[] {
  const jeton = etatModeJeton(env);
  return [...verdictVariables(etatVariables(env, liste), liste), verdictModeJeton(jeton.permis, jeton.enLigne), verdictMfa(mfaRequiredForAll(env))];
}

// ---------------------------------------------------------------------------
// Délai des contrôles
// ---------------------------------------------------------------------------

/** Contrôle qui n'a pas répondu dans son délai (ou a levé) : jamais 500, une ligne en attention. */
export function controleInjoignable(id: string, libelle: string): Controle {
  return {
    id,
    libelle,
    niveau: 'attention',
    message: 'Vérification impossible (pas de réponse à temps).',
    action: 'Cliquez « Revérifier » dans une minute ; si cela persiste, ouvrez les journaux du serveur.',
  };
}

/** Délai maximal d'un contrôle (la page entière reste sous 10 s : contrôles en parallèle). */
export const DELAI_CONTROLE_MS = 3000;

/** Résout `promesse`, ou `repli` si elle dépasse `ms` ou lève. Ne lève jamais. */
export async function avecDelai<T>(promesse: Promise<T> | (() => Promise<T>), ms: number, repli: T): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<T>((resolve) => {
    minuteur = setTimeout(() => resolve(repli), ms);
  });
  try {
    const travail = typeof promesse === 'function' ? promesse() : promesse;
    return await Promise.race([travail.catch(() => repli), delai]);
  } catch {
    return repli;
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}
