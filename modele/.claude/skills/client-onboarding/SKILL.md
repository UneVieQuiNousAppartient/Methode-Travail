---
name: client-onboarding
description: Accueillir un nouveau client de VieSolution — accès, pile technique, conventions, CRM, automatisations, livrables ; enchaîne sur nouveau-projet
when_to_use: Camille signe ou démarre un nouveau client (site, automatisation, fonction IA) et veut un point de départ propre avant tout document de projet
user-invocable: true
argument-hint: "<nom-du-client>"
allowed-tools: Read, Write, Grep, Glob, Bash
model: opus
effort: medium
---

# Accueil d'un nouveau client

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Produit `docs/projets/<slug-client>/ONBOARDING.md` (1 à 2 pages), puis
propose d'enchaîner sur `nouveau-projet`. **Aucun secret** dans ce fichier ni
dans le dépôt : on note **où** est un accès, jamais sa valeur.

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier.**

## 1. Le client
Nom, secteur, interlocuteurs (rôle, pas de données personnelles inutiles),
langue(s) du public, contraintes réglementaires (AMF si services financiers,
Loi 25 toujours au Québec).

## 2. Accès — liste à cocher
| Accès | Qui le donne | Où il est rangé | Statut |
|---|---|---|---|
| Dépôt GitHub (ou création) | | | ⏳ |
| Hébergement (Vercel ou autre) | | | ⏳ |
| Base de données (Supabase) | | | ⏳ |
| Domaine et DNS | | | ⏳ |
| Courriel d'envoi (domaine authentifié SPF/DKIM/DMARC) | | | ⏳ |
| Clé IA (Anthropic) — budget mensuel fixé | | | ⏳ |
| Outils existants du client (CRM, paiement…) | | | ⏳ |

## 3. Pile technique
Par défaut, celle de VieSolution : Next.js + TypeScript strict, Tailwind +
**shadcn/ui**, Supabase avec RLS partout, Vercel, i18n si plusieurs langues,
Claude (Sonnet par défaut) avec cache. Tout écart : noté avec sa raison.

## 4. Conventions
- `CLAUDE.md` court, `docs/ETAT-ACTUEL.md`, `.claude/rules/budget-jetons.md`
  et `.claude/settings.json` (agents nommés par modèle — Opus par défaut —, plugins inutiles coupés, hook
  de démarrage) repris de VieSolution.
- Branches `claude/<sujet>`, PR brouillon, rien fusionné sans accord.
- Migrations appliquées en production par Camille seulement.

## 5. CRM
Le client entre dans le CRM maison de VieSolution (fiche, origine, conseiller
responsable) ; ses propres prospects : dans son outil, ou dans un CRM à
construire → décision dans le BRIEF.

## 6. Automatisations
Ce qui est attendu (courriels, relances, rapports, IA) → renvoyer aux skills
`email-automation`, `diagnostic-ai`, `recommendation-engine` (guides
« chez un client »).

## 7. Livrables
Liste datée de ce que le client recevra (documents, maquettes, site,
formations), et ce qui est **hors périmètre**.

## Ensuite
Proposer à Camille : `nouveau-projet <slug-client>` (ou `petit` si le
chantier est petit). Mettre à jour `docs/ETAT-ACTUEL.md` (nouveau client,
prochaine action). Pas d'agent pour cette skill : l'agent principal suffit.

Terminer par le **coût réel** (estimation de la session).
