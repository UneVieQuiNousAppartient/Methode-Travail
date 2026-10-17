# Guide — mener un chantier avec les agents qui se parlent (à copier pour chaque projet)

Écrit à partir du chantier « Site plus accessible aux PME et travailleurs autonomes » de Vie Solution Web
(17 oct. 2026). Le même déroulé vaut pour Ben's, le trading, WFG ou un projet client : seuls les noms
des fichiers changent. Lire une fois ; ensuite, copier la section « Recette » dans la demande à Claude.

## Ce qui s'est passé, en une page

| Étape | Qui | Entrée | Sortie | Coût réel |
|---|---|---|---|---|
| 0. Installer la méthode | agent principal | `methode-travail/modele/` | `.claude/`, `scripts/`, `CLAUDE.md` (Fiche projet), `docs/ETAT-ACTUEL.md`, `SUIVI-TACHES.md`, `BRIEF.md` ; `node scripts/verifier-methode.mjs` → 26 ✔ | ≈ 100 k |
| 1. Diagnostic + textes | `product-manager` (Opus) | `BRIEF.md` + lecture ciblée du site | `PRD.md` (4 000 mots, textes prêts à coller, critères d'acceptation) + `APP-FLOW.md` | 115 k |
| 2. Implémentation | `ux-agent` (Opus) | `PRD.md` §4-8, `APP-FLOW.md` §3-4 | 3 composants, 17 fichiers modifiés, `IMPLEMENTATION-NOTES.md` ; typecheck + lint + build verts | 160 k |
| 3. Vérification | `qa-agent` (Opus, lecture seule) | diff + critères du PRD | verdict VERT, 38 critères prouvés un à un, 4 points « à trancher », 4 mineurs | 148 k |
| 4. Révision unique | `ux-agent` (repris, même contexte) | réserves du `qa-agent` triées par l'agent principal | 3 corrections | ≈ 20 k |
| 5. Navigateur, commit, PR, suivi, rapport | agent principal | tout ce qui précède | captures d'écran desktop/mobile, ancres testées, `npm run verify`, commit, PR brouillon, suivi à jour, ce guide | ≈ 350 k |

**Total ≈ 900 k jetons**, pour une estimation annoncée de 1 M (palier « Gros », accord de Camille obtenu
avant de lancer). Durée : environ 2 heures d'horloge, dont 7 minutes d'`ux-agent` et 3 minutes de `qa-agent`.

## Comment les agents se sont parlé

Les agents ne se parlent pas directement : **l'agent principal est le seul relais**, et c'est voulu.
- Chaque agent reçoit **un prompt complet** (sa fiche d'agent recopiée, les chemins de départ, l'ordre de
  travail, quand écrire son livrable, ce qu'il ne doit pas toucher) et rend **un rapport de 10-15 lignes avec
  son usage de jetons**.
- Le livrable d'un agent est **un fichier dans `docs/projets/<slug>/`** (PRD, APP-FLOW, IMPLEMENTATION-NOTES),
  jamais seulement un message : c'est le fichier que l'agent suivant lit, et c'est ce qui survit à une coupure.
- L'agent principal **relit chaque rapport dans le code** avant de le transmettre (règle « ne jamais accepter un
  rapport sur parole ») : ici, le diff du calculateur (zone argent) a été relu ligne à ligne avant le QA.
- La **révision** passe par `SendMessage` vers l'agent qui a codé — **repris avec son contexte**, pas relancé à
  froid — avec les seules réserves qu'il peut régler seul. Les décisions qui reviennent à Camille (prix,
  durées, mentions à valider) ne lui sont pas envoyées : elles vont dans « Décisions qui attendent Camille ».
- **Une révision au plus** (`budget-jetons.md`) : ce qui reste après va dans « Non fait dans ce round ».

## Recette à copier dans la demande (texte à coller)

> Installe la méthode depuis `methode-travail` si ce n'est pas fait (ou vérifie `node scripts/verifier-methode.mjs`).
> Écris `docs/projets/<slug>/BRIEF.md` à partir de ma demande, puis présente-moi le plan avec le coût estimé et
> attends mon accord. Ensuite : `product-manager` (Opus) écrit `PRD.md` avec les textes prêts à coller et les
> critères d'acceptation ; `ux-agent` (Opus) implémente les sections « Doit » et « Devrait » et tient
> `IMPLEMENTATION-NOTES.md` au fil de l'eau ; `qa-agent` (Opus, lecture seule) vérifie chaque critère dans le
> code ; tu renvoies ses réserves à l'`ux-agent` pour une seule révision ; tu vérifies toi-même dans le
> navigateur (desktop et 390 px), tu lances la commande Vérification, tu commites, tu ouvres une PR brouillon,
> tu mets à jour le suivi et tu me donnes le coût réel. Rien d'inventé : prix, dates, noms, coordonnées
> marqués `[à confirmer]`. Ne fusionne rien.

