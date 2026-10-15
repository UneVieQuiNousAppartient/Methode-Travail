# Historique du modèle

Version courante : fichier `VERSION`. Chaque projet note la version reçue dans `docs/ETAT-ACTUEL.md`
(« Méthode : version X ») ; un écart avec ce fichier dit ce qui reste à redescendre.
Numérotation : majeure = changement qui demande de refaire l'installation ; mineure = ajout ;
correctif = précision de texte.

## 1.1.0 — 15 oct. 2026 — Garde-fous mécaniques et Fiche projet (apports de KHI Educ)

- **Fiche projet** dans `CLAUDE.md` : source unique des commandes et chemins (pile, dossiers de code,
  commande de vérification = ce que rejoue la CI, déploiement, contrôle après déploiement, routes, langues,
  personne qui valide). Remplace la section « Commandes de vérification ».
- Skills `livrer`, `qa-feature`, `incident`, `deploiement`, `point-projet`, `audit-seo`, `nouvelle-page` et
  agent `qa-agent` renvoient à la fiche ; les commandes et chemins de VieSolution n'y restent que marqués
  *Exemple*. Bandeau « à remplacer à l'installation » retiré de ces skills.
- Hooks Claude Code : `scripts/hook-protect-files.mjs` (PreToolUse, refuse `.env*`, verrous, artefacts) et
  `scripts/hook-lint-fix.mjs` (PostToolUse, `eslint --fix` s'il est installé), déclarés dans
  `.claude/settings.json`.
- `scripts/check-rules.mjs` (règles métier mécaniques, 2 règles génériques actives + 2 exemples commentés) et
  règle `.claude/rules/regles-metier.md`.
- Hook Git `.githooks/pre-commit` : `check-suivi.js --hook` (avertissement) + `check-rules.mjs` (bloquant) ;
  remplace, dans `livrer` et `deploiement`, la dépendance aux scripts `push-*.bat` de VieSolution (cités en
  exemple). `check-suivi.js` lit ses dossiers dans la Fiche projet et gagne le mode `--hook`.
- Agents `securite` et `revue-integration` (lecture seule, Opus, verdict binaire).
- Convention `SOURCE.md` pour les skills copiées d'un autre dépôt ; `scripts/skills-check.mjs` (veille).
- `scripts/verifier-methode.mjs` : contrôle de l'installation (étape 5 de l'installation, `point-projet`).
- `exemples/check-ownership.mjs` : un périmètre par agent, appliqué par hook.
- Versionnement : `VERSION`, ce fichier, ligne « Méthode : version X » dans `docs/ETAT-ACTUEL.md`.

## 1.0.0 — 15 oct. 2026 — Extraction de VieSolution-CSF

Première version : règles (budget de jetons, workflow, suivi), réglages et hook de démarrage, chaîne de
documents `nouveau-projet` et ses 5 agents de conception, 6 agents de code, 12 skills, gabarits, exemples de
CI et de Dependabot. Extraite de VieSolution-CSF après son premier passage complet.
