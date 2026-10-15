---
name: point-projet
description: État réel du projet — écarts entre ce qui est écrit, ce qui est codé et ce qui est en ligne
when_to_use: Camille demande où on en est, avant de décider quoi faire ensuite, en début de session, ou avant une mise en production
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
disallowed-tools: Edit, Write
model: opus
effort: medium
---

# Point projet

> Chemins et commandes : **Fiche projet** de `CLAUDE.md`. Les éléments marqués *Exemple* viennent de VieSolution.

Répond à « où on en est ? » avec des **faits vérifiés**, jamais avec ce que la
documentation prétend. Cette skill existe parce que l'écart entre les deux est
le problème récurrent des projets. *Exemple (VieSolution)* : `SUIVI-TACHES.md`
annonçait le 3 août alors que du code était en production le 12 ; trois pages
construites n'étaient reliées à aucune navigation ; une page pointait vers 12 URL en 404.

**Ne modifie rien.** C'est un rapport, pas une intervention.

## Ce qu'il faut vérifier, dans cet ordre

### 0. Repartir de `docs/ETAT-ACTUEL.md`

```bash
cat docs/ETAT-ACTUEL.md
```

C'est le point de départ (≤ 40 lignes) : chantiers en cours, décisions qui
attendent Camille, PR ouvertes. Les étapes suivantes **vérifient** ce qu'il
affirme. **Ne jamais lire `SUIVI-TACHES.md` en entier** : `grep` sur
un numéro de section ou un mot-clé, puis lecture ciblée — règle
`.claude/rules/budget-jetons.md`. Pas de sous-agent pour ce point : petit
palier, l'agent principal le fait lui-même.

### 1. Écart entre le dépôt et la production

```bash
git status -sb
git log --oneline -8 --decorate
git reflog show origin/main --date=iso | head -5   # ou la branche de production
git branch -vv | grep -E "ahead|behind"
```

À dire clairement : la branche courante est-elle à jour ? Y a-t-il du travail
**non commité** (le suivi peut décrire du code que personne n'a poussé) ? Une
branche locale est-elle en retard ?

### 2. Fraîcheur du suivi et méthode

```bash
node scripts/check-suivi.js; echo "code=$?"
grep -n "Dernière mise à jour" SUIVI-TACHES.md
node scripts/verifier-methode.mjs; echo "code=$?"
```

Un code 1 de `check-suivi.js` signale un suivi périmé ou du code modifié sans
trace. `verifier-methode.mjs` contrôle l'installation de la méthode : Fiche
projet remplie, hooks présents, frontmatter des agents et skills, hook Git
actif. Si des skills ont été copiées d'un autre dépôt (`SOURCE.md`) :
`node scripts/skills-check.mjs` signale celles qui ont changé en amont (à
relire avant de remplacer — rien n'est mis à jour automatiquement).

### 3. Pages orphelines — le défaut récurrent des sites

Sans objet si la Fiche projet n'a pas de **Routes publiques**.
Une page construite mais reliée à aucune navigation n'existe pour personne. Pour
chaque route publique (dossier **Routes publiques** de la Fiche projet), vérifier
qu'elle est atteignable depuis la barre de navigation, le pied de page, ou une
page qui l'est (fichiers **Sitemap et navigation** de la fiche). *Exemple
(VieSolution, Next.js)* :

```bash
# routes publiques
ls -1 src/app/ | grep -v -E "api|dashboard|components|providers|router|\."
# ce que la navigation et le pied de page référencent réellement
grep -o "href[:=] *['\"]/[a-z-]*" src/components/layout/SiteHeader.tsx src/components/layout/SiteFooter.tsx | sort -u
```

### 4. Liens morts

Tout lien interne codé en dur peut pointer vers une route supprimée ou jamais
créée. Croiser les liens sortants avec les routes réellement définies, puis
confirmer en HTTP si le serveur local tourne (ligne **Serveur local**) :

```bash
grep -rhoE "href[:=] *['\"]/[a-z0-9/-]*" <dossiers de code> | sort -u
curl -s -o /dev/null -w "%{http_code}" <adresse du serveur local><chemin>
```

### 5. Santé technique

La commande **Vérification** de la Fiche projet.

## Format du rapport

Court, en français, sans jargon. Cinq parties :

1. **Ce qui est en ligne** — dernier commit poussé sur la branche de production, sa date, ce qu'il contient.
2. **Ce qui est fait mais pas poussé** — fichiers modifiés, et depuis quand.
3. **Ce qui est cassé ou invisible** — liens morts, pages orphelines, tests rouges, méthode mal installée (`verifier-methode`). Chaque point avec sa preuve (code HTTP, sortie de commande).
4. **Écarts avec `docs/ETAT-ACTUEL.md`** — ce qu'il affirme et qui n'est plus vrai (proposer la correction, sans l'écrire : cette skill ne modifie rien).
5. **Une seule prochaine action** — la plus utile maintenant, avec sa raison et son coût estimé (palier). Les autres pistes, s'il y en a, en une ligne chacune sous « Ensuite ».

Terminer par le coût réel du point (estimation de la session).

Règles de ton : ne jamais écrire qu'une chose fonctionne sans l'avoir vérifiée
pendant ce point. Si un contrôle n'a pas pu être fait (serveur éteint, par
exemple), le dire au lieu de le passer sous silence.
