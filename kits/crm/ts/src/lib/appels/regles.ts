// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/appels/regles.ts, commit df3ff89 (2026-10-30) ; généralisé : étapes, étapes protégées, plan par résultat, fuseau, jours ouvrables, jours fériés et heure de suivi passés en CONFIGURATION (exemple [à adapter]), utilitaires de jour locaux (sans dépendance au projet), bilan par résultat, emplacements de scripts vides (« Script à recevoir ») et garde « relu par un humain », historique retiré.
//
// Poste d'appel — règles PURES (skill `tester-dabord`) : aucune base, aucun réseau, aucune horloge cachée (l'instant
// est toujours passé en paramètre). Testées dans `regles.test.ts`.
//
// Le plan calculé ici (`planResultat`) est l'APERÇU montré à la personne qui appelle ET ce que le serveur transmet à
// `public.record_call_result` (supabase/migrations/0112_call_result.sql), qui le réapplique avec les mêmes gardes
// en une transaction. Les deux doivent rester alignés : étapes, étapes protégées, raisons de perte.

// --- Configuration ----------------------------------------------------------------------------

/** Les 5 résultats d'un appel. Fixes dans le kit (la fonction SQL et le bilan en dépendent). */
export const RESULTATS = ['rdv', 'rappeler', 'message', 'pas_de_reponse', 'pas_interesse'] as const;
export type Resultat = (typeof RESULTATS)[number];

/** Issue du contact écrite sur l'activité (`activities.outcome`), vérifiée aussi par la fonction SQL. */
export const ISSUES = ['joint', 'message_laisse', 'sans_reponse'] as const;
export type Issue = (typeof ISSUES)[number];

export interface RegleResultat {
  issue: Issue;
  /** Étape visée, ou null = inchangée. */
  etape: string | null;
  /** Raison de la perte, posée seulement si l'étape visée est l'étape « perdu » (`ConfigAppels.etapePerdue`). */
  raisonPerte: string | null;
  /** Tâche « Rappeler » : à la date choisie, au prochain jour ouvrable, ou aucune. */
  suivi: 'date_choisie' | 'jour_ouvrable' | null;
}

export interface ConfigAppels {
  /** Fuseau IANA des jours et des heures (file du jour, bilan, échéance du suivi). */
  fuseau: string;
  /** Jours ouvrables, 0 = dimanche … 6 = samedi. */
  joursOuvrables: readonly number[];
  /** Jours fériés « AAAA-MM-JJ » sautés comme un week-end (facultatif). */
  joursFeries?: readonly string[];
  /** Heure locale de l'échéance de la tâche de suivi (0-23). */
  heureSuivi: number;
  /** Toutes les étapes d'une fiche, avec leur libellé (l'ordre n'a pas de sens ici). */
  etapes: Readonly<Record<string, string>>;
  /** Une fiche à l'une de ces étapes ne recule jamais, quel que soit le résultat. */
  etapesProtegees: readonly string[];
  /** Étape « perdu » : seule étape qui porte une raison de perte. */
  etapePerdue: string;
  /**
   * Passage automatique quand la personne est JOINTE (issue `joint`) et que le résultat ne vise aucune étape :
   * une fiche à une étape de `depuis` passe à `vers` (ex. nouveau → contacte). null = jamais. Même règle dans
   * 0112_call_result.sql (`c_nouvelles`, `c_contacte`) : l'aperçu annonce exactement ce que le SQL écrit.
   */
  avanceeQuandJoint: { depuis: readonly string[]; vers: string } | null;
  /** Plan de chaque résultat. */
  regles: Readonly<Record<Resultat, RegleResultat>>;
  /** Libellé de chaque résultat (sert aussi de titre d'activité et au bilan : ne pas le changer en cours de route). */
  libellesResultat: Readonly<Record<Resultat, string>>;
}

/**
 * EXEMPLE [à adapter] : étapes, libellés, fuseau et jours d'un projet type. À remplacer par ceux du projet, et à
 * reporter dans 0112_call_result.sql (listes `[à adapter]`).
 */
