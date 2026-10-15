---
name: nouvelle-page
description: Créer une page publique et la raccorder vraiment au site — nav, pied de page, sitemap, maillage interne
when_to_use: Toute création d'une nouvelle route publique sous src/app/, y compris une page de comparaison ou un estimateur
user-invocable: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
disallowed-tools: []
model: opus
effort: medium
---

# Nouvelle page

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Une page n'est pas finie quand elle s'affiche. Elle est finie quand **un visiteur
peut la trouver**.

Cette skill existe à cause de trois cas réels, trouvés en deux jours sur ce
projet : `/estimateurs/reer` (page complète — formulaire, résultat, guide — sans
aucun lien entrant nulle part), les **4 pages `/comparer`** (construites en
juillet, ajoutées au sitemap, absentes de la barre de navigation ET du pied de
page), et un pied de page qui ne référençait ni `/comparer`, ni `/situations`,
ni `/services` malgré la règle « footer = plan complet » du §2.4 du suivi.

À chaque fois le même schéma : page construite ✔, sitemap ✔, **navigation
oubliée** ✘. Des semaines de travail invisibles.

Lire d'abord `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier** :
pour le §2.0 / §2.4 cités plus bas, `grep -n "2\.0\|2\.4" SUIVI-TACHES.md` puis
lecture ciblée. Agents éventuels : `ux-agent` (`model: "opus"`), traductions
`i18n-agent` (`model: "haiku"`).

## Checklist de raccordement — aucune ligne facultative

### 0. La maquette d'abord (écran important)

Pour un écran important, une maquette sur le canevas « Design » de Claude
Design (2 ou 3 variantes, contenu réel), commentée et **validée par Camille
avant toute ligne de code** — décision de la méthode (VieSolution, 15 oct. 2026)
(décisions d'outillage). Composants : ceux de `src/components/ui/` ; un nouveau
vient de shadcn/ui (un paquet Radix en plus = accord de Camille).

### 1. La page

`src/app/<route>/page.tsx`. Reprendre le gabarit d'une page voisine du même type
plutôt que d'inventer une mise en page : les 4 pages `/comparer` partagent une
structure stricte (retour au hub → H1 → verdict encadré en une phrase → tableau
`overflow-x-auto` → 2 cartes « X d'abord si… » → « bon à savoir » → CTA double →
disclaimer AMF), les pages détail d'estimateur passent toutes par
`EstimatorCalculator`.

Métadonnées via `buildPageMetadata` (`src/lib/seo.ts`) — titre, description,
`path`. Pour une page trilingue, suivre le motif `generateMetadata` +
`resolveRequestLanguage` des pages existantes.

### 2. Le sitemap

`src/app/sitemap.ts`. Les pages statiques sont listées une à une dans
`staticRoutes` ; les collections (estimateurs, articles, services) sont
générées par boucle. Vérifier de quel cas relève la nouvelle page.

Attention au filtre : la boucle des estimateurs exclut volontairement ceux dont
`isCalculatorAvailable === false` — une page qui affiche « bientôt disponible »
n'a rien à faire dans un sitemap.

### 3. La navigation — **l'étape qu'on saute**

Au moins **un** de ces trois points d'entrée, et le dire explicitement dans le
compte rendu :

- **barre de navigation** — `NAV_LINKS` ou un menu déroulant dans
  `src/components/layout/SiteHeader.tsx`. Attention : le menu **desktop et le
  menu mobile sont codés séparément dans le même fichier**, modifier les deux ;
- **pied de page** — `src/components/layout/SiteFooter.tsx`, libellés en dur
  dans les 3 langues ;
- **une page déjà accessible** — carte, lien contextuel, hub de section.

Une page atteignable seulement par son URL ou par Google n'est pas raccordée.

### 4. Le maillage interne

Dans quel sens circule le visiteur ? Le §2.5 du suivi pose l'entonnoir :
diagnostic révèle le besoin → estimateur le chiffre → rendez-vous le règle. La
nouvelle page doit avoir sa place dedans, dans les deux sens : ce qui pointe
vers elle, et ce vers quoi elle pointe.

### 5. Les langues

Tout libellé de navigation ou de pied de page existe en **FR, EN et ES**
(`src/shared/constants/languages.ts`). Une page de contenu peut rester en
français seul — c'est le cas assumé des pages `/comparer` — mais le lien qui y
mène, lui, est traduit.

### 6. Le cadre AMF

Contenu éducatif uniquement. Jamais de produit ni de prime d'assureur, jamais
de prix, aucun assureur nommé, aucun dénigrement. Comparer deux **types** de
solution est légitime ; opposer deux offres commerciales ne l'est pas. Reprendre
le disclaimer d'une page voisine, ne pas en réécrire un.

### 7. Les états

Chaque page qui charge, filtre ou envoie des données prévoit ses états :
**chargement** (squelette ou indicateur, pas d'écran blanc), **vide** (message
utile + action, pas un tableau vide), **erreur** (message clair en français
simple, possibilité de réessayer, aucun détail technique affiché). Une page
purement statique n'en a pas besoin : l'écrire dans le suivi.

### 8. Un test e2e minimal

Dans `e2e/` (Playwright), un test court par nouvelle page : elle répond, son
H1 est visible, et on l'**atteint en cliquant** depuis l'accueil ou son hub
(c'est l'étape 3 rendue vérifiable). S'inspirer de `e2e/funnel.spec.ts`. Lancer
seulement ce fichier : `npx playwright test e2e/<fichier>.spec.ts`.

## Vérification avant de dire que c'est fini

```bash
npm run typecheck && npm run lint
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000<route>       # 200
curl -s http://localhost:3000/sitemap.xml | grep <route>                  # présente
```

Puis, dans le navigateur : partir de l'accueil et **atteindre la nouvelle page
en cliquant**, sans jamais taper d'URL. Si c'est impossible, l'étape 3 n'est pas
faite — quel que soit le reste.

Vérifier enfin la vue mobile 375 px : une colonne, aucun débordement horizontal
(règle mobile-first, §2.0 du suivi).

## Suivi

Consigner dans `SUIVI-TACHES.md` selon `.claude/rules/suivi-taches.md`, en
indiquant explicitement **par où la page est accessible**. C'est cette phrase
qui rend l'oubli visible la prochaine fois.

Terminer par le **coût réel** (usages des agents + estimation de la session).
