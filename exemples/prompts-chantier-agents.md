# Prompts d'un chantier à trois agents (Vie Solution Web, 17 oct. 2026)

Les trois prompts tels qu'envoyés, à adapter (slug, chemins, fichiers). Ils accompagnent
`GUIDE-CHANTIER-AGENTS.md`. Chaque appel `Agent` nomme `model: "opus"` ; dans une session où les agents de
`.claude/agents/` ne sont pas encore chargés, on utilise `subagent_type: "general-purpose"` et on colle la
fiche de l'agent en tête du prompt.

## 1. `product-manager` — PRD + APP-FLOW

> Tu joues le rôle de l'agent `product-manager`. [fiche de l'agent collée ici]
> **Projet** : <dépôt, pile, où sont les pages et les composants>. Slug : `<slug>`.
> **Mission** : à partir de `docs/projets/<slug>/BRIEF.md`, écrire `PRD.md` et `APP-FLOW.md`.
> Particularité : chantier de **contenu et de parcours**. Le PRD contient, pour chaque fonctionnalité, **les
> textes proposés prêts à coller** (titres, phrases, items, questions/réponses) : l'agent suivant les
> implémentera tels quels. Ton <registre voulu>, zéro jargon ; un mot technique inévitable est expliqué en 5 mots.
> Contenu attendu : personas (3) ; fonctionnalités Doit / Devrait / Pourrait, chacune avec textes et critères
> d'acceptation ; ordre recommandé des sections ; contraintes dures pour `ux-agent` (rien d'inventé →
> `[à confirmer]`, classes CSS existantes <liste>, aucune dépendance, éditions ciblées).
> Chemins de départ (ne pas explorer plus large) : <liste de fichiers>. Pour les gros fichiers, seulement les
> 100 premières lignes.
> Écris `PRD.md` vers ton tour 12 au plus tard, `APP-FLOW.md` juste après. Rapport de 10 lignes avec ton
> usage de jetons.

## 2. `ux-agent` — implémentation

> Tu joues le rôle de l'agent `ux-agent`. [fiche + section « Propre au projet » collées ici]
> **Plan approuvé : tu exécutes, tu ne demandes aucun accord, tu ne dispatches personne, tu ne commites pas.**
> **Mission** : implémenter les sections DOIT (§4) et DEVRAIT (§5) de `docs/projets/<slug>/PRD.md`, l'ordre
> des sections (§7), les contraintes (§8) ; `APP-FLOW.md` §3 (en-têtes) et §4 (points de contrôle).
> **Ordre de travail** (lis chaque fichier une seule fois, juste avant de le modifier) : 1. lire PRD/APP-FLOW
> et les fichiers de référence ; 2. nouveaux composants ; 3. pages ; 4. textes existants ; 5. <zone sensible,
> ex. calculateur : « le calcul doit rester strictement identique »> ; 6. <chatbot> ; 7. vérification
> obligatoire : `npm run typecheck && npm run lint && npx next build`, puis les `grep` de contrôle
> (jargon, montants en `$`) ; 8. écris `docs/projets/<slug>/IMPLEMENTATION-NOTES.md` dès l'étape 3, puis
> complète au fil de l'eau.
> Ne touche pas à : <admin, API, base, prix, formulaires, ancien design, config>.
> Rapport (15 lignes) : fichiers créés/modifiés, résultat exact des commandes, écarts par rapport au PRD, ce
> qui n'a pas été fait, usage de jetons.

## 3. `qa-agent` — vérification

> Tu joues le rôle de l'agent `qa-agent`. **Plan approuvé : tu exécutes. Tu ne modifies aucun fichier : tu
> rapportes.** Ne modifie jamais une vérification pour la faire passer. Ne crois pas le rapport de l'auteur :
> vérifie dans le code.
> Contexte : <chantier>, diff non commité (`git diff` + fichiers non suivis), notes de l'auteur dans
> `IMPLEMENTATION-NOTES.md`.
> 1. Recopier les critères d'acceptation du PRD dans un tableau `| # | Critère | Preuve | Statut |`.
> 2. Vérifier chaque critère dans le code : ✅ prouvé / ❌ échoue / ⚠️ non vérifiable (dire pourquoi).
>    Points d'attention : **argent** (comparer les constantes avec `git show HEAD:<fichier>`) ; **rien
>    d'inventé** (grep chiffres/`$` sur les nouveaux fichiers) ; actions/ancres/clés existantes ; classes
>    CSS ; `git diff package.json` vide ; collecte de données inchangée.
> 3. Commandes : typecheck, lint, `check-rules`, `check-secrets-suivis`. **Ne lance pas `next build` ni
>    `next dev`** (l'agent principal les exécute ; deux `next` en parallèle corrompent `.next/`).
> 4. Relire `IMPLEMENTATION-NOTES.md` : signaler toute affirmation fausse.
> Rapport (15 lignes puis le tableau) : verdict VERT/ROUGE ; réserves bloquant / à trancher (Camille) /
> mineur avec `fichier:ligne` et correction proposée ; résultats exacts des commandes ; usage de jetons.

## 4. Révision unique (message `SendMessage` à l'`ux-agent`, repris avec son contexte)

> Le qa-agent a rendu VERT ; voici l'unique révision (pas de boucle). Corrige : 1. <fichier:ligne, quoi> ;
> 2. … ; 3. … Ne touche à rien d'autre : les points « à trancher » attendent Camille. Puis typecheck + lint,
> complète la section « Vérifications » des notes. Rapport en 5 lignes avec ton usage de jetons.
