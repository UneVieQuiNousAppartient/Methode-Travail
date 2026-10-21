// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/common/ActionMenu.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Menu « ⋯ » des lignes de l'admin : des actions claires, au même endroit sur chaque ligne de chaque liste.
// Base Radix de shadcn/ui (components/ui/dropdown-menu.jsx), aux couleurs de la marque.
//
//   <ActionMenu label={t("Actions")} testId="client-actions-123" items={[
//       { label: t("Modifier"), icon: Pencil, onSelect: … },
//       { separator: true },
//       { label: t("Supprimer définitivement"), icon: Trash2, tone: "danger", onSelect: …, hidden: !canDelete },
//   ]} />
//
// Les actions risquées passent ensuite par useConfirm (ConfirmDialog.jsx), jamais directement.
export function ActionMenu({ items = [], label = "Actions", testId, align = "end", className }) {
    const visible = items.filter((it) => !it.hidden);
    if (!visible.length) return null;
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
                data-testid={testId}
                aria-label={label}
                title={label}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-brand-warmgray transition-colors hover:border-brand-beige hover:bg-brand-ivory hover:text-brand-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold data-[state=open]:border-brand-beige data-[state=open]:bg-brand-ivory data-[state=open]:text-brand-night",
                    className,
                )}
            >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="min-w-[13rem] border-brand-beige bg-white p-1" onClick={(e) => e.stopPropagation()}>
                {visible.map((it, i) =>
                    it.separator ? (
                        <DropdownMenuSeparator key={`sep-${i}`} className="bg-brand-beige/60" />
                    ) : (
                        <DropdownMenuItem
                            key={it.testId || it.label}
                            data-testid={it.testId}
                            disabled={it.disabled}
                            onSelect={() => it.onSelect?.()}
                            className={cn(
                                "min-h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm",
                                it.tone === "danger"
                                    ? "text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    : "text-brand-night focus:bg-brand-champagne/60 focus:text-brand-night",
                            )}
                        >
                            {it.icon ? <it.icon className="h-4 w-4" aria-hidden="true" /> : null}
                            <span className="flex-1">{it.label}</span>
                        </DropdownMenuItem>
                    ),
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
