# Budget de jetons — un coût annoncé, puis un coût réel

Demande de Camille (oct. 2026) : « on gaspille les tokens ». Constats et raisons : `docs/methode/budget-jetons-details.md`.

| Palier | Estimation | Qui fait quoi |
|---|---|---|
| **Petit** | ≤ 200 k | L'agent principal fait lui-même ; pas de sous-agent sauf `qa-agent` quand le déclencheur l'exige. |
| **Moyen** | ≤ 1 M | Un agent à la fois, **au plus 2 en parallèle**. |
| **Gros** | > 1 M, **ou tout `Workflow`** | **Accord de la personne qui valide sur l'estimation** avant de lancer quoi que ce soit (aucun mode de session ne remplace cet accord). |

- Chaque plan : **« Coût estimé »** (et palier) et **« Lignes estimées »** ; chaque livraison : coût réel (usages
  rapportés par les agents + estimation de la session principale) et lignes réelles, ⚠ au-delà de 50 % d'écart, dit dès qu'il arrive.
- **Tout appel `Agent` nomme son `model`** ; filet : `CLAUDE_CODE_SUBAGENT_MODEL=opus` dans `.claude/settings.json`.
  Opus par défaut (conception, code, revues) ; Sonnet pour le contenu, et, si le projet l'écrit dans le fichier de
  l'agent, pour l'exécution d'interface déjà approuvée ; Haiku pour les automatisations et le tri ; Fable sur accord
  seulement. Aucun changement de modèle d'un agent sans raison écrite dans son fichier (grille : détails).
- **Lectures** : jamais `SUIVI-TACHES.md` en entier (`grep`, puis lecture ciblée) ; pas de relecture d'un fichier déjà
  en contexte ; avant un plan qui touche une issue, `grep -n "#<numéro>" SUIVI-TACHES.md docs/ETAT-ACTUEL.md`.
- **Vérification** : un passage, **une révision au plus** ; le reste va dans « Non fait dans ce round » ou une issue.
- **Contexte** : une nouvelle session (ou `/clear`) entre deux chantiers sans lien — chaque message relit toute la
  conversation ; l'état vit dans `docs/ETAT-ACTUEL.md`.
- **Limite d'usage** : à la première erreur, arrêt net ; état écrit sur disque et poussé ; personne prévenue ; aucune
  relance automatique. Un long travail écrit sa progression au fil de l'eau.
