---
name: email-automation
description: Concevoir des courriels automatisés chez un client — déclencheurs, segments, contenu, tests, suivi des envois. Annexe — les courriels automatisés de VieSolution.
when_to_use: Un client (ou VieSolution) veut envoyer des courriels déclenchés par une action ou un calendrier (bienvenue, résultat, relance, rappel) ; ou il faut modifier ceux de VieSolution
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Agent
disallowed-tools: AskUserQuestion
model: opus
effort: medium
paths: "supabase/functions"
---

# Courriels automatisés chez un client — guide

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Le dispositif réel de VieSolution est en **annexe**, inchangé (attention :
certaines mentions y sont anciennes — vérifier dans le code avant de s'y fier).

Lire d'abord `docs/ETAT-ACTUEL.md` et les documents du projet. **Jamais
`SUIVI-TACHES.md` en entier.**

## 1. Déclencheurs
- Événement (inscription, formulaire, résultat de diagnostic) → envoi
  immédiat, idempotent (une clé par événement : pas de double envoi).
- Calendrier (relance J+3, rappel de rendez-vous) → tâche planifiée (cron,
  Edge Function) avec anti-doublon sur 24 h.
- Chaque déclencheur : condition d'arrêt (réponse reçue, désinscription, client converti).

## 2. Segments
- Critères écrits (langue, étape du parcours, consentement, source).
- **Consentement LCAP/CASL** : exprès ou tacite, daté ; désinscription en un
  clic dans chaque courriel commercial, honorée immédiatement.
- Langue du destinataire (FR/EN/ES), jamais déduite du nom.

## 3. Contenu
- Gabarits versionnés dans le dépôt ; objet, préheader, un seul appel à l'action.
- Pied obligatoire : identité de l'expéditeur, adresse, lien de désinscription.
- Contenu IA éventuel : brouillon relu, ou passé par `conformite-agent` (AMF).
- Rendu vérifié sur mobile et en mode sombre.

## 4. Tests
- Unitaires : choix du gabarit, segment, anti-doublon, désinscription.
- Envoi réel vers une adresse de test seulement ; jamais vers de vrais
  contacts depuis un environnement de test.
- Domaine authentifié (SPF, DKIM, DMARC) avant le premier envoi.

## 5. Suivi des envois
- Journal par envoi (statut, rebond, plainte, ouverture si mesurée) via
  webhook du fournisseur.
- Rebonds durs et plaintes → contact suspendu automatiquement.
- Tableau de bord ou rapport : envoyés, délivrés, taux de rebond.

## Agents et modèles
Construction (gabarits, cron, Edge Functions) : `automation-dev-agent`
(`model: "opus"`). Exploitation quotidienne : `email-automation-agent`
(`model: "haiku"`, tâche mécanique). Contenu client : `conformite-agent`
(`model: "opus"`). Fin : `qa-agent` (`model: "opus"`).

**Terminer par le coût réel** (usages des agents + estimation de la session).

---

> Le modèle ne reprend pas l'annexe propre à VieSolution (exemple concret d'implémentation) : voir le dépôt VieSolution-CSF si besoin.
