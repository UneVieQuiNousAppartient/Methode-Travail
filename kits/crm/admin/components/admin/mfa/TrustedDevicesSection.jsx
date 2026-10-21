// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/mfa/TrustedDevicesSection.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { confirmAction } from "@/components/admin/common/ConfirmDialog";
import { formatDate } from "../common/formatDate";

// Paramètres › Sécurité du compte — « Appareils de confiance » (routes de kits/crm/auth/) : appareils où le
// code n'est plus demandé pendant 30 jours. GET / DELETE /v1/auth/mfa/devices (le témoin du navigateur part
// tout seul : il désigne l'appareil « Cet appareil »). Oublier un appareil = le code y sera redemandé.
// `trustedSession` (mfa.trusted_device de /v1/admin/me) : la session en cours est une session de confiance ;
// Supabase exige alors un code pour ajouter ou retirer un appareil d'authentification → onRequestCode.
const call = async (path, method = "GET") => {
    const {
        data: { session },
    } = await getSupabaseBrowser().auth.getSession();
    return fetch(path, { method, credentials: "same-origin", headers: { Authorization: `Bearer ${session?.access_token}` } });
};

export const TrustedDevicesSection = ({ t, locale, trustedSession = false, onRequestCode, onForgotCurrent }) => {
    const [devices, setDevices] = useState(null); // null = lecture en cours
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState("");

    // Lecture : promesse résolue dans des rappels (jamais de setState synchrone dans l'effet).
    const fetchDevices = () =>
        call("/v1/auth/mfa/devices").then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()).devices || [];
        });
    const load = useCallback(
        () =>
            fetchDevices().then(
                (list) => {
                    setDevices(list);
                    setFailed(false);
                },
                (err) => {
                    console.error("MFA : appareils de confiance illisibles", err);
                    setFailed(true);
                    setDevices([]);
                },
            ),
        [],
    );

    useEffect(() => {
        load();
    }, [load]);

    const forget = async (device) => {
        const all = !device;
        const ok = await confirmAction(
            all
                ? t("Le code sera de nouveau demandé sur tous ces appareils.")
                : t("Le code sera de nouveau demandé sur cet appareil."),
            { title: all ? t("Oublier tous les appareils ?") : t("Oublier cet appareil ?"), confirmLabel: t("Oublier") },
        );
        if (!ok) return;
        setBusy(device?.id || "all");
        try {
            const res = await call(all ? "/v1/auth/mfa/devices" : `/v1/auth/mfa/devices?id=${encodeURIComponent(device.id)}`, "DELETE");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            toast.success(all ? t("Tous les appareils ont été oubliés") : t("Appareil oublié"));
            await load();
            // La session en cours tenait peut-être à cet appareil : l'admin relit son état (écran du code au besoin).
            if (all || device.current) await onForgotCurrent?.();
        } catch (err) {
            console.error("MFA : oubli impossible", err);
            toast.error(t("Impossible d'oublier cet appareil. Réessayez."));
        } finally {
            setBusy("");
        }
    };

    return (
        <div data-testid="mfa-trusted-devices" className="rounded-2xl border border-brand-beige bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-brand-night">
                        <MonitorSmartphone className="h-4 w-4 text-brand-gold" />
                        {t("Appareils de confiance")}
                    </h2>
                    <p className="mt-0.5 text-xs text-brand-warmgray">
                        {t("Le code n'y est plus demandé pendant 30 jours (case « Se souvenir de cet appareil »).")}
                    </p>
                </div>
                {devices?.length ? (
                    <button
                        type="button"
                        data-testid="mfa-trusted-forget-all"
                        onClick={() => forget(null)}
                        disabled={Boolean(busy)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        {t("Oublier tous les appareils")}
                    </button>
                ) : null}
            </div>

            {trustedSession ? (
                <div data-testid="mfa-trusted-session-note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-champagne/60 px-4 py-3 text-xs text-brand-night">
                    <span className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-darkgold" />
                        {t("Connexion sans code grâce à cet appareil de confiance. Pour ajouter ou retirer une application d'authentification, entrez d'abord le code.")}
                    </span>
                    {onRequestCode ? (
                        <button type="button" data-testid="mfa-request-code" onClick={onRequestCode} className="btn-secondary !px-3 !py-1.5 text-xs">
                            {t("Entrer le code maintenant")}
                        </button>
                    ) : null}
                </div>
            ) : null}

            {devices === null ? (
                <p className="flex items-center gap-2 text-xs text-brand-warmgray">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Chargement…")}
                </p>
            ) : failed ? (
                <div className="flex flex-wrap items-center gap-3">
                    <p role="alert" className="text-xs font-semibold text-red-700">
                        {t("Impossible de lire vos appareils de confiance.")}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setDevices(null);
                            load();
                        }}
                        className="btn-secondary"
                    >
                        <RefreshCw className="h-4 w-4" />
                        {t("Réessayer")}
                    </button>
                </div>
            ) : devices.length === 0 ? (
                <p className="text-xs text-brand-warmgray">{t("Aucun appareil de confiance : le code est demandé à chaque connexion.")}</p>
            ) : (
                <ul className="divide-y divide-brand-beige/60 rounded-xl border border-brand-beige">
                    {devices.map((d) => (
                        <li key={d.id} data-testid="mfa-trusted-row" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-night">
                                    {d.label || t("Navigateur")}
                                    {d.current ? (
                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">{t("Cet appareil")}</span>
                                    ) : null}
                                </p>
                                <p className="text-xs text-brand-warmgray">
                                    {t("Retenu le {date} · jusqu'au {until}", { date: formatDate(d.created_at, locale), until: formatDate(d.expires_at, locale) })}
                                </p>
                            </div>
                            <button
                                type="button"
                                data-testid="mfa-trusted-forget"
                                onClick={() => forget(d)}
                                disabled={Boolean(busy)}
                                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-brand-beige bg-white px-3 text-xs font-bold text-brand-night transition-colors hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                            >
                                {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {t("Oublier")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
