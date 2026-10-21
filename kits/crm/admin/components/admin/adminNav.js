// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/AdminSidebar.jsx (getNavSections), oct. 2026. À adapter : voir BRIQUE.md.

import { BarChart3, CalendarDays, ScrollText, Settings, Users } from "lucide-react";

// EXEMPLE de navigation : à remplacer par les onglets du projet. La barre latérale ne connaît aucun onglet ; elle
// affiche ce tableau. Une seule source sert aussi les titres de la barre du haut (navTitles), pour qu'un onglet
// renommé ne le soit pas à moitié.
//
// - key : identifiant de l'onglet (état `tab` de l'écran, ?tab=<key> dans l'adresse) ;
// - count : pastille, MASQUÉE à zéro. N'y mettre que ce qui attend une action (nouvelles demandes, retards) :
//   une pastille qui affiche toujours un total finit par ne plus être lue ;
// - permission (facultatif) : l'onglet n'apparaît que si `permissions[permission] === true` (GET /v1/admin/me,
//   objet de booléens calculé par lib/roles.js de kits/crm/auth/ — un tableau de noms marche aussi). C'est du
//   confort d'affichage : le serveur refuse de toute façon (403) ce que le rôle n'a pas le droit de faire.
export const getNavSections = (t, counts = {}) => [
    {
        title: t("Suivi"),
        items: [
            { key: "today", label: t("Aujourd'hui"), icon: CalendarDays, count: counts.today },
            { key: "clients", label: t("Clients"), icon: Users, count: counts.clients },
        ],
    },
    {
        title: t("Pilotage"),
        items: [
            { key: "stats", label: t("Statistiques"), icon: BarChart3, count: null },
            { key: "audit", label: t("Journal d'activité"), icon: ScrollText, count: null, permission: "audit" },
            // « Paramètres » reste visible par tous : la sécurité du compte (double authentification) concerne
            // chaque membre, quelles que soient ses permissions.
            { key: "settings", label: t("Paramètres"), icon: Settings, count: null },
        ],
    },
];

// { [key]: libellé } pour la barre du haut.
export const navTitles = (sections) => Object.fromEntries(sections.flatMap((s) => s.items.map((it) => [it.key, it.label])));

// Filtre d'affichage selon les permissions. `permissions` null (pas encore lu, ou /me injoignable) : tout est
// montré, le serveur reste juge (un 403 donne un toast, voir lib/adminClient/apiFetch.js).
export const visibleItems = (items, permissions) =>
    items.filter((it) => {
        if (!it.permission || !permissions) return true;
        return Array.isArray(permissions) ? permissions.includes(it.permission) : permissions[it.permission] === true;
    });
