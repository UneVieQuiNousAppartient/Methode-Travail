# Suivi des tâches — détails

Complément de `.claude/rules/suivi-taches.md` (méthode 1.7.0). **La règle fait foi** ; ce document garde les
raisons et les exemples. Il n'est pas chargé automatiquement.

## § 1. Pourquoi « Non fait dans ce round »

Sans cette rubrique, une session suivante lit « ✅ » et croit un chantier complet. C'est elle qui transmet ce qui
reste, d'une session à l'autre, sans relire l'historique.

## § 2. Lire le suivi sans le lire en entier

`grep -n "^## <num>\." SUIVI-TACHES.md` ou `grep -n "<mot-clé>" SUIVI-TACHES.md`, puis lecture ciblée de la section
trouvée. Le hook `hook-rappel-skills.mjs` fait cette recherche tout seul à la première modification d'un dossier de
code, et propose au plus 3 entrées semblables (« s'en inspirer, réutiliser plutôt que refaire »).

## § 3. Registre des erreurs connues — exemple

Ben's : la table « Erreurs connues — NE JAMAIS RÉPÉTER » (E01-E15) de son `MEMORY.md` a évité de rediagnostiquer
plusieurs fois les mêmes pièges d'outils et de CI ; elle est devenue `docs/ERREURS-CONNUES.md` (méthode 1.2.0).

## § 4. Pourquoi le suivi est exigé à la PR et pas au commit (14 nov. 2026)

`check-suivi.js` avertissait au commit, et l'avertissement était ignoré. Bloquer chaque commit aurait gêné les
commits intermédiaires. Le moment juste est la PR, qui est la livraison : `check-livraison-pr.mjs` y refuse du code
sans entrée au suivi (en-tête rafraîchi) ni `docs/ETAT-ACTUEL.md` à jour.
