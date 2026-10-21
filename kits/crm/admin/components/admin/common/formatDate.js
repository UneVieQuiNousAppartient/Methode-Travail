// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/common/AdminBadges.jsx (formatDate), oct. 2026. À adapter : voir BRIQUE.md.

// Date et heure lisibles (« 21 oct. 2026, 14 h 05 »). Une date illisible est rendue telle quelle plutôt que de casser
// l'écran (« Invalid Date » ou exception).
export const formatDate = (iso, locale = "fr-CA") => {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return String(iso);
    }
};
