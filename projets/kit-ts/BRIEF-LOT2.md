# BRIEF — Kit TypeScript, lot 2 (admin : accès, double vérification, journal, Loi 25, archivage, santé)

**Date :** 2026-10-30 · **Demandé par :** Camille (« Plan d'abord, puis décision ») · **Taille :** petit chantier
documentaire (BRIEF + IMPLEMENTATION-PLAN) ; le code suit après accord de Camille sur l'estimation.

## 1. Problème
Le lot 1 (kit 1.4.0, PR #5) couvre le site public. Dès qu'un client a un admin, il faut encore recopier à la main les
briques d'accès et de conformité. Elles existent, éprouvées, dans VieSolution-CSF (TypeScript, PR #349-#355), KHI et
Vie Solution Web ; la comparaison `VieSolution-CSF/docs/methode/MEILLEURES-BRIQUES.md` a choisi la meilleure source de
chacune.

## 2. Publics
Claude et Camille au démarrage d'un admin client en TypeScript (skill `nouveau-crm`).

## 3. Objectifs
1. `kits/crm/ts/` reçoit les briques du lot 2, chacune avec ses tests Vitest et sa ligne d'origine :
   matrice d'accès « refus par défaut » + rangs de rôles (KHI) ; refus du mot de passe partagé en ligne (`token-mode`) ;
   verrou de compte ; double vérification Supabase + appareils de confiance 30 jours (CSF) + codes de secours (idée de
   Web) ; journal des actions de l'admin ; journal d'accès Loi 25 ; accès et effacement Loi 25 (KHI + empreinte de Web) ;
   conservation limitée ; archivage ; point de santé + battement du tick ; faux Supabase en Vitest.
2. Les tests du kit passent hors de tout projet (comme le lot 1). Migrations fournies, jamais appliquées.
3. CATALOGUE, README, CHANGELOG, VERSION (1.5.0) et skill `nouveau-crm` à jour.

## 4. Contraintes
- Réutiliser, pas réécrire ; rien de propre à un client ; aucune mention du nom d'un projet d'origine dans le modèle
  (décision de Camille du 30 oct. : « projet client »), l'origine reste dans la ligne d'en-tête des fichiers du kit.
- Sécurité : `securite` obligatoire avant de déclarer le lot prêt ; aucune mutation de code dans un dépôt (E15).
- Variante « un seul propriétaire avec code d'accès » (Web) : en fiche seulement, pas en code.
- Budget à estimer par le plan ; au-delà de 1 M, accord de Camille.

## 5. Hors périmètre
Lot 3 (clés d'API, connecteur Claude, automatisations, agenda, webhooks, courriels entrants) ; écrans de l'admin (le kit
JS a `admin/` ; une version TS des écrans est un lot à part).

## 6. Sources
`MEILLEURES-BRIQUES.md` (table, lot 2) ; `SOCLE-STANDARD.md` ; kit 1.4.0 (`kits/crm/ts/BRIQUE.md`, `kits/crm/auth/`).

## 7. Questions ouvertes
Rôles par défaut du kit (propriétaire / conseiller de VieSolution, ou admin / gestionnaire / employé de KHI) — le plan
propose ; Camille tranche.
