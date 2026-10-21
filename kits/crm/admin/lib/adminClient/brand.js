// Kit CRM (methode-travail) — origine : KHI Educ, valeurs en dur de AdminSidebar.jsx et MfaShared.jsx, oct. 2026. À adapter : voir BRIQUE.md.

// Identité affichée par la coquille de l'admin et les écrans de double authentification. Les composants la
// reçoivent aussi en props (`brandName`, `logo`) : ce fichier ne sert que de valeur par défaut, pour ne pas faire
// descendre la marque à travers cinq niveaux de composants jusqu'aux écrans du code.
export const BRAND = {
    // Nom de l'entreprise : barre latérale, volet des écrans d'accès, application d'authentification.
    name: "<Nom de l'entreprise>",
    // Chemin du logo dans public/ (ex. "/logo.svg") ; null = pas d'image, le nom seul.
    logo: null,
    // Nom affiché par Google Authenticator & cie au-dessus du code (souvent = name).
    mfaIssuer: "<Nom de l'entreprise>",
    // Page de contact proposée à un client qui a perdu son téléphone (espaces client, pas l'équipe).
    contactHref: "/contact",
    // Lien « Retour au site » des écrans d'accès.
    siteHref: "/",
};
