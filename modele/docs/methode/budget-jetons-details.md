# Budget de jetons — détails

Complément de `.claude/rules/budget-jetons.md` (méthode 1.7.0). **La règle fait foi** ; ce document garde les
constats qui l'ont fait naître. Il n'est pas chargé automatiquement.

## Constats d'origine (VieSolution, 14-15 oct. 2026)

- ≈ 28,6 M jetons pour 12 articles : les agents des workflows, lancés sans modèle précisé, héritaient du modèle le
  plus cher de la session → **tout appel `Agent` nomme son `model`**, et `CLAUDE_CODE_SUBAGENT_MODEL=opus` sert de
  filet dans `.claude/settings.json`.
- Limite d'usage atteinte 4 fois, étapes coupées puis relancées → **arrêt net à la première limite**, état écrit sur
  disque et poussé, aucune relance automatique.
- `SUIVI-TACHES.md` (≈ 130 000 jetons) relu en entier par des agents et des skills → **jamais le suivi en entier**.
- Une décision déjà tranchée dans le suivi a été reproposée (27 oct. 2026) → **grep du numéro d'issue avant tout plan**.

## Lignes estimées (14 nov. 2026)

Les trois gros chantiers du 13 nov. ont dépassé leur coût annoncé et ajouté beaucoup plus de code que prévu. Une
estimation de lignes à côté de l'estimation de coût, puis les lignes réelles mesurées par `check-taille-diff.mjs`,
rendent l'écart visible tôt. Au-delà de 500 k estimés ou pour un nouvel écran : `BRIEF.md` +
`IMPLEMENTATION-PLAN.md` d'abord (`agent-workflow.md`).

## Sonnet pour l'exécution d'interface (14 nov. 2026)

VieSolution a passé `ux-agent` en Sonnet : l'agent exécute un plan ou une maquette déjà approuvés ; Anthropic
recommande Sonnet pour la plupart du code et Opus pour le raisonnement complexe, et Sonnet coûte environ moitié prix
par jeton. Le modèle reste **Opus par défaut** : chaque projet décide, et écrit la raison dans le fichier de l'agent.

## Nouvelle session entre deux chantiers

Chaque message relit toute la conversation : une session qui enchaîne les chantiers coûte plus cher à chaque
échange. Après un chantier complet, conseiller une nouvelle session (skill `tache`, étape 8) — l'état est dans
`docs/ETAT-ACTUEL.md` et le suivi, rien ne se perd.
