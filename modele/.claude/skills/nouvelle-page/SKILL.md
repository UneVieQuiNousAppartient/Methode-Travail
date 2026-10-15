---
name: nouvelle-page
description: Créer une page publique et la raccorder vraiment au site — nav, pied de page, sitemap, maillage interne
when_to_use: Toute création d'une nouvelle route publique (dossier « Routes publiques » de la Fiche projet), y compris une page de comparaison, un outil ou une page de contenu
user-invocable: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
disallowed-tools: []
model: opus
effort: medium
---

# Nouvelle page

> Chemins et commandes : **Fiche projet** de `CLAUDE.md` (Routes publiques, Sitemap et navigation, Langues,
> Serveur local, Tests ciblés). Les éléments marqués *Exemple* viennent de VieSolution (Next.js, `src/app/`).

Une page n'est pas finie quand elle s'affiche. Elle est finie quand **un visiteur
peut la trouver**.

Cette skill existe à cause de trois cas réels, trouvés en deux jours sur
VieSolution : une page d'estimateur complète (formulaire, résultat, guide) sans
aucun lien entrant, **4 pages de comparaison** construites, ajoutées au sitemap,
absentes de la barre de navigation ET du pied de page, et un pied de page
incomplet malgré la règle « pied de page = plan complet du site ».

À chaque fois le même schéma : page construite ✔, sitemap ✔, **navigation
oubliée** ✘. Des semaines de travail invisibles.

Lire d'abord `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier**
(`grep` ciblé). Agents éventuels : `ux-agent` (`model: "opus"`), traductions
`model: "haiku"`.

## Checklist de raccordement — aucune ligne facultative

### 0. La maquette d'abord (écran important)

Pour un écran important, une maquette (2 ou 3 variantes, contenu réel),
commentée et **validée par la personne qui valide avant toute ligne de code**.
Composants : ceux de la bibliothèque du projet ; une nouvelle dépendance = son
accord.

### 1. La page

Dans le dossier **Routes publiques** de la Fiche projet. Reprendre le gabarit
d'une page voisine du même type plutôt que d'inventer une mise en page.
*Exemple (VieSolution)* : `src/app/<route>/page.tsx` ; les pages de comparaison
partagent une structure stricte (retour au hub → H1 → verdict en une phrase →
tableau défilant → 2 cartes « X d'abord si… » → « bon à savoir » → double
appel à l'action → avertissement réglementaire).

Métadonnées : titre, description, adresse canonique, par la fonction commune du
projet s'il en a une (*exemple* : `buildPageMetadata` de `src/lib/seo.ts`).

### 2. Le sitemap

Fichier de sitemap de la ligne **Sitemap et navigation**. Vérifier si la page
s'y ajoute une à une ou par une boucle sur une collection. Une page qui affiche
« bientôt disponible » n'a rien à faire dans un sitemap.

### 3. La navigation — **l'étape qu'on saute**

Au moins **un** de ces trois points d'entrée, et le dire explicitement dans le
compte rendu :

- **barre de navigation** — attention aux menus desktop et mobile codés
  séparément (*exemple VieSolution* : les deux dans
  `src/components/layout/SiteHeader.tsx`, modifier les deux) ;
- **pied de page** (*exemple* : `src/components/layout/SiteFooter.tsx`) ;
- **une page déjà accessible** — carte, lien contextuel, hub de section.

Une page atteignable seulement par son URL ou par un moteur de recherche n'est
pas raccordée.

### 4. Le maillage interne

Dans quel sens circule le visiteur ? La nouvelle page a sa place dans le
parcours du site, dans les deux sens : ce qui pointe vers elle, et ce vers quoi
elle pointe. *Exemple (VieSolution)* : diagnostic → estimateur → rendez-vous.

### 5. Les langues

Tout libellé de navigation ou de pied de page existe dans **chaque langue** de
la ligne **Langues**. Une page de contenu peut rester dans une seule langue si
c'est assumé et écrit au suivi — mais le lien qui y mène, lui, est traduit.

### 6. Le cadre du secteur

Si le projet a un cadre réglementaire ou des règles de contenu
(`.claude/rules/regles-metier.md`, `scripts/check-rules.mjs`) : les appliquer,
et reprendre l'avertissement d'une page voisine plutôt que d'en réécrire un.
*Exemple (VieSolution, AMF)* : contenu éducatif seulement, aucun produit,
prime ni assureur nommé.

### 7. Les états

Chaque page qui charge, filtre ou envoie des données prévoit ses états :
**chargement** (squelette ou indicateur, pas d'écran blanc), **vide** (message
utile + action, pas un tableau vide), **erreur** (message clair en français
simple, possibilité de réessayer, aucun détail technique affiché). Une page
purement statique n'en a pas besoin : l'écrire dans le suivi.

### 8. Un test e2e minimal

Un test court par nouvelle page : elle répond, son H1 est visible, et on
l'**atteint en cliquant** depuis l'accueil ou son hub (c'est l'étape 3 rendue
vérifiable). Lancer seulement ce fichier (ligne **Tests ciblés**).
*Exemple (VieSolution)* : `npx playwright test e2e/<fichier>.spec.ts`.

## Vérification avant de dire que c'est fini

La commande **Vérification** de la Fiche projet, puis, serveur local lancé :

```bash
curl -s -o /dev/null -w "%{http_code}" <adresse locale><route>     # 200
curl -s <adresse locale>/sitemap.xml | grep <route>                # présente
```

Puis, dans le navigateur : partir de l'accueil et **atteindre la nouvelle page
en cliquant**, sans jamais taper d'URL. Si c'est impossible, l'étape 3 n'est pas
faite — quel que soit le reste.

Vérifier enfin la vue mobile 375 px : une colonne, aucun débordement horizontal.

## Suivi

Consigner dans `SUIVI-TACHES.md` selon `.claude/rules/suivi-taches.md`, en
indiquant explicitement **par où la page est accessible**. C'est cette phrase
qui rend l'oubli visible la prochaine fois.

Terminer par le **coût réel** (usages des agents + estimation de la session).
