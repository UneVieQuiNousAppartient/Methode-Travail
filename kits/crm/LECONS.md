# Leçons du kit CRM (KHI Educ, sept.-oct. 2026)

Ce que KHI Educ a appris en payant, à ne pas repayer. Chaque leçon : **le symptôme** (ce qu'on voit), **la
cause prouvée**, **ce qui l'évite**. Les erreurs à message exact vont aussi dans le `docs/ERREURS-CONNUES.md`
du projet dès qu'elles s'y produisent.

## Base de données (Supabase)

1. **Le connecteur Supabase reste bloqué sur `drop policy`** (délai dépassé à 60 s, rien n'est appliqué, même
   avec `lock_timeout` ; aucune requête bloquante dans `pg_stat_activity`). Cause : l'outil demande une
   confirmation pour les commandes destructives. **Évite** : changer une politique avec
   `alter policy … using (…) with check (…)` (même politique, seule la condition change, sans instant sans règle).
2. **Une transaction annulée ne laisse rien** : un `apply_migration` en échec ou en délai dépassé est
   entièrement annulé. Toujours **relire l'état** (`to_regclass`, `pg_policies`) avant de rejouer.
3. **Tester une règle d'accès (RLS) sans rien écrire** : bloc `do $$ … $$` qui insère les données de test,
   prend le rôle `authenticated` avec des `request.jwt.claims` simulés, compte ce qui est visible, puis
   `raise exception 'RESULTAT : %'` — l'erreur rapporte le résultat et annule tout.
4. **Migration de contenu en deux temps** (copier dans la base ce qui était dans le code) : sinon, page vide
   (base lue avant d'être remplie) ou doublons (ancien code qui additionne code + base). **Ordre** : insérer
   en « Brouillon » avant le déploiement (l'ancien code ne lit que « Publié »), déployer, publier aussitôt.
   Détecter la mise en ligne du nouveau code par un signe observable (ex. une page qui passe en 404).
5. **Une liste lue puis filtrée en JavaScript** peut rendre moins d'éléments que prévu : lire un peu plus que
   la limite (50 pour 10), filtrer, couper.
6. **Les tables lues par le navigateur** (espaces clients) doivent porter la politique restrictive de double
   authentification ; un test parcourt le code (`supabase.from("…")` hors `app/v1`) et échoue si une table lue
   n'est pas couverte dans le schéma ET dans la migration.

## Authentification

7. **La confiance ne remplace jamais une inscription** : « se souvenir de cet appareil » doit exiger un facteur
   vérifié **des deux côtés** (serveur et base) ; sinon un compte qui retire sa dernière application garde
   l'accès aux données par la base (constat de la revue de sécurité, corrigé avant toute utilisation).
8. **Supabase exige un code (`aal2`) pour ajouter ou retirer une application d'authentification** : une
   session de confiance doit pouvoir « entrer le code maintenant », avec un bouton Annuler.
9. **`/v1/admin/me` répond toujours**, même sans double authentification : c'est lui qui dit à l'écran
   d'afficher le code ou l'inscription. Toutes les autres routes refusent en 403 avec un `code` reconnu.
10. **Inscriptions libres fermées** : une adresse ajoutée à la liste blanche sans compte créé reste
    « dormante » et peut être prise ; l'ajout d'un membre doit créer son compte.

## Écrans de l'admin

11. **Tout se chargeait deux fois au démarrage** : la fonction de traduction changeait d'identité (`setLang`
    recréée à chaque rendu du fournisseur de langue) → `apiFetch` → vérification → chargement relancés.
    **Évite** : `useCallback` sur tout ce que le fournisseur expose ; vérifier au démarrage que chaque appel
    ne part qu'**une fois** (harnais de simulation, scénario de démarrage).
12. **Une suppression ne se voyait pas ailleurs** (« Priorités du jour » gardait des tâches de leads
    supprimés) : chaque vue chargeait ses données une fois. **Évite** : un seul `refreshAfterChange` appelé par
    toutes les modifications (fiche, liste, Kanban, actions groupées, assistant), une clé de rafraîchissement
    pour les vues montées, relectures **silencieuses**.
13. **La liste clignotait et perdait le défilement** après un changement de statut : la relecture affichait
    « Chargement… ». **Évite** : `{ quiet: true }` pour toute relecture qui suit une modification.
14. **Deux messages pour un même refus 403** (celui d'`apiFetch` et celui de l'écran) : identifiant de toast =
    texte, et l'écran ne redit rien quand le statut est 403.
15. **Sélection groupée qui survivait au filtre** : une action groupée pouvait toucher des lignes invisibles.
    Vider la sélection dès que la liste affichée change.
16. **Pas de message après certaines actions** (avis, guides, étapes) : la simulation joue chaque action en
    échec (500), en refus (403) et en réussite, et vérifie confirmation, message de réussite et d'erreur.
17. **Texte blanc sur l'or** : contraste ≈ 3,3:1, illisible ; une règle de `check-rules.mjs` l'interdit.
18. **Classes Tailwind inexistantes** (couleur mal nommée) : aucune erreur, l'écran se dégrade en silence ;
    une règle liste les jetons existants.

## Contenu et conformité

19. **Rien que le client n'a pas dit** : un témoignage inventé a été fusionné parce que la revue cherchait
    l'ancien nom d'une variable. Les revues vérifient dans le code, jamais sur le résumé de l'auteur ; une
    règle mécanique bloque la récidive.
20. **JSON-LD sérialisé brut** : un « `</script>` » saisi dans l'admin fermait la balise (XSS stockée) →
    sérialisation sûre obligatoire (règle).
21. **Un parent désabonné recevait quand même un courriel** (drapeau de dérogation branché sur un événement
    React) : les règles de consentement vivent dans une fonction pure testée (`tester-dabord`).

## Livraison

22. **GitHub peut afficher un job « en cours » déjà terminé** : lire son journal avant de conclure.
23. **Vercel peut tarder à déployer une fusion** (plus de 10 minutes) : surveiller le site, pas seulement la liste
    des déploiements.
24. **Le contrôle après déploiement se lance sur le domaine public**, jamais sur l'URL `*.vercel.app` protégée
    (redirections 302/401).
