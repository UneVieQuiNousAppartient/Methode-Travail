// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/common/ConfirmDialog.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Petit utilitaire de confirmation de l'admin : remplace window.confirm (bloquant, laid, impossible à styler ou à
// tester, et que certains navigateurs finissent par masquer). Modèle « AlertDialog » de shadcn/ui (base Radix), aux
// couleurs de la marque (jetons brand-* de tailwind.config.js).
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, description, confirmLabel, tone: "danger", typeToConfirm: "supprimer" }))) return;
//
// - tone : "default" (bouton marine) ou "danger" (bouton rouge, icône d'alerte) ;
// - typeToConfirm : mot à taper pour activer le bouton (suppression définitive) ;
// - Échap, clic sur « Annuler » ou hors de la fenêtre → false.
// confirmAction(options) fait la même chose hors d'un composant (ou au-dessus du fournisseur, ex. AdminClient).
// Sans <ConfirmProvider> monté, les deux retombent sur window.confirm (jamais d'action sans accord).

const ConfirmContext = React.createContext(null);
let mounted = null;

const fallback = (options = {}) => {
    const text = [options.title, options.description].filter(Boolean).join("\n\n");
    return Promise.resolve(typeof window !== "undefined" && window.confirm(text));
};

// Accepte aussi une phrase seule : confirmAction("Archiver ce lead ?", { confirmLabel: "Archiver" }).
const normalize = (options, extra) => (typeof options === "string" ? { description: options, ...extra } : { ...options, ...extra });
export const confirmAction = (options = {}, extra = {}) => {
    const o = normalize(options, extra);
    return mounted ? mounted(o) : fallback(o);
};

// `t` : la fonction de traduction de l'admin (AdminClient), comme pour les onglets. Elle doit être STABLE (voir PATTERNS.md).
export function ConfirmProvider({ children, t = (s) => s }) {
    const [state, setState] = React.useState(null);
    const [typed, setTyped] = React.useState("");
    const resolver = React.useRef(null);

    const confirm = React.useCallback((options = {}) => {
        setTyped("");
        setState({ tone: "default", ...options });
        return new Promise((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    React.useEffect(() => {
        mounted = confirm;
        return () => {
            if (mounted === confirm) mounted = null;
        };
    }, [confirm]);

    const close = (value) => {
        resolver.current?.(value);
        resolver.current = null;
        setState(null);
    };

    const needsWord = Boolean(state?.typeToConfirm);
    const wordOk = !needsWord || typed.trim().toLowerCase() === String(state.typeToConfirm).toLowerCase();
    const danger = state?.tone === "danger";

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog.Root open={Boolean(state)} onOpenChange={(open) => !open && close(false)}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-[90] bg-brand-night/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                    <AlertDialog.Content
                        data-testid="confirm-dialog"
                        className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-brand-beige bg-white p-6 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                    >
                        <div className="flex gap-4">
                            {danger && (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <AlertDialog.Title className="font-serif text-lg font-semibold text-brand-night">
                                    {state?.title || t("Confirmer l'action")}
                                </AlertDialog.Title>
                                {state?.description ? (
                                    <AlertDialog.Description className="mt-2 whitespace-pre-line text-sm leading-relaxed text-brand-warmgray">
                                        {state.description}
                                    </AlertDialog.Description>
                                ) : (
                                    <AlertDialog.Description className="sr-only">{t("Confirmer l'action")}</AlertDialog.Description>
                                )}
                                {needsWord && (
                                    <label className="mt-4 block text-sm text-brand-night">
                                        {t("Pour confirmer, tapez « {mot} » :").replace("{mot}", state.typeToConfirm)}
                                        <input
                                            autoFocus
                                            data-testid="confirm-dialog-input"
                                            value={typed}
                                            onChange={(e) => setTyped(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && wordOk) close(true);
                                            }}
                                            className="mt-2 w-full rounded-lg border border-brand-beige bg-brand-warmwhite px-3 py-2 text-sm text-brand-night outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <AlertDialog.Cancel
                                data-testid="confirm-dialog-cancel"
                                className="min-h-10 rounded-lg border border-brand-beige bg-white px-4 text-sm font-semibold text-brand-night transition-colors hover:bg-brand-champagne/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                            >
                                {state?.cancelLabel || t("Annuler")}
                            </AlertDialog.Cancel>
                            <AlertDialog.Action
                                data-testid="confirm-dialog-confirm"
                                disabled={!wordOk}
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (wordOk) close(true);
                                }}
                                className={cn(
                                    "min-h-10 rounded-lg px-4 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold disabled:cursor-not-allowed disabled:opacity-50",
                                    danger ? "bg-destructive hover:bg-destructive/90" : "bg-brand-night hover:bg-brand-nightsoft",
                                )}
                            >
                                {state?.confirmLabel || t("Confirmer")}
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = React.useContext(ConfirmContext);
    return React.useCallback((options = {}, extra = {}) => (ctx ? ctx(normalize(options, extra)) : confirmAction(options, extra)), [ctx]);
}

// Indicateur pour les boutons d'action en cours (menus, fenêtres).
export const Busy = () => <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
