---
name: recommendation-engine
description: Concevoir un moteur de recommandation chez un client — sources de données, règles, score, API, évaluation. Annexe — les recommandations de parcours d'apprentissage de VieSolution.
when_to_use: Un client (ou VieSolution) veut proposer automatiquement un contenu, un parcours ou une action selon le profil d'un utilisateur ; ou il faut modifier les recommandations de parcours de VieSolution
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Agent
disallowed-tools: AskUserQuestion
model: opus
effort: medium
paths: "src/lib/ai/recommendations"
---

# Moteur de recommandation chez un client — guide

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

La partie « parcours d'apprentissage » de VieSolution est en **annexe**,
inchangée.

Lire d'abord `docs/ETAT-ACTUEL.md` et les documents du projet. **Jamais
`SUIVI-TACHES.md` en entier.**

## 1. Sources de données
- Ce qui est connu de l'utilisateur (réponses, historique, progression) et
  ce qui est recommandable (catalogue, avec métadonnées : thème, niveau, durée).
- Minimisation (Loi 25) : n'utiliser que ce qui change la recommandation.
- Démarrage à froid : quoi proposer sans historique.

## 2. Règles
- Règles dures d'abord (exclusions, prérequis, conformité AMF : jamais un
  produit financier précis), écrites en code testé.
- Profils précalculés pour les cas fréquents (0 $ par appel).
- L'IA n'intervient qu'en dernier, pour classer ou expliquer, avec cache.

## 3. Score
- Formule explicite et documentée (pondérations nommées), bornée 0-100.
- Chaque recommandation garde sa raison (« parce que… ») affichable.
- Égalités départagées de façon déterministe (tests reproductibles).

## 4. API
- Une route ou fonction : entrée validée (zod), sortie typée (liste ordonnée
  + score + raison), temps de réponse borné.
- Cache par profil (24 h) ; invalidation quand le catalogue change.

## 5. Évaluation
- Jeu de profils de référence avec la recommandation attendue (tests unitaires).
- En production : taux de clic, d'inscription, d'abandon par recommandation ;
  revue mensuelle des pondérations.

## Agents et modèles
Données et tables : `data-agent` (`model: "opus"`). Logique et IA :
`ai-agent` (`model: "opus"`) ; classement mécanique ou contrôle de
catalogue : `model: "haiku"`. Fin : `qa-agent` (`model: "opus"`).

**Terminer par le coût réel** (usages des agents + estimation de la session).

---

> Le modèle ne reprend pas l'annexe propre à VieSolution (exemple concret d'implémentation) : voir le dépôt VieSolution-CSF si besoin.
