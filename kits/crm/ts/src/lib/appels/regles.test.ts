// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/appels/regles.test.ts, commit df3ff89 (2026-10-30) ; généralisé : configuration d'exemple du kit (étapes, fuseau, jours) au lieu des valeurs du projet source ; ajoutés : validation de la configuration, jours fériés, autre fuseau, emplacements de scripts vides.
import { describe, expect, it } from 'vitest';
import {
  CONFIG_APPELS_EXEMPLE as C,
  ETAPES_SCRIPT,
  RESULTATS,
  SCRIPT_A_RECEVOIR,
  SCRIPT_A_RELIRE,
  afficherScript,
  bilanDuJour,
  bornesDuJour,
  classerFile,
  detailsAppel,
  erreursConfigAppels,
  estJour,
  estResultat,
  exigeConversation,
  instantLocalIso,
  jourLocal,
  planResultat,
  prochainJourOuvrable,
  remplirScript,
  resultatDepuisTitre,
  scriptsVides,
  statutScript,
  titreActivite,
  verifierConfigAppels,
  type ConfigAppels,
  type PlanAppel,
} from './regles';

const plan = (resultat: unknown, entree: Parameters<typeof planResultat>[1], config: ConfigAppels = C): PlanAppel => {
  const p = planResultat(resultat, entree, config);
  if ('erreur' in p) throw new Error(p.erreur);
  return p;
};

const base = { statut: 'nouveau', nom: 'Julie Roy', jourOuvrable: '2026-11-02' };

describe('configuration', () => {
  it('l’exemple du kit est cohérent', () => {
    expect(erreursConfigAppels(C)).toEqual([]);
    expect(verifierConfigAppels(C)).toBe(C);
  });
  it('incohérences signalées', () => {
    const casse: ConfigAppels = {
      ...C,
      fuseau: 'Mars/Olympus',
      joursOuvrables: [],
      heureSuivi: 25,
      joursFeries: ['2026-02-30'],
      etapesProtegees: ['inconnue'],
      avanceeQuandJoint: { depuis: ['fantome'], vers: 'ailleurs' },
      regles: { ...C.regles, rdv: { issue: 'joint', etape: 'nulle-part', raisonPerte: 'x', suivi: null } },
      libellesResultat: { ...C.libellesResultat, message: C.libellesResultat.rdv },
    };
    const e = erreursConfigAppels(casse).join(' | ');
    for (const attendu of ['Fuseau inconnu', 'Jours ouvrables', 'Heure de suivi', 'Jour férié', 'Étape protégée inconnue', 'Étape « joint » visée inconnue', 'Étape « joint » de départ inconnue', 'Étape inconnue pour rdv', 'Raison de perte sans étape', 'même libellé']) {
      expect(e).toContain(attendu);
    }
    expect(() => verifierConfigAppels(casse)).toThrow(/invalide/);
  });
});

describe('prochainJourOuvrable (fuseau et jours en paramètres)', () => {
  it('mercredi → jeudi', () => {
    expect(prochainJourOuvrable(new Date('2026-10-28T15:00:00Z'), C)).toBe('2026-10-29');
  });
  it('vendredi, samedi, dimanche → lundi', () => {
    expect(prochainJourOuvrable(new Date('2026-10-30T15:00:00Z'), C)).toBe('2026-11-02');
    expect(prochainJourOuvrable(new Date('2026-10-31T15:00:00Z'), C)).toBe('2026-11-02');
    expect(prochainJourOuvrable(new Date('2026-11-01T15:00:00Z'), C)).toBe('2026-11-02');
  });
  it('le jour est celui du fuseau : jeudi 22 h à Toronto (vendredi 02:00 UTC) → vendredi', () => {
    expect(prochainJourOuvrable(new Date('2026-10-30T02:00:00Z'), C)).toBe('2026-10-30');
    // Même instant à Paris : déjà vendredi → lundi.
    expect(prochainJourOuvrable(new Date('2026-10-30T02:00:00Z'), { ...C, fuseau: 'Europe/Paris' })).toBe('2026-11-02');
  });
  it('jours fériés sautés ; semaine de six jours', () => {
    expect(prochainJourOuvrable(new Date('2026-10-30T15:00:00Z'), { ...C, joursFeries: ['2026-11-02'] })).toBe('2026-11-03');
    expect(prochainJourOuvrable(new Date('2026-10-30T15:00:00Z'), { ...C, joursOuvrables: [1, 2, 3, 4, 5, 6] })).toBe('2026-10-31');
  });
  it('aucun jour ouvrable : erreur, jamais de boucle sans fin', () => {
    expect(() => prochainJourOuvrable(new Date('2026-10-30T15:00:00Z'), { ...C, joursOuvrables: [] })).toThrow();
  });
});

