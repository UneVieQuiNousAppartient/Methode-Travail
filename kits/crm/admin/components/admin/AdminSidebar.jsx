// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/AdminSidebar.jsx, oct. 2026. À adapter : voir BRIQUE.md.

import { Sparkles, X } from "lucide-react";
import { BRAND } from "@/lib/adminClient/brand";
import { visibleItems } from "./adminNav";

// Barre latérale de l'admin. Navigation CONFIGURABLE : `sections` = [{ title, items: [{ key, label, icon, count?,
// permission? }] }] (exemple dans adminNav.js). Rien de propre à un métier ici.
//
//   <AdminSidebar sections={getNavSections(t, counts)} tab={tab} setTab={selectTab} t={t}
//                 userEmail={me.email} roleLabel={me.role_label} permissions={me.permissions} />
//
// isMobile : même contenu dans le tiroir (< 1024 px), avec un bouton de fermeture.
// onOpenAssistant (facultatif) : bouton d'assistant en tête de liste (point d'extension, rien n'est fourni).
export const AdminSidebar = ({
    sections = [],
    tab,
    setTab,
    userEmail,
    t,
    permissions = null,
    roleLabel,
    brandName = BRAND.name,
    logo = BRAND.logo,
    onOpenAssistant,
    assistantShortcut = "Ctrl+J",
    isMobile = false,
    onClose,
}) => (
    <aside
        data-testid="admin-sidebar"
        className={
            isMobile
                ? "flex h-full w-full flex-col bg-brand-warmwhite"
                : "sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-brand-beige/60 bg-brand-warmwhite lg:flex"
        }
    >
        {/* Même hauteur que la barre du haut (h-16 + sa bordure, d'où box-content) : les deux traits s'alignent. */}
        <div className="box-content flex h-16 shrink-0 items-center justify-between gap-3 border-b border-brand-beige/60 px-6">
            <div className="flex min-w-0 items-center gap-3">
                {logo ? <img src={logo} alt={brandName} className="h-9 w-auto" /> : null}
                <div className="min-w-0">
                    <p className="truncate font-serif text-sm font-bold leading-tight text-brand-night">{brandName}</p>
                    <p className="text-xs font-medium text-brand-warmgray">{t("Administration")}</p>
                </div>
            </div>
            {isMobile && onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("Fermer le menu")}
                    className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-brand-beige bg-white text-brand-warmgray hover:bg-brand-champagne hover:text-brand-night"
                >
                    <X className="h-5 w-5" />
                </button>
            )}
        </div>
        {onOpenAssistant ? (
            <div className="px-3 pt-3 pb-1">
                <button
                    type="button"
                    data-testid="sidebar-nav-assistant"
                    onClick={() => {
                        onOpenAssistant();
                        if (isMobile && onClose) onClose();
                    }}
                    className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-brand-gold/40 bg-gradient-to-r from-brand-champagne/80 to-brand-champagne/40 px-3 py-2.5 text-xs font-bold text-brand-night shadow-sm transition-all hover:border-brand-gold hover:from-brand-champagne hover:to-brand-champagne"
                >
                    <span className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold/20">
                            <Sparkles className="h-3.5 w-3.5 text-brand-darkgold" strokeWidth={2} />
                        </span>
                        <span>{t("Assistant")}</span>
                    </span>
                    {assistantShortcut ? (
                        <span className="flex items-center gap-1 rounded border border-brand-beige/60 bg-white/80 px-1.5 py-0.5 font-mono text-xs text-brand-warmgray">
                            {assistantShortcut}
                        </span>
                    ) : null}
                </button>
            </div>
        ) : null}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label={t("Navigation administrateur")}>
            {sections.map((section) => {
                const items = visibleItems(section.items, permissions);
                if (!items.length) return null;
                return (
                    <div key={section.title} className="space-y-1">
                        <p className="px-3 text-xs font-bold uppercase tracking-wider text-brand-warmgray/70">{section.title}</p>
                        <div className="space-y-0.5">
                            {items.map((item) => {
                                const active = tab === item.key;
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        data-testid={`sidebar-nav-${item.key}`}
                                        aria-current={active ? "page" : undefined}
                                        onClick={() => {
                                            setTab(item.key);
                                            if (isMobile && onClose) onClose();
                                        }}
                                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                                            active
                                                ? "bg-brand-night text-white shadow-sm"
                                                : "text-brand-anthracite hover:bg-brand-champagne/80 hover:text-brand-night"
                                        }`}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            {Icon ? (
                                                <Icon className={`h-4 w-4 ${active ? "text-brand-gold" : "text-brand-gold/80"}`} strokeWidth={1.8} />
                                            ) : null}
                                            <span>{item.label}</span>
                                        </span>
                                        {/* Pastille masquée à zéro. Contraste : texte blanc sur or FONCÉ (darkgold),
                                            jamais sur l'or clair (illisible, échoue au WCAG AA). */}
                                        {item.count > 0 && (
                                            <span
                                                className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                                                    active ? "bg-brand-darkgold text-white" : "bg-brand-champagne text-brand-darkgold"
                                                }`}
                                            >
                                                {item.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </nav>
        <div className="border-t border-brand-beige/60 px-6 py-4">
            <p data-testid="admin-user-email" className="truncate text-xs font-medium text-brand-warmgray">
                {userEmail}
            </p>
            {roleLabel && (
                <p data-testid="sidebar-role-label" className="mt-1 text-xs font-bold uppercase tracking-wider text-brand-darkgold">
                    {roleLabel}
                </p>
            )}
        </div>
    </aside>
);
