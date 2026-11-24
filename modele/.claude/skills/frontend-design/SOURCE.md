# Source

Copié depuis le plugin `frontend-design` d'Anthropic (version 1.1.1), tel qu'installé dans la session cloud
(`skills/frontend-design/`, identique à `/mnt/skills/public/frontend-design`).

- Éditeur : Anthropic
- Version : plugin `frontend-design` 1.1.1
- Licence : Apache 2.0 (`LICENSE.txt` copié à côté)
- Copié le : 2026-11-11, à la demande de Camille (« go 1 2 3 ») : la skill de plugin ne se chargeait pas pour
  `ux-designer` (rapport B5m du 10 nov.) — règle 3 de `agent-workflow.md`, aucune étape obligatoire ne dépend d'une
  skill de plugin.
- Ne se modifie pas sur place : on la remplace par une copie plus récente après relecture du diff
  (`node scripts/skills-check.mjs`).

**Note du modèle (méthode 1.7.0, copiée de VieSolution-CSF, 11 nov. 2026)** : cette skill pousse vers des choix
visuels marqués (polices, couleurs). Quand le projet a déjà son guide d'interface (`docs/projets/<slug>/UI-GUIDE.md`),
c'est le guide qui fait foi : la skill sert à éviter le rendu générique **à l'intérieur** du guide, pas à changer de
police ou de palette. Sans guide (nouveau projet), elle aide à le créer (`ux-designer`).
