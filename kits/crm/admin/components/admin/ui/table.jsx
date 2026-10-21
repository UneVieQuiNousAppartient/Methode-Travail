// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/ui/table.jsx, oct. 2026. À adapter : voir BRIQUE.md.
import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Tableau de l'admin (repris de « Data Table » de 21st.dev, ephraimduncan) : primitives de la Table de shadcn/ui aux
// couleurs de la marque, en-tête triable et pagination numérotée. Sans @tanstack/react-table : les listes de l'admin
// sont déjà filtrées, triées et paginées par l'API (grosses listes) ou en mémoire (petites listes).

export const Table = React.forwardRef(function Table({ className, ...props }, ref) {
    return (
        <div className="relative w-full overflow-x-auto rounded-2xl border border-brand-beige bg-brand-warmwhite shadow-subtle">
            <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
        </div>
    );
});

export const TableHeader = React.forwardRef(function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn("bg-brand-ivory [&_tr]:border-b [&_tr]:border-brand-beige", className)} {...props} />;
});

export const TableBody = React.forwardRef(function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
});

export const TableRow = React.forwardRef(function TableRow({ className, ...props }, ref) {
    return (
        <tr
            ref={ref}
            className={cn(
                "border-b border-brand-beige/70 transition-colors hover:bg-brand-champagne/25 data-[state=selected]:bg-brand-champagne/40",
                className,
            )}
            {...props}
        />
    );
});

export const TableHead = React.forwardRef(function TableHead({ className, ...props }, ref) {
    return (
        <th
            ref={ref}
            className={cn(
                "h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-bold uppercase tracking-wide text-brand-warmgray first:pl-4 last:pr-4",
                className,
            )}
            {...props}
        />
    );
});

export const TableCell = React.forwardRef(function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn("px-3 py-3 align-middle first:pl-4 last:pr-4", className)} {...props} />;
});

// En-tête cliquable : `active` quand la colonne porte le tri, `dir` = "asc" | "desc".
export function SortableHead({ children, active = false, dir = "desc", onSort, className, testId, sortLabel }) {
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
        <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
            <button
                type="button"
                data-testid={testId}
                onClick={onSort}
                title={sortLabel}
                className={cn(
                    "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 uppercase tracking-wide hover:text-brand-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                    active && "text-brand-night",
                )}
            >
                {children}
                <Icon className={cn("h-3.5 w-3.5", active ? "text-brand-gold" : "opacity-60")} aria-hidden="true" />
            </button>
        </TableHead>
    );
}

// Pages à afficher : toutes jusqu'à 7, sinon la première, la dernière et les voisines de la page courante.
export const pageWindow = (page, totalPages) => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set([1, totalPages, page - 1, page, page + 1]);
    const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const out = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
        out.push(p);
    });
    return out;
};

// Pagination numérotée « Affichage 1 à 20 sur 57 » + précédent / pages / suivant. `page` commence à 1.
export function TablePagination({ page, pageSize, total, onPage, t, testId = "table-pagination" }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total === 0) return null;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const btn =
        "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold disabled:pointer-events-none disabled:opacity-40";
    return (
        <div data-testid={testId} className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-brand-warmgray">
                {t("Affichage de {from} à {to} sur {total}", { from, to, total })}
            </p>
            {totalPages > 1 && (
                <nav className="flex flex-wrap items-center gap-1" aria-label={t("Pagination")}>
                    <button
                        type="button"
                        onClick={() => onPage(page - 1)}
                        disabled={page <= 1}
                        aria-label={t("Page précédente")}
                        className={cn(btn, "border-brand-beige bg-white text-brand-night hover:bg-brand-champagne/60")}
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {pageWindow(page, totalPages).map((p) =>
                        typeof p === "string" ? (
                            <span key={p} className="px-1 text-xs text-brand-warmgray" aria-hidden="true">
                                …
                            </span>
                        ) : (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onPage(p)}
                                aria-label={t("Aller à la page {n}", { n: p })}
                                aria-current={p === page ? "page" : undefined}
                                className={cn(
                                    btn,
                                    p === page
                                        ? "border-brand-night bg-brand-night text-white"
                                        : "border-brand-beige bg-white text-brand-night hover:bg-brand-champagne/60",
                                )}
                            >
                                {p}
                            </button>
                        ),
                    )}
                    <button
                        type="button"
                        onClick={() => onPage(page + 1)}
                        disabled={page >= totalPages}
                        aria-label={t("Page suivante")}
                        className={cn(btn, "border-brand-beige bg-white text-brand-night hover:bg-brand-champagne/60")}
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </nav>
            )}
        </div>
    );
}
