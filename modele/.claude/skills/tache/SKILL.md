---
name: tache
description: Parcours unique d'une tâche de développement, de la demande à la PR — comprendre, lire les normes (architecture, guide d'interface, erreurs connues), choisir les skills au registre, plan et coût, faire, montrer en capture d'écran, vérifier, documenter l'erreur, livrer
when_to_use: La personne qui valide demande un changement au site, à l'admin ou à l'application (« ajoute un bouton », « change cette page », « corrige ce formulaire »…), petit ou gros ; elle propose une idée (« et si on… ? ») ; l'agent veut suggérer une tâche vue en route — et qu'il n'existe pas déjà une skill plus précise qui couvre tout le parcours (nouveau-projet, incident)
user-invocable: true
argument-hint: "<la demande, en mots simples>"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent, Skill
model: opus
effort: medium
---

# Tâche — le même parcours pour chaque demande

Méthode 1.7.0, reprise de VieSolution-CSF (`.claude/skills/tache/`, créée le 6 nov. 2026, complétée jusqu'au 15 nov.)
à la demande de Camille : « pour que chaque tâche soit bien structurée ». Ce parcours n'ajoute pas de règle : il
**enchaîne** celles qui existent (`.claude/rules/`), dans l'ordre, pour qu'aucune ne soit sautée. Une tâche simple le
traverse en quelques minutes ; ne pas l'alourdir. Rappelé à chaque message par `scripts/hook-rappel-tache.mjs`.

**Ordre de priorité** : les règles du projet (`.claude/rules/`, `CLAUDE.md`) > ce parcours > les skills et plugins.
« La personne qui valide » = ligne « Valide les livraisons » de la Fiche projet (`CLAUDE.md`).

**Ligne des 8 étapes** : à chaque « go » et à chaque livraison, la réponse contient une ligne qui coche le parcours :
`Parcours : 1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ (≈ 250 k, réel 320 k ⚠) · 5 🔄 · 6 ⏳ · 7 ⏳ · 8 ⏳`
(✅ fait · 🔄 en cours · ⏳ à venir · — sans objet · ⚠ écart à signaler, dit en une phrase juste après). Un
dépassement du coût annoncé apparaît dès qu'il arrive, pas à la livraison.

## 0. D'où vient la tâche — une seule porte d'entrée, rien n'est codé sans « oui »

| Origine | Ce que fait l'agent |
|---|---|
| **Demande** (« ajoute un bouton… ») | étape 1 |
| **Idée** à évaluer (« et si on… ? ») | ne code rien : ce qui existe déjà (autre projet, kit de `methode-travail`, outil reconnu), avantage, risque, coût, **recommandation** ; la personne décide — oui → étape 1 ; plus tard → issue étiquetée `enhancement` ; non → noté avec la raison au suivi, pour ne pas la reproposer |
| **Grosse idée** (nouveau projet, espace complet…) | skill `nouveau-projet` (documents validés un par un avant tout code) |
| **Suggestion de l'agent** (bug, amélioration, dette vus en route) | issue GitHub (bug) ou « Non fait dans ce round » ; présentée avec pourquoi et coût ; **une suggestion n'est jamais une demande** : elle attend le « oui » |

- **Doute sur l'origine** → demander en une phrase : « Voulez-vous que je le fasse maintenant, ou d'abord que je
  vous dise si c'est une bonne idée ? »
- **Seule exception** (`agent-workflow.md`) : une correction minime **dans le périmètre déjà approuvé** (ex. un test
  qui bloque la PR demandée) se fait sans attendre, mais se **dit** toujours — issue GitHub (label `bug`) pour un bug,
  même corrigé. Jamais en silence.

## 1. Comprendre
- Reformuler la demande **en une phrase**. Ambiguë → poser la question en français simple, sans jargon, et attendre.
- Classer (`agent-workflow.md`) :
  - **sensible** — argent, paiement, accès, schéma de la base, données de clients → plan + **accord avant tout code** ;
  - **complet** — 2 fichiers ou plus → plan + accord, `qa-agent` obligatoire (vérifié par le hook Git) ;
  - **simple** — 1 fichier sans enjeu → annoncer en une ligne, puis faire.
- Une issue est citée → `grep -n "#<numéro>" SUIVI-TACHES.md docs/ETAT-ACTUEL.md` (décision déjà prise ?).

## 2. Lire les normes (lecture ciblée, jamais un fichier entier sans raison)
- `docs/ARCHITECTURE.md` s'il existe — où va le code (couches, règles).
- Interface touchée → le guide d'interface (`docs/projets/<slug>/UI-GUIDE.md`) ; composants existants d'abord.
- `grep -n "<mot-clé>" docs/ERREURS-CONNUES.md` — l'erreur a-t-elle déjà été vue ?
- Le code voisin : une fonction existante fait peut-être déjà presque la chose. Le hook `hook-rappel-skills.mjs`
  signale les tâches semblables déjà faites (au suivi) à la première modification d'un dossier : s'en inspirer.

## 3. Choisir les skills — TOUJOURS, avant toute tâche
Demande de Camille (13 nov. 2026, redite deux fois : « toujours chercher les skills avant toutes tâches ») : cette
étape n'est **jamais sautée**, même pour une petite tâche, une maquette ou une analyse. Les skills choisies sont
**chargées** (outil `Skill`) avant le premier geste — pas seulement nommées — et la réponse le dit en une ligne :
« Skills : … » (ou « aucune skill adaptée » et ce qui a été cherché).
- `.claude/skills/REGISTRE.md` : quelle skill pour cette tâche ? Exemples : nouvelle route publique → `nouvelle-page` ;
  calcul (montant, score, accès, échéance) → `tester-dabord` ; interface → `ux-agent` (précharge `frontend-design`,
  `web-design-guidelines`) ; décision d'architecture → `architecture` ; CRM, admin, espace client → `nouveau-crm` ;
  bug → `incident` (et on quitte ce parcours pour le sien).
- Aucune skill adaptée → chercher dans le catalogue de skills et de plugins, **proposer** (l'installation est le clic
  de la personne qui valide) ; sinon continuer avec les règles du projet et le dire.

## 4. Plan et coût
- Le plan dit : la phrase de l'étape 1, les fichiers touchés, l'agent et la skill de chaque sous-tâche, ce qui vient
  de l'existant (autre projet, kit, outil reconnu, ou pourquoi du neuf), le **« Coût estimé »** et le palier
  (`budget-jetons.md`), et les **« Lignes estimées : ≈ +N / −M »** (`agent-workflow.md`, « Moins de code »).
  Sensible ou complet → **attendre l'accord**.
- **Tâche qui change l'écran** : le plan décrit le **rendu prévu** — où, quel composant existant, quelle couleur du
  guide, le texte exact, sur téléphone et ordinateur. Élément **nouveau ou visible** (page publique, bouton principal,
  nouvel écran) → **maquette en images** et « oui » au rendu **avant** le code définitif ; lire d'abord
  `references/maquettes.md`. Petit changement d'un seul fichier (une coquille, un texte, une couleur du guide) → le
  rendu est **annoncé** et fait sans attendre ; la validation se fait sur les captures (étape 6).
- **Seuil des documents** (décision de Camille, 14 nov. 2026) : chantier estimé à **plus de 500 k** ou **nouvel
  écran** → `BRIEF.md` + `IMPLEMENTATION-PLAN.md` courts (`tech-lead`, skill `nouveau-projet`) validés avant le code ;
  nouveau projet → chaîne complète. Avertissement automatique en CI si une PR ajoute un écran ou plus de 800 lignes
  de code sans `IMPLEMENTATION-PLAN.md` dans `docs/projets/`.

## 5. Faire
- Déléguer à l'agent du domaine (`ux-agent`, `data-agent`, `ai-agent`…), **modèle nommé**, en disant que le plan est
  approuvé et **quelle skill appliquer**. Au plus 2 agents en parallèle.
- Architecture : `check-rules` refuse un **nouveau** fichier qui accède à la base hors du domaine, qui dépasse la
  longueur permise, ou une couleur hors palette (`docs/methode/agent-workflow-details.md` § 6). On ne contourne pas :
  on range, ou on demande.

## 6. Montrer (toute tâche qui change l'écran)
- Capture **avant / après**, téléphone (390 px) et ordinateur (1280 px), avec Playwright (« Serveur local » de la
  Fiche projet, puis un court script `chromium.launch()`, `deviceScaleFactor: 2`), envoyées à la personne qui valide.
  Pas de capture possible (page derrière connexion sans compte de test) → le dire.
- **Arrêt jusqu'au « c'est bon » sur les captures.** « Pas comme ça » → corriger, refaire les captures, renvoyer. Pas
  de vérification complète ni de PR avant le oui.

## 7. Vérifier
- **Tâche qui change l'écran** : avant `qa-agent`, exiger du rapport de `ux-agent` les quatre preuves de sa « Revue
  obligatoire » (skills appliquées, tableau maquette → écran, texte client sans jargon ni valeur inventée, e2e vert et
  captures refaites). Une preuve manque → renvoyer à `ux-agent`.
- **Moins de code** (tâche complète ou sensible, avant `qa-agent`) : skill `simplify` sur le diff, puis `tech-debt`
  limitée aux fichiers touchés ; l'ancien code remplacé est supprimé (ou noté dans « Non fait ») ;
  `node scripts/check-taille-diff.mjs origin/main` donne les lignes réelles ; le prompt du `qa-agent` dit ce que les
  deux skills ont trouvé.
- Tests ciblés (« Tests ciblés » de la Fiche projet), puis la commande **Vérification**.
- `qa-agent` (Opus) si complet ou sensible ; son rapport finit par `VERDICT QA : OK` ou `KO`, et le hook Git refuse le
  commit sans ce OK sur les fichiers exacts. Ne rien modifier pendant qu'il tourne. Relire le diff des tests qu'il a
  touchés.
- Une erreur rencontrée et diagnostiquée → une ligne dans `docs/ERREURS-CONNUES.md` (message exact). Si un motif la
  détecte → une règle de plus dans `scripts/check-rules.mjs` (`regles-metier.md`). Un bug hors périmètre → issue
  GitHub, pas de correction sans accord.

## 8. Livrer
- Skill `livrer` : entrée au suivi, `docs/ETAT-ACTUEL.md` (exigés par la CI pour une PR qui touche le code), commit,
  push, PR en brouillon. **La personne qui valide fusionne.**
- Tâche qui change l'écran : la description de la PR contient les captures et la validation (date, ses mots) ; après
  le push, donner le lien de préversion (hébergeur) pour un dernier essai. Un « pas comme ça » → retour à l'étape 5,
  sur la même PR.
- Rapport en mots simples : ce qui a changé (captures), ce qui n'est pas fait, le coût réel et les lignes réelles
  (+N / −M, ⚠ au-delà de 50 % d'écart avec l'estimation).
- **Nouvelle session** (recommandation d'Anthropic : `/clear` entre deux tâches sans lien) : après la livraison d'un
  chantier complet ou sensible, et avant d'en commencer un autre sans lien, finir par : « Conseil : ouvrez une
  nouvelle session pour le prochain chantier — tout l'état est dans `docs/ETAT-ACTUEL.md` et le suivi, rien ne se
  perd. » Vérifier d'abord que l'état est écrit et que tout est poussé. Proposer aussi de l'**ouvrir soi-même** : sur
  un « oui » explicite seulement, outil `create_session` (même dépôt, même environnement, titre = le prochain
  chantier, premier message : lire `CLAUDE.md` et `docs/ETAT-ACTUEL.md`, puis suivre la skill `tache` pour <le
  chantier>). Ne jamais archiver l'ancienne session sans demande.
