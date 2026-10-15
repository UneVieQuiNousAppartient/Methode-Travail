---
name: tester-dabord
description: Toute règle de calcul critique (argent, quantités, droits d'accès, dates de facturation) dans une fonction pure, protégée par un test écrit avant ou avec le code — et un test de parité quand la règle existe côté client et côté serveur
when_to_use: On écrit ou on modifie une règle de calcul qui coûte cher si elle se trompe sans bruit — prix, taxes, rabais, totaux, remboursements, stock, points, droits d'accès, échéances, dates de facturation. Pas pour le pur visuel (CSS, mise en page) ni pour du texte
user-invocable: true
argument-hint: "<règle ou fichier concerné>"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
model: opus
effort: medium
---

# Tester d'abord

Une erreur de calcul ne se voit pas à l'œil : la page s'affiche, le bouton
répond, et le client paie 3 cents de trop — ou le serveur facture autre chose
que ce que la page annonçait. Chaque règle de ce genre est donc **protégée par
un test automatique**, écrit avant ou en même temps que le code, jamais « plus
tard ».

Outil de test et commande : lignes **Tests ciblés** et **Vérification** de la
Fiche projet (`CLAUDE.md`).

## 1. Ce qui est concerné

Toute règle dont l'erreur coûte de l'argent, des données ou un accès :
- **argent** : prix, taxes, rabais et codes promo, frais de livraison, totaux,
  remboursements, commissions, arrondis ;
- **quantités** : stock, limites par commande, points de fidélité, quotas ;
- **droits d'accès** : qui voit ou modifie quoi selon le rôle, l'abonnement, le
  propriétaire ;
- **dates** : facturation, échéances, renouvellements, fuseaux horaires, fin de mois.

Pas concerné : le visuel (CSS, mise en page), un texte, un simple affichage
d'une valeur déjà calculée et testée.

## 2. La règle dans une fonction pure

La logique vit dans **une fonction pure** — mêmes entrées, même sortie : sans
composant d'interface, sans réseau, sans base de données, sans stockage du
navigateur, sans `Date.now()` caché (la date est un paramètre). Elle est rangée
avec les utilitaires du domaine, et **le test est à côté** (`<fichier>.test.<ext>`).

Le composant, la route ou la fonction serveur **appellent** cette fonction ; ils
ne recopient pas la règle. Une règle recopiée à deux endroits finira par diverger.

## 3. Le test, avant ou avec le code

Écrire d'abord le cas que l'on veut obtenir, le voir échouer, puis coder.
Couvrir au minimum :
- **un cas normal** ;
- **les bornes** : 0, 1, le maximum permis, le minimum d'un rabais, le dernier
  jour du mois, le passage d'une année ;
- **un cas « méchant »** : quantité absurde, rabais plus grand que le panier
  (le total ne devient **jamais** négatif), rôle sans droit, date invalide.

Les montants se comparent **au cent près**, en entiers (cents) plutôt qu'en
nombres à virgule quand c'est possible.

## 4. Un bon test échoue si on casse la règle — le vérifier une fois

Un test qui passe quoi qu'il arrive ne protège rien. Une fois par règle :
casser volontairement le code (changer un taux, inverser une condition),
lancer le test, **constater qu'il échoue**, puis restaurer. Le noter dans le
compte rendu (« test vérifié en cassant la règle : échec observé, puis vert »).

## 5. Test de parité — quand la règle existe des deux côtés

Si la même règle est calculée **côté client** (prix affiché) et **côté serveur**
(prix facturé), un test de parité appelle **les deux vraies fonctions** sur un
grand nombre d'entrées tirées au hasard (des milliers) et compare les résultats
au cent près. Si on change la règle, on la change **aux deux endroits** et la
parité reste verte ; si elle rougit, rien ne part en ligne.

Mieux encore quand la pile le permet : une seule fonction partagée par le
client et le serveur, et la parité devient inutile.

*Exemple (Ben's)* : `orderTotals.ts` (site) et `computeOrderTotals` (fonction
serveur de paiement) doivent donner le même total ; `pricingParity.test.ts`
compare 5 000 paniers aléatoires (sous-total, rabais en pourcentage ou fixe,
livraison gratuite, taux de taxe) au cent près, dans la CI entre le lint et le build.

## 6. Interdits

- Affaiblir un test pour le faire passer (`skip`, `only`, assertion retirée,
  tolérance élargie sans raison) — règle de `qa-feature` et `agent-workflow.md`.
- Corriger la règle sans ajouter le cas qui aurait attrapé le bug.
- Livrer une règle de calcul critique sans test : `qa-agent` et `livrer` le refusent.

## Compte rendu

Fonctions pures créées ou modifiées, tests ajoutés (cas couverts), preuve que
le test échoue quand on casse la règle, parité vérifiée s'il y a lieu.
