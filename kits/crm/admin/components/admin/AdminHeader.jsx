// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/AdminHeader.jsx, oct. 2026. À adapter : voir BRIQUE.md.

import { LogOut, Menu, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/adminClient/brand";

// Barre du haut de l'admin : h-16 + bordure basse, exactement comme le bloc du logo de la barre latérale
// (box-content h-16) — les deux traits horizontaux s'alignent.
//
// - title : la page ouverte (onglet ou fiche). Le nom de l'entreprise est déjà dans la barre latérale ;
// - actions (facultatif) : emplacement libre avant les boutons (cloche de notifications, sélecteur de langue…) ;
// - onOpenAssistant (facultatif) : bouton d'assistant ; absent = pas de bouton.
export const AdminHeader = ({
    title,
    onLogout,
    t,
    onToggleMenu,
    isMobileMenuOpen = false,
    userName,
    roleLabel,
    brandName = BRAND.name,
    logo = BRAND.logo,
    actions = null,
    onOpenAssistant,
}) => (
    <header className="sticky top-0 z-40 border-b border-brand-beige/60 bg-brand-ivory">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 md:px-8">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
                <button
                    type="button"
                    data-testid="admin-mobile-menu-button"
                    onClick={onToggleMenu}
                    aria-label={t("Ouvrir le menu")}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls="admin-mobile-drawer"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-brand-beige bg-white text-brand-night transition-colors hover:bg-brand-champagne"
                >
                    <Menu className="h-5 w-5 text-brand-darkgold" />
                </button>
                {logo ? <img src={logo} alt={brandName} className="h-8 w-auto" /> : null}
                <span className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-brand-darkgold">{title || t("Administration")}</span>
            </div>
            <p className="hidden truncate font-serif text-base font-bold text-brand-night lg:block">{title || t("Administration")}</p>
            <div className="flex shrink-0 items-center gap-2">
                {(userName || roleLabel) && (
                    <span data-testid="header-role-label" className="hidden items-center gap-1.5 pr-1 text-xs md:inline-flex">
                        {userName && <span className="font-semibold text-brand-night">{userName}</span>}
                        {roleLabel && (
                            <span className="rounded-full bg-brand-champagne px-2 py-0.5 text-xs font-bold text-brand-darkgold">{roleLabel}</span>
                        )}
                    </span>
                )}
                {actions}
                {onOpenAssistant ? (
                    <button
                        type="button"
                        data-testid="header-assistant-button"
                        onClick={onOpenAssistant}
                        aria-label={t("Assistant")}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-brand-gold/40 bg-brand-champagne/80 px-3 py-2 text-xs font-bold text-brand-night transition-all hover:border-brand-gold hover:bg-brand-champagne"
                    >
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-darkgold" strokeWidth={2} />
                        <span className="hidden sm:inline">{t("Assistant")}</span>
                    </button>
                ) : null}
                <button
                    type="button"
                    data-testid="admin-logout-button"
                    onClick={onLogout}
                    aria-label={t("Déconnexion")}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-[8px] border border-brand-beige bg-white px-3 py-2 text-xs font-semibold text-brand-night transition-colors hover:bg-brand-champagne sm:px-4"
                >
                    <LogOut className="h-3.5 w-3.5 shrink-0 text-brand-darkgold" />
                    <span className="hidden sm:inline">{t("Déconnexion")}</span>
                </button>
            </div>
        </div>
    </header>
);
