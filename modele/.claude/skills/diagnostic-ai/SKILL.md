---
name: diagnostic-ai
description: Concevoir et intégrer une fonction IA chez un client (diagnostic, analyse, recommandation par Claude) — cas d'usage, données, garde-fous AMF et Loi 25, coût par appel, intégration. Annexe — le diagnostic IA de VieSolution.
when_to_use: Un client (ou VieSolution) veut une fonction qui analyse des réponses ou des données avec Claude et produit un résultat personnalisé ; ou il faut modifier le diagnostic IA de VieSolution
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Agent
disallowed-tools: AskUserQuestion
model: opus
effort: medium
paths: "src/lib/ai/claude"
---

# Fonction IA chez un client — guide

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Guide pour concevoir une fonction « l'IA analyse et recommande ». Le cas réel
de VieSolution (diagnostic financier) est en **annexe**, inchangé : s'en
servir comme exemple, pas comme gabarit à recopier.

Lire d'abord `docs/ETAT-ACTUEL.md` et, s'ils existent, les documents du projet
(`docs/projets/<slug>/PRD.md`, `TRD.md`). **Jamais `SUIVI-TACHES.md` en entier.**
Pour une nouvelle fonction importante, passer par la skill `nouveau-projet`.

## 1. Cas d'usage
- Qui pose la question, à quel moment, et quelle décision le résultat aide à prendre.
- Ce que l'IA **décide** vs ce que des règles fixes calculent (montants, seuils :
  toujours par du code testé, jamais par le modèle).
- Ce qui se passe si l'IA est indisponible : un résultat de repli par règles.

## 2. Données
- Entrées minimales (minimisation, Loi 25) ; aucun nom, courriel ou téléphone
  dans le prompt si le résultat n'en a pas besoin.
- Contexte injecté (base de connaissances, profils précalculés), jamais de
  donnée utilisateur codée en dur dans le prompt système.
- Validation des entrées (zod) avant tout appel ; sortie structurée (JSON
  validé) plutôt que du texte libre à analyser.

## 3. Garde-fous
- **AMF** : contenu éducatif ; aucune recommandation de produit, d'assureur
  ni de montant de prime ; renvoi vers un conseiller. Tout contenu IA destiné
  à un client passe par `conformite-agent` (jamais optionnel).
- **Loi 25** : consentement explicite avant collecte, durée de conservation,
  journalisation sans données sensibles.
- Sécurité : route protégée (limite de débit, Turnstile ou authentification),
  clé API côté serveur seulement, entrées traitées comme non fiables
  (injection de prompt).

## 4. Coût par appel
- Trois couches, dans l'ordre : **précalculé** (0 $) → **cache 24 h** (0 $) →
  **appel Claude** (prompt caching du système). Chiffrer : jetons d'entrée et
  de sortie × prix du modèle × volume mensuel estimé.
- Modèle : Haiku pour classer/trier, Sonnet par défaut pour rédiger. Écrire le
  coût estimé dans un commentaire près de l'appel (règle d'intégration IA du projet, ex. `.claude/rules/ai-integration.md` dans VieSolution).

## 5. Intégration
- Code IA regroupé (VieSolution : `src/lib/ai/`), route API dédiée, hook ou
  composant côté client.
- Tests : unitaires sur le repli et la validation ; e2e avec l'API simulée
  (aucune clé en CI) ; tester les 3 couches.
- Suivi en production : taux de cache, erreurs, coût réel du mois.

## Agents et modèles
Rédaction de prompts et cache : `ai-agent` (`model: "opus"`). Conformité :
`conformite-agent` (`model: "opus"`). Vérification finale : `qa-agent`
(`model: "opus"`). Au plus 2 agents en parallèle.

**Terminer par le coût réel** (usages des agents + estimation de la session).

---

> Le modèle ne reprend pas l'annexe propre à VieSolution (exemple concret d'implémentation) : voir le dépôt VieSolution-CSF si besoin.