export const CONFIG_APPELS_EXEMPLE: ConfigAppels = {
  fuseau: 'America/Toronto', // [à adapter] heure du Québec et de l'Ontario
  joursOuvrables: [1, 2, 3, 4, 5], // [à adapter] lundi au vendredi
  joursFeries: [], // [à adapter]
  heureSuivi: 9, // [à adapter]
  etapes: {
    nouveau: 'Nouveau',
    contacte: 'Contacté',
    rdv: 'Rendez-vous pris',
    client: 'Client',
    perdu: 'Perdu',
  },
  etapesProtegees: ['rdv', 'client'],
  etapePerdue: 'perdu',
  avanceeQuandJoint: { depuis: ['nouveau'], vers: 'contacte' }, // [à adapter]
  regles: {
    rdv: { issue: 'joint', etape: 'rdv', raisonPerte: null, suivi: null },
    rappeler: { issue: 'joint', etape: 'contacte', raisonPerte: null, suivi: 'date_choisie' },
    message: { issue: 'message_laisse', etape: null, raisonPerte: null, suivi: 'jour_ouvrable' },
    pas_de_reponse: { issue: 'sans_reponse', etape: null, raisonPerte: null, suivi: 'jour_ouvrable' },
    pas_interesse: { issue: 'joint', etape: 'perdu', raisonPerte: 'pas_interesse', suivi: null },
  },
  libellesResultat: {
    rdv: 'RDV pris',
    rappeler: 'À rappeler',
    message: 'Message laissé',
    pas_de_reponse: 'Pas de réponse',
    pas_interesse: 'Pas intéressé',
  },
};

/** Erreurs d'une configuration (liste vide = valide). Appelée par `verifierConfigAppels` et par les tests. */
export function erreursConfigAppels(config: ConfigAppels): string[] {
  const erreurs: string[] = [];
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: config.fuseau });
  } catch {
    erreurs.push(`Fuseau inconnu : ${config.fuseau}`);
  }
  if (!config.joursOuvrables.length || config.joursOuvrables.some((j) => !Number.isInteger(j) || j < 0 || j > 6)) {
    erreurs.push('Jours ouvrables : au moins un, de 0 (dimanche) à 6 (samedi).');
  }
  if (!Number.isInteger(config.heureSuivi) || config.heureSuivi < 0 || config.heureSuivi > 23) {
    erreurs.push('Heure de suivi : entier de 0 à 23.');
  }
  for (const jour of config.joursFeries ?? []) if (!estJour(jour)) erreurs.push(`Jour férié illisible : ${jour}`);
  const connue = (etape: string) => Object.prototype.hasOwnProperty.call(config.etapes, etape);
  if (!connue(config.etapePerdue)) erreurs.push(`Étape « perdu » inconnue : ${config.etapePerdue}`);
  for (const etape of config.etapesProtegees) if (!connue(etape)) erreurs.push(`Étape protégée inconnue : ${etape}`);
  const avancee = config.avanceeQuandJoint;
  if (avancee) {
    if (!connue(avancee.vers)) erreurs.push(`Étape « joint » visée inconnue : ${avancee.vers}`);
    for (const etape of avancee.depuis) if (!connue(etape)) erreurs.push(`Étape « joint » de départ inconnue : ${etape}`);
  }
  for (const resultat of RESULTATS) {
    const regle = config.regles[resultat];
    if (!regle) {
      erreurs.push(`Règle manquante : ${resultat}`);
      continue;
    }
    if (!(ISSUES as readonly string[]).includes(regle.issue)) erreurs.push(`Issue inconnue pour ${resultat} : ${regle.issue}`);
    if (regle.etape !== null && !connue(regle.etape)) erreurs.push(`Étape inconnue pour ${resultat} : ${regle.etape}`);
    if (regle.raisonPerte !== null && regle.etape !== config.etapePerdue) {
      erreurs.push(`Raison de perte sans étape « perdu » pour ${resultat}.`);
    }
    if (!String(config.libellesResultat[resultat] ?? '').trim()) erreurs.push(`Libellé manquant : ${resultat}`);
  }
  const libelles = RESULTATS.map((r) => config.libellesResultat[r]);
  if (new Set(libelles).size !== libelles.length) erreurs.push('Deux résultats ont le même libellé (le bilan les confondrait).');
  return erreurs;
}