describe('jours locaux', () => {
  it('estJour', () => {
    expect(estJour('2026-11-03')).toBe(true);
    expect(estJour('2026-02-30')).toBe(false);
    expect(estJour('3 nov.')).toBe(false);
    expect(estJour(null)).toBe(false);
  });
  it('9 h à Toronto : heure d’été, heure normale, jours des changements d’heure', () => {
    expect(instantLocalIso('2026-10-29', 9, C.fuseau)).toBe('2026-10-29T13:00:00.000Z');
    expect(instantLocalIso('2026-11-02', 9, C.fuseau)).toBe('2026-11-02T14:00:00.000Z');
    expect(instantLocalIso('2026-11-01', 9, C.fuseau)).toBe('2026-11-01T14:00:00.000Z');
    expect(instantLocalIso('2026-03-08', 9, C.fuseau)).toBe('2026-03-08T13:00:00.000Z');
    expect(instantLocalIso('2026-11-01', 0, C.fuseau)).toBe('2026-11-01T04:00:00.000Z');
  });
  it('autre fuseau', () => {
    expect(instantLocalIso('2026-07-01', 9, 'America/Vancouver')).toBe('2026-07-01T16:00:00.000Z');
    expect(jourLocal(new Date('2026-07-01T05:00:00Z'), 'America/Vancouver')).toBe('2026-06-30');
  });
  it('un jour de changement d’heure dure 25 h', () => {
    const { debut, fin } = bornesDuJour(new Date('2026-11-01T16:00:00Z'), C.fuseau);
    expect((fin - debut) / 3_600_000).toBe(25);
  });
});

describe('planResultat — un cas par résultat', () => {
  it('rdv : étape « rdv », issue « joint », aucune tâche', () => {
    const p = plan('rdv', base);
    expect(p).toMatchObject({ statut: 'rdv', issue: 'joint', raisonPerte: null, suivi: null, terminerTache: true });
    expect(p.titre).toBe('Appel — RDV pris');
  });

  it('rappeler : étape « contacte », tâche « Rappeler » à la date choisie', () => {
    const p = plan('rappeler', { ...base, rappelLe: '2026-11-05' });
    expect(p.statut).toBe('contacte');
    expect(p.issue).toBe('joint');
    expect(p.suivi).toEqual({ titre: 'Rappeler Julie Roy', jour: '2026-11-05' });
    expect(p.apercu).toContain('Nouvelle tâche « Rappeler Julie Roy » le 2026-11-05 à 9 h.');
  });

  it('rappeler : date obligatoire et valide', () => {
    const erreur = { erreur: 'Date de rappel attendue (AAAA-MM-JJ).' };
    expect(planResultat('rappeler', { ...base, rappelLe: '' }, C)).toEqual(erreur);
    expect(planResultat('rappeler', { ...base, rappelLe: '2026-02-30' }, C)).toEqual(erreur);
    expect(planResultat('rappeler', { ...base }, C)).toEqual(erreur);
  });

  it('message : issue « message_laisse », étape inchangée, tâche le prochain jour ouvrable (date choisie ignorée)', () => {
    const p = plan('message', { ...base, rappelLe: '2026-12-01' });
    expect(p.issue).toBe('message_laisse');
    expect(p.statut).toBeNull();
    expect(p.suivi).toEqual({ titre: 'Rappeler Julie Roy', jour: '2026-11-02' });
  });

  it('pas_de_reponse : issue « sans_reponse », étape inchangée, prochain jour ouvrable', () => {
    const p = plan('pas_de_reponse', { ...base, statut: 'contacte' });
    expect(p.issue).toBe('sans_reponse');
    expect(p.statut).toBeNull();
    expect(p.suivi?.jour).toBe('2026-11-02');
    expect(planResultat('pas_de_reponse', { ...base, jourOuvrable: 'x' }, C)).toEqual({ erreur: 'Jour de relance illisible.' });
  });

  it('pas_interesse : étape « perdu », raison posée, aucune tâche', () => {
    const p = plan('pas_interesse', { ...base, rappelLe: '2026-11-05' });
    expect(p).toMatchObject({ statut: 'perdu', raisonPerte: 'pas_interesse', issue: 'joint', suivi: null });
  });

  it('résultat ou étape actuelle inconnus : erreur', () => {
    expect(planResultat('vendu', base, C)).toEqual({ erreur: 'Résultat inconnu.' });
    expect(planResultat('rdv', { ...base, statut: 'mystere' }, C)).toEqual({ erreur: 'Étape actuelle inconnue.' });
    expect(planResultat('rdv', { ...base, statut: 'toString' }, C)).toEqual({ erreur: 'Étape actuelle inconnue.' });
    expect(estResultat('rdv')).toBe(true);
    expect(estResultat('RDV')).toBe(false);
  });

  it('sans nom : tâche « Rappeler »', () => {
    expect(plan('message', { ...base, nom: '  ' }).suivi?.titre).toBe('Rappeler');
  });
});

