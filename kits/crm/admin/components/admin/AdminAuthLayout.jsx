// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/AdminAuthLayout.jsx (+ components/mfa/SpaceAuthLayout.jsx), oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/adminClient/brand";

// Gabarit des écrans d'accès : connexion à /admin, puis inscription et code de la double authentification
// (components/admin/mfa). Même volet de marque, même carte : ces écrans ne divergent plus.
// `testid` va sur la carte de droite, qui reçoit le contenu (`children`).
//
// variant : "team" (l'équipe, par défaut) ou "space" (espace client : on n'y parle ni d'administration ni de
// journal d'activité). `panel` remplace entièrement les textes du volet : { eyebrow, title, intro, bullets: [] }.
const teamPanel = (t, brandName) => ({
    eyebrow: t("Espace de l'équipe"),
    title: (
        <>
            {t("Le CRM de")} <span className="italic text-brand-gold">{brandName}</span>
        </>
    ),
    intro: t("Demandes, clients, suivis et automatisations, au même endroit."),
    bullets: [
        { icon: ShieldCheck, text: t("Accès réservé aux courriels de la liste de l'équipe") },
        { icon: ScrollText, text: t("Chaque action est inscrite au journal d'activité") },
    ],
});

const spacePanel = (t, brandName) => ({
    eyebrow: t("Votre espace"),
    title: <span className="text-white">{brandName}</span>,
    intro: t("Retrouvez vos demandes et vos échanges avec notre équipe."),
    bullets: [{ icon: ShieldCheck, text: t("Accès protégé par un code à usage unique") }],
});

export const AdminAuthLayout = ({ t, testid, children, variant = "team", panel, brandName = BRAND.name, siteHref = BRAND.siteHref }) => {
    const p = panel || (variant === "space" ? spacePanel : teamPanel)(t, brandName);
    return (
        <main className="flex min-h-screen items-center justify-center bg-brand-ivory px-4 py-10 sm:px-6">
            <div className="w-full max-w-5xl">
                <div className="grid overflow-hidden rounded-3xl border border-brand-beige bg-brand-warmwhite shadow-premium lg:grid-cols-12">
                    {/* Volet gauche : la marque (texte blanc sur marine ; l'or ne sert qu'aux accents, jamais de fond
                        sous du texte blanc). */}
                    <div className="hidden flex-col justify-between bg-brand-night p-10 text-white lg:col-span-5 lg:flex">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/30 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-gold">
                                <Sparkles className="h-3.5 w-3.5" />
                                {p.eyebrow}
                            </div>
                            <h2 className="mt-8 font-serif text-3xl font-bold leading-snug tracking-tight text-white">{p.title}</h2>
                            {p.intro ? <p className="mt-4 text-sm leading-relaxed text-white/70">{p.intro}</p> : null}
                            <div className="mt-8 space-y-4 text-xs font-medium text-white/80">
                                {(p.bullets || []).map(({ icon: Icon, text }) => (
                                    <div key={text} className="flex items-center gap-3">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-gold">
                                            {Icon ? <Icon className="h-4 w-4" /> : null}
                                        </div>
                                        <span>{text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {siteHref ? (
                            <div className="border-t border-white/10 pt-6">
                                <a
                                    href={siteHref}
                                    className="text-xs font-medium text-white/60 underline decoration-brand-gold underline-offset-4 transition-colors hover:text-brand-gold"
                                >
                                    {t("Retour au site")}
                                </a>
                            </div>
                        ) : null}
                    </div>

                    {/* Volet droit : la carte de l'écran */}
                    <div data-testid={testid} className="p-8 sm:p-10 lg:col-span-7">
                        {children}
                    </div>
                </div>
            </div>
        </main>
    );
};