/** Lève si la configuration est incohérente : à appeler au chargement du module du projet. */
export function verifierConfigAppels(config: ConfigAppels): ConfigAppels {
  const erreurs = erreursConfigAppels(config);
  if (erreurs.length) throw new Error(`Configuration du poste d'appel invalide : ${erreurs.join(' ')}`);
  return config;
}

// --- Jours dans le fuseau ---------------------------------------------------------------------

/** « AAAA-MM-JJ » valide (jour qui existe) ? */
export function estJour(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [a, m, j] = value.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).toISOString().slice(0, 10) === value;
}

const formats = new Map<string, Intl.DateTimeFormat>();
function format(fuseau: string): Intl.DateTimeFormat {
  let f = formats.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formats.set(fuseau, f);
  }
  return f;
}

/** Date et heure locales d'un instant dans le fuseau. */
function partiesLocales(instant: number, fuseau: string) {
  const parts = format(fuseau).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { a: n('year'), m: n('month'), j: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') };
}

/** Écart (ms) entre l'heure locale et UTC à cet instant. */
function decalage(instant: number, fuseau: string): number {
  const p = partiesLocales(instant, fuseau);
  return Date.UTC(p.a, p.m - 1, p.j, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** Jour local « AAAA-MM-JJ » d'un instant. */
export function jourLocal(instant: Date, fuseau: string): string {
  const p = partiesLocales(instant.getTime(), fuseau);
  return `${String(p.a).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.j).padStart(2, '0')}`;
}

/** « AAAA-MM-JJ » + n jours (calendrier, sans fuseau). */
export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Instant ISO de `heure` h `minute` (locales) le jour « AAAA-MM-JJ » — juste aussi un jour de changement d'heure. */
export function instantLocalIso(jour: string, heure: number, fuseau: string, minute = 0): string {
  const [a, m, j] = jour.split('-').map(Number);
  const naif = Date.UTC(a, m - 1, j, heure, minute);
  let t = naif - decalage(naif, fuseau);
  t = naif - decalage(t, fuseau); // second passage : l'écart du jour du changement d'heure
  return new Date(t).toISOString();
}

/** Bornes [début, fin[ (ms) du jour local de `maintenant`. */
export function bornesDuJour(maintenant: Date, fuseau: string): { debut: number; fin: number } {
  const jour = jourLocal(maintenant, fuseau);
  return {
    debut: Date.parse(instantLocalIso(jour, 0, fuseau)),
    fin: Date.parse(instantLocalIso(ajouterJours(jour, 1), 0, fuseau)),
  };
}

/** Prochain jour ouvrable APRÈS le jour local de `maintenant` (jours non ouvrables et fériés sautés). */
export function prochainJourOuvrable(maintenant: Date, config: Pick<ConfigAppels, 'fuseau' | 'joursOuvrables' | 'joursFeries'>): string {
  const feries = new Set(config.joursFeries ?? []);
  let jour = ajouterJours(jourLocal(maintenant, config.fuseau), 1);
  // Borne : un an, pour qu'une configuration sans jour ouvrable ne boucle jamais.
  for (let essai = 0; essai < 366; essai += 1) {
    const [a, m, j] = jour.split('-').map(Number);
    const semaine = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
    if (config.joursOuvrables.includes(semaine) && !feries.has(jour)) return jour;
    jour = ajouterJours(jour, 1);
  }
  throw new Error('Aucun jour ouvrable dans l’année : configuration à revoir.');
}

// --- Résultats d'un appel ---------------------------------------------------------------------

export function estResultat(value: unknown): value is Resultat {
  return typeof value === 'string' && (RESULTATS as readonly string[]).includes(value);
}

/** Préfixe du titre de l'activité écrite par le poste d'appel (sert aussi au bilan). [à adapter] */
export const PREFIXE_TITRE = 'Appel — ';

export const titreActivite = (resultat: Resultat, config: ConfigAppels) => `${PREFIXE_TITRE}${config.libellesResultat[resultat]}`;

/** Résultat d'après le titre d'une activité du poste d'appel, sinon null. */
export function resultatDepuisTitre(titre: unknown, config: ConfigAppels): Resultat | null {
  if (typeof titre !== 'string' || !titre.startsWith(PREFIXE_TITRE)) return null;
  const libelle = titre.slice(PREFIXE_TITRE.length);
  return RESULTATS.find((r) => config.libellesResultat[r] === libelle) ?? null;
}

export interface EntreePlan {
  /** Étape actuelle de la fiche (lue en base, jamais fournie par le navigateur). */
  statut: string;
  /** Nom affiché dans le titre de la tâche de suivi. */
  nom?: string | null;
  /** Date choisie pour « À rappeler » (AAAA-MM-JJ). */
  rappelLe?: string | null;
  /** Prochain jour ouvrable (AAAA-MM-JJ), calculé par l'appelant avec `prochainJourOuvrable`. */
  jourOuvrable: string;
}

export interface PlanAppel {
  resultat: Resultat;
  /** Activité `appel` : titre et issue. */
  titre: string;
  issue: Issue;
  /** Nouvelle étape si elle change, sinon null. */
  statut: string | null;
  /** Raison de la perte, seulement si `statut === config.etapePerdue`. */
  raisonPerte: string | null;
  /** Tâche « Rappeler » à `heureSuivi` (locale) le jour donné, ou aucune. */
  suivi: { titre: string; jour: string } | null;
  /** La tâche en cours est toujours terminée. */
  terminerTache: true;
  /** Les changements, en français, pour l'aperçu. */
  apercu: string[];
}

/**
 * Plan EXACT des écritures d'un résultat d'appel. Erreur (sans rien écrire) si le résultat ou l'étape actuelle est
 * inconnu, si la date de rappel manque ou est invalide, ou si le jour ouvrable est illisible.
 * Garde : une fiche à une étape de `etapesProtegees` ne recule JAMAIS, quel que soit le résultat.
 */
export function planResultat(resultat: unknown, entree: EntreePlan, config: ConfigAppels): PlanAppel | { erreur: string } {
  if (!estResultat(resultat)) return { erreur: 'Résultat inconnu.' };
  if (!Object.prototype.hasOwnProperty.call(config.etapes, entree.statut)) return { erreur: 'Étape actuelle inconnue.' };
  const regle = config.regles[resultat];

  let jourSuivi: string | null = null;
  if (regle.suivi === 'date_choisie') {
    if (!estJour(entree.rappelLe)) return { erreur: 'Date de rappel attendue (AAAA-MM-JJ).' };
    jourSuivi = entree.rappelLe;
  } else if (regle.suivi === 'jour_ouvrable') {
    if (!estJour(entree.jourOuvrable)) return { erreur: 'Jour de relance illisible.' };
    jourSuivi = entree.jourOuvrable;
  }

  const protegee = config.etapesProtegees.includes(entree.statut);
  const avancee = config.avanceeQuandJoint;
  const visee =
    regle.etape ?? (regle.issue === 'joint' && avancee && avancee.depuis.includes(entree.statut) ? avancee.vers : null);
  const cible = protegee ? null : visee;
  const statut = cible && cible !== entree.statut ? cible : null;
  const raisonPerte = statut !== null && statut === config.etapePerdue ? regle.raisonPerte : null;

  const nom = String(entree.nom ?? '').trim().slice(0, 150);
  const suivi = jourSuivi ? { titre: nom ? `Rappeler ${nom}` : 'Rappeler', jour: jourSuivi } : null;
  const libelle = (etape: string) => config.etapes[etape] ?? etape;
  const heure = `${config.heureSuivi} h`;

  const apercu = [
    `Appel noté : « ${config.libellesResultat[resultat]} ».`,
    ...(statut ? [`Étape : ${libelle(entree.statut)} → ${libelle(statut)}.`] : []),
    ...(protegee && visee ? [`Étape inchangée : la fiche reste « ${libelle(entree.statut)} ».`] : []),
    ...(suivi ? [`Nouvelle tâche « ${suivi.titre} » le ${suivi.jour} à ${heure}.`] : []),
    'Tâche en cours terminée.',
  ];

  return {
    resultat,
    titre: titreActivite(resultat, config),
    issue: regle.issue,
    statut,
    raisonPerte,
    suivi,
    terminerTache: true,
    apercu,
  };
}

/**
 * Après « message laissé » ou « pas de réponse », personne n'a parlé à la personne qui appelle : aucun accord de vive
 * voix n'a pu être donné (loi anti-pourriel). Aucun courriel « après l'appel » ne se rédige alors.
 */
export const RESULTATS_SANS_CONVERSATION: readonly Resultat[] = ['message', 'pas_de_reponse'];
export const exigeConversation = (r: string): boolean => (RESULTATS_SANS_CONVERSATION as readonly string[]).includes(r);

// --- Scripts d'appel : emplacements vides -----------------------------------------------------

/**
 * Étapes d'un appel qui reçoivent un script. Le kit ne fournit AUCUN texte : chaque emplacement est vide et affiche
 * « Script à recevoir » tant que le client n'a pas donné le sien. [à adapter] (ajouter ou retirer des étapes).
 */
export const ETAPES_SCRIPT = ['ouverture', 'decouverte', 'objections', 'conclusion', 'message_vocal', 'courriel_suivi'] as const;
export type EtapeScript = (typeof ETAPES_SCRIPT)[number];

export const LIBELLES_ETAPE_SCRIPT: Record<EtapeScript, string> = {
  ouverture: 'Ouverture',
  decouverte: 'Découverte',
  objections: 'Objections',
  conclusion: 'Conclusion',
  message_vocal: 'Message vocal',
  courriel_suivi: 'Courriel de suivi',
};

export interface EmplacementScript {
  etape: EtapeScript;
  /** Texte fourni par le client, recopié mot pour mot ; null tant qu'il n'est pas reçu. */
  texte: string | null;
  /** Relecture humaine (conformité) AVANT tout usage : sans elle, le script n'est pas affiché. */
  relu: { par: string; le: string } | null;
}

export const SCRIPT_A_RECEVOIR = 'Script à recevoir';
export const SCRIPT_A_RELIRE = 'Script reçu, en attente de relecture';

/** Exemple de structure : un emplacement vide par étape. Le projet la remplit avec les textes de son client. */
export function scriptsVides(): Record<EtapeScript, EmplacementScript> {
  return Object.fromEntries(ETAPES_SCRIPT.map((etape) => [etape, { etape, texte: null, relu: null }])) as Record<
    EtapeScript,
    EmplacementScript
  >;
}

export type StatutScript = 'a_recevoir' | 'a_relire' | 'pret';

export function statutScript(emplacement: EmplacementScript | null | undefined): StatutScript {
  if (!emplacement || !String(emplacement.texte ?? '').trim()) return 'a_recevoir';
  const relu = emplacement.relu;
  if (!relu || !String(relu.par ?? '').trim() || !estJour(String(relu.le ?? '').slice(0, 10))) return 'a_relire';
  return 'pret';
}

/**
 * Script d'appel : « [Prénom] » → prénom, « [Nom] » → prénom et nom, seulement quand l'information existe ; sinon le
 * crochet reste visible tel quel (rien n'est inventé).
 */
export function remplirScript(texte: string, infos: { prenom?: string | null; nom?: string | null }): string {
  let t = String(texte ?? '');
  const prenom = String(infos.prenom ?? '').trim();
  const nom = String(infos.nom ?? '').trim();
  const complet = [prenom, nom].filter(Boolean).join(' ');
  if (prenom) t = t.split('[Prénom]').join(prenom);
  if (complet) t = t.split('[Nom]').join(complet);
  return t;
}

/** Ce que l'écran affiche pour une étape : le script rempli s'il est reçu ET relu, sinon le message d'attente. */
export function afficherScript(
  emplacement: EmplacementScript | null | undefined,
  infos: { prenom?: string | null; nom?: string | null },
): { statut: StatutScript; texte: string } {
  const statut = statutScript(emplacement);
  if (statut === 'a_recevoir') return { statut, texte: SCRIPT_A_RECEVOIR };
  if (statut === 'a_relire') return { statut, texte: SCRIPT_A_RELIRE };
  return { statut, texte: remplirScript(String(emplacement?.texte), infos) };
}

// --- File et bilan ----------------------------------------------------------------------------

export interface TacheFile {
  due_at: string | null;
}

/** File d'appels : en retard (avant aujourd'hui) puis du jour, chacune par échéance ; « à venir » à part. */
export function classerFile<T extends TacheFile>(taches: readonly T[], maintenant: Date, fuseau: string) {
  const { debut, fin } = bornesDuJour(maintenant, fuseau);
  const echeance = (t: T) => (t.due_at ? Date.parse(t.due_at) : Number.NaN);
  const parEcheance = (a: T, b: T) => {
    const ea = echeance(a);
    const eb = echeance(b);
    return (Number.isNaN(ea) ? Infinity : ea) - (Number.isNaN(eb) ? Infinity : eb);
  };
  const enRetard: T[] = [];
  const duJour: T[] = [];
  const aVenir: T[] = [];
  for (const t of taches) {
    const e = echeance(t);
    if (Number.isNaN(e) || e >= fin) aVenir.push(t);
    else if (e < debut) enRetard.push(t);
    else duJour.push(t);
  }
  return { enRetard: enRetard.sort(parEcheance), duJour: duJour.sort(parEcheance), aVenir: aVenir.sort(parEcheance) };
}

export interface ActiviteBilan {
  type: string;
  title: string | null;
  author: string | null;
  occurred_at: string;
}

export interface Bilan {
  appels: number;
  parResultat: Record<Resultat, number>;
}

/** Bilan du jour (local) des appels du poste d'appel faits par `auteur`. */
export function bilanDuJour(
  activites: readonly ActiviteBilan[] | null | undefined,
  maintenant: Date,
  auteur: string,
  config: ConfigAppels,
): Bilan {
  const { debut, fin } = bornesDuJour(maintenant, config.fuseau);
  const parResultat = Object.fromEntries(RESULTATS.map((r) => [r, 0])) as Record<Resultat, number>;
  let appels = 0;
  for (const a of activites ?? []) {
    const t = Date.parse(a.occurred_at);
    if (a.type !== 'appel' || a.author !== auteur || !(t >= debut && t < fin)) continue;
    const r = resultatDepuisTitre(a.title, config);
    if (!r) continue;
    appels += 1;
    parResultat[r] += 1;
  }
  return { appels, parResultat };
}

// --- Détails de l'activité --------------------------------------------------------------------

/** Durée maximale acceptée pour un appel (4 h), en secondes. */
export const DUREE_MAX_SECONDES = 4 * 3600;
export const NOTES_MAX = 2000;

/** Durée lisible : « 3 min 05 s », « 45 s ». */
export function dureeLisible(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return min > 0 ? `${min} min ${String(reste).padStart(2, '0')} s` : `${reste} s`;
}

/** Texte `details` de l'activité : notes (coupées à 2 000 caractères), puis la durée si elle est connue. null si vide. */
export function detailsAppel(notes: unknown, dureeSecondes?: number | null): string | null {
  const texte = typeof notes === 'string' ? notes.trim().slice(0, NOTES_MAX) : '';
  const duree =
    typeof dureeSecondes === 'number' && Number.isFinite(dureeSecondes) && dureeSecondes > 0
      ? `Durée : ${dureeLisible(Math.min(dureeSecondes, DUREE_MAX_SECONDES))}`
      : '';
  const lignes = [texte, duree].filter(Boolean);
  return lignes.length ? lignes.join('\n') : null;
}
