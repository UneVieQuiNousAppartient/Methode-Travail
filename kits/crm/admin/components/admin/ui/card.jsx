// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/ui/card.jsx, oct. 2026. À adapter : voir BRIQUE.md.
import * as React from "react";
import { cn } from "@/lib/utils";

// Carte de l'admin (inspirée de « App Dashboard Layout » de 21st.dev, shadcnstore) : mêmes emplacements que la Card
// de shadcn/ui (en-tête, titre, description, contenu), aux couleurs de la marque (fond blanc chaud, bordure beige,
// ombre douce). Textes d'au moins 12 px (text-xs) : en dessous, illisible sur un portable.

export const Card = React.forwardRef(function Card({ className, ...props }, ref) {
    return (
        <div
            ref={ref}
            className={cn("rounded-2xl border border-brand-beige bg-brand-warmwhite text-brand-anthracite shadow-subtle", className)}
            {...props}
        />
    );
});

export const CardHeader = React.forwardRef(function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex flex-col gap-1 p-5 sm:p-6", className)} {...props} />;
});

export const CardTitle = React.forwardRef(function CardTitle({ className, as: Tag = "h2", ...props }, ref) {
    return <Tag ref={ref} className={cn("text-sm font-bold leading-tight text-brand-night", className)} {...props} />;
});

export const CardDescription = React.forwardRef(function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("text-xs font-medium text-brand-warmgray", className)} {...props} />;
});

export const CardContent = React.forwardRef(function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
});