describe('planResultat — garde : une étape protégée ne recule jamais', () => {
  for (const statut of C.etapesProtegees) {
    it(`${statut} : aucun résultat ne change l'étape`, () => {
      for (const resultat of RESULTATS) {
        const p = plan(resultat, { ...base, statut, rappelLe: '2026-11-05' });
        expect(p.statut, resultat).toBeNull();
        expect(p.raisonPerte, resultat).toBeNull();
      }
      expect(plan('pas_interesse', { ...base, statut }).apercu.some((l) => l.includes('Étape inchangée'))).toBe(true);
    });
  }

  it('les autres étapes changent bien (contrôle de la garde)', () => {
    expect(plan('pas_interesse', { ...base, statut: 'contacte' }).statut).toBe('perdu');
    expect(plan('rdv', { ...base, statut: 'nouveau' }).statut).toBe('rdv');
    expect(plan('rappeler', { ...base, statut: 'perdu', rappelLe: '2026-11-05' }).statut).toBe('contacte');
  });

  it('les étapes protégées viennent de la configuration', () => {
    const config = { ...C, etapesProtegees: ['client'] };
    expect(plan('pas_interesse', { ...base, statut: 'rdv' }, config).statut).toBe('perdu');
    expect(plan('pas_interesse', { ...base, statut: 'client' }, config).statut).toBeNull();
  });

  it('passage automatique quand la personne est jointe (avanceeQuandJoint), comme le SQL', () => {
    // Résultat « joint » qui ne vise aucune étape : seule l'avancée configurée s'applique.
    const config: ConfigAppels = { ...C, regles: { ...C.regles, rappeler: { ...C.regles.rappeler, etape: null } } };
    const r = (statut: string, c: ConfigAppels = config) => plan('rappeler', { ...base, statut, rappelLe: '2026-11-05' }, c);
    expect(r('nouveau').statut).toBe('contacte');
    expect(r('nouveau').apercu).toContain('Étape : Nouveau → Contacté.');
    expect(r('contacte').statut).toBeNull();
    expect(r('perdu').statut).toBeNull();
    expect(r('client').statut).toBeNull();
    const protegeNouveau = { ...config, etapesProtegees: [...config.etapesProtegees, 'nouveau'] };
    expect(r('nouveau', protegeNouveau).statut).toBeNull();
    expect(r('nouveau', protegeNouveau).apercu.some((l) => l.includes('Étape inchangée'))).toBe(true);
    expect(r('nouveau', { ...config, avanceeQuandJoint: null }).statut).toBeNull();
    // Issue non « joint » : jamais d'avancée.
    expect(plan('message', base, config).statut).toBeNull();
    // Une étape visée par le résultat l'emporte sur l'avancée.
    expect(plan('rdv', base).statut).toBe('rdv');
  });

  it('même étape : pas de changement annoncé', () => {
    expect(plan('rappeler', { ...base, statut: 'contacte', rappelLe: '2026-11-05' }).statut).toBeNull();
  });
});

describe('sans conversation', () => {
  it('message laissé et pas de réponse seulement', () => {
    expect(RESULTATS.filter(exigeConversation)).toEqual(['message', 'pas_de_reponse']);
  });
});