## Les prompts qui ont marché (à réutiliser tels quels)

Les trois prompts complets sont dans `exemples/prompts-chantier-agents.md`. Ce qui compte dans chacun :

1. **`product-manager`** — « Tu es en aval d'un plan approuvé : tu exécutes, tu ne demandes pas d'accord. » ;
   la liste exacte des fichiers à lire (et pour les gros fichiers : « seulement les 100 premières lignes ») ;
   « écris `PRD.md` vers ton tour 12 au plus tard » ; pour un chantier de contenu : « les textes proposés
   doivent être prêts à coller, l'agent suivant les implémentera tels quels ».
2. **`ux-agent`** — l'ordre de travail fichier par fichier ; « lis chaque fichier une seule fois, juste avant
   de le modifier » ; la liste de ce qu'il **ne touche pas** (admin, API, Supabase, prix) ; la vérification
   finale obligatoire (typecheck, lint, build, puis les `grep` de contrôle : jargon, montants en `$`) ; « écris
   `IMPLEMENTATION-NOTES.md` dès l'étape 3, puis complète au fil de l'eau ».
3. **`qa-agent`** — « tu ne modifies aucun fichier, tu rapportes » ; « ne crois pas le rapport de l'auteur :
   vérifie dans le code » ; les points d'attention nommés (comparer les constantes de prix avec
   `git show HEAD:<fichier>`, actions du chatbot traitées, ancres uniques, aucune nouvelle dépendance) ; le
   format : verdict VERT/ROUGE, réserves classées bloquant / à trancher / mineur avec `fichier:ligne`, puis le
   tableau des critères avec preuve ; **« ne lance pas `next build` »** si l'agent principal l'exécute en
   parallèle (deux `next` en même temps corrompent `.next/`).

## Pièges rencontrés et parades

- **Les agents définis dans `.claude/agents/` ne se chargent qu'à la session suivante.** Dans la session où
  on installe la méthode, on lance des agents `general-purpose` en Opus et on **colle la fiche de l'agent
  dans le prompt**. Résultat identique.
- **Un chantier de contenu n'a pas besoin de SCHEMA, TRD ni UI-GUIDE** : BRIEF → PRD + APP-FLOW → code suffit
  (≈ 115 k pour le PRD au lieu de ≈ 1 M pour la chaîne complète). Décider la chaîne selon ce qui change : des
  textes et des sections → chaîne courte ; des données, des accès, de l'argent → chaîne complète.
- **Le PRD doit porter les textes, pas seulement des intentions.** « Rendre le site plus accessible » donne
  un `ux-agent` qui invente ; « voici les 6 phrases de la section "C'est pour vous si…" » donne un `ux-agent`
  qui colle. C'est aussi ce qui rend le QA vérifiable (le texte attendu est connu).
- **La commande Vérification doit être verte AVANT de lancer les agents.** Ici, `eslint` avait 5 erreurs
  préexistantes (ancien design, règles du React Compiler en faux positif) ; corrigées d'abord, consignées en
  `ERREURS-CONNUES.md` E01, sinon le `qa-agent` n'aurait pas pu distinguer le neuf de l'ancien.
- **Un hook de session qui réclame un commit à chaque arrêt** ne doit pas faire commiter un travail d'agent en
  cours : on commite les lots finis (installation, documents), on laisse le code en attente du `qa-agent`.
- **Captures d'écran avec Playwright** : forcer la classe `in` sur les `.reveal` (animations au défilement)
  avant la capture pleine page, sinon les sections basses apparaissent vides ; tester les ancres par
  `goto('/page#ancre')` + `scrollY`, pas seulement par la présence de l'`id`.
- **Le réseau du bac à sable** bloque les polices Google et Supabase : des `ERR_TUNNEL_CONNECTION_FAILED`
  dans la console ne sont pas des erreurs du site.

## Ce qu'on garde pour la prochaine fois

- Les sections « Propre au projet » des agents se remplissent **à l'installation** (pile, chemins, pièges,
  « rien d'inventé ») : c'est ce qui évite de tout répéter dans chaque prompt.
- Le `qa-agent` rend un **tableau de critères avec preuve** : c'est lui qu'on colle dans `SUIVI-TACHES.md`
  (rubrique « Vérification technique »), pas un « tests OK ».
- Les « à trancher par Camille » du QA deviennent la section **« Décisions qui attendent Camille »** de
  `docs/ETAT-ACTUEL.md`, telles quelles.