describe('scripts : emplacements vides, « Script à recevoir »', () => {
  it('une structure vide par étape d’appel, aucun texte fourni par le kit', () => {
    const s = scriptsVides();
    expect(Object.keys(s)).toEqual([...ETAPES_SCRIPT]);
    for (const e of ETAPES_SCRIPT) {
      expect(s[e].texte).toBeNull();
      expect(afficherScript(s[e], { prenom: 'Julie' })).toEqual({ statut: 'a_recevoir', texte: SCRIPT_A_RECEVOIR });
    }
    expect(afficherScript(undefined, {}).texte).toBe(SCRIPT_A_RECEVOIR);
  });
  it('texte reçu mais non relu : pas affiché', () => {
    const e = { etape: 'ouverture' as const, texte: 'Bonjour [Prénom].', relu: null };
    expect(afficherScript(e, { prenom: 'Julie' })).toEqual({ statut: 'a_relire', texte: SCRIPT_A_RELIRE });
    expect(statutScript({ ...e, relu: { par: ' ', le: '2026-10-30' } })).toBe('a_relire');
    expect(statutScript({ ...e, relu: { par: 'Responsable', le: 'hier' } })).toBe('a_relire');
  });
  it('reçu et relu : affiché, crochets remplis', () => {
    const e = { etape: 'ouverture' as const, texte: 'Bonjour [Prénom].', relu: { par: 'Responsable', le: '2026-10-30' } };
    expect(afficherScript(e, { prenom: 'Julie' })).toEqual({ statut: 'pret', texte: 'Bonjour Julie.' });
  });
  it('remplirScript : crochets remplacés seulement si l’information existe', () => {
    const s = 'Bonjour [Prénom], je parle bien à [Nom] ?';
    expect(remplirScript(s, { prenom: 'Julie', nom: 'Roy' })).toBe('Bonjour Julie, je parle bien à Julie Roy ?');
    expect(remplirScript(s, { prenom: '', nom: null })).toBe(s);
    expect(remplirScript(s, { nom: 'Roy' })).toBe('Bonjour [Prénom], je parle bien à Roy ?');
  });
});

describe('classerFile', () => {
  const maintenant = new Date('2026-10-29T16:00:00Z'); // jeudi midi à Toronto
  it('en retard, puis du jour (par échéance) ; à venir et sans échéance à part', () => {
    const taches = [
      { id: 'demain', due_at: '2026-10-30T13:00:00Z' },
      { id: 'jour-tard', due_at: '2026-10-30T03:00:00Z' }, // 23 h jeudi à Toronto
      { id: 'jour-tot', due_at: '2026-10-29T13:00:00Z' },
      { id: 'retard', due_at: '2026-10-29T03:00:00Z' }, // 23 h mercredi à Toronto
      { id: 'sans', due_at: null },
      { id: 'vieux', due_at: '2026-10-01T13:00:00Z' },
    ];
    const f = classerFile(taches, maintenant, C.fuseau);
    expect(f.enRetard.map((t) => t.id)).toEqual(['vieux', 'retard']);
    expect(f.duJour.map((t) => t.id)).toEqual(['jour-tot', 'jour-tard']);
    expect(f.aVenir.map((t) => t.id)).toEqual(['demain', 'sans']);
  });
});

describe('bilanDuJour', () => {
  const maintenant = new Date('2026-10-29T16:00:00Z');
  it('compte les appels du poste de l’auteur, aujourd’hui (fuseau) seulement', () => {
    const a = (title: string, occurred_at = '2026-10-29T14:00:00Z', author = 'Alice', type = 'appel') => ({ type, title, author, occurred_at });
    const b = bilanDuJour(
      [
        ...RESULTATS.map((r) => a(titreActivite(r, C))),
        a(titreActivite('rdv', C), '2026-10-29T03:00:00Z'), // hier soir à Toronto
        a(titreActivite('rdv', C), '2026-10-29T14:00:00Z', 'Bruno'),
        a('Appel — joint'), // appel noté ailleurs que dans le poste
        a(titreActivite('rdv', C), '2026-10-29T14:00:00Z', 'Alice', 'note'),
      ],
      maintenant,
      'Alice',
      C,
    );
    expect(b).toEqual({ appels: 5, parResultat: { rdv: 1, rappeler: 1, message: 1, pas_de_reponse: 1, pas_interesse: 1 } });
    expect(resultatDepuisTitre('Appel — Pas de réponse', C)).toBe('pas_de_reponse');
    expect(resultatDepuisTitre(null, C)).toBeNull();
  });
});

describe('detailsAppel', () => {
  it('notes puis durée ; rien → null', () => {
    expect(detailsAppel('  Rappeler le matin ', 185)).toBe('Rappeler le matin\nDurée : 3 min 05 s');
    expect(detailsAppel('', 45)).toBe('Durée : 45 s');
    expect(detailsAppel(null, 0)).toBeNull();
    expect(detailsAppel('x'.repeat(3000), null)).toHaveLength(2000);
    expect(detailsAppel(undefined, 99_999)).toBe('Durée : 240 min 00 s');
  });
});
