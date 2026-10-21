// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/mfa/MfaSettingsSection.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { formatDate } from "../common/formatDate";
import { MfaEnroll } from "./MfaEnroll";
import { TrustedDevicesSection } from "./TrustedDevicesSection";

// Paramètres › Sécurité du compte — visible par chaque membre, quelles que soient
// ses permissions : il ne gère que SES appareils, directement auprès de Supabase Auth (aucune route admin).
// Après chaque changement, onChanged() relit GET /v1/admin/me : si le serveur exige désormais le code ou
// l'inscription, AdminClient remplace l'interface par l'écran correspondant.
// `mfa` (GET /v1/admin/me) ne sert qu'en attendant la liste : il ne dit pas si ADMIN_MFA_REQUIRED est actif
// quand le membre a déjà un facteur (required vaut alors toujours true) : c'est mfa.required_for_all qui le dit ;
// sans lui (serveur qui ne le renvoie pas), l'avertissement reste au conditionnel.
// onRequestCode : affiche l'écran du code (session de confiance → aal2), voir TrustedDevicesSection.
export const MfaSettingsSection = ({ t, locale, mfa = null, onChanged, flashMessage, onRequestCode }) => {
    const [factors, setFactors] = useState(null); // facteurs vérifiés ; null = lecture en cours
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [adding, setAdding] = useState(false);
    const [confirmFactor, setConfirmFactor] = useState(null);
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState("");
    // Focus clavier (accessibilité) : rendu au bouton « Retirer » qui a ouvert la fenêtre (ou à
    // « Ajouter un appareil » si la ligne a disparu), gardé dans la fenêtre tant qu'elle est ouverte, et
    // posé sur le bloc d'inscription à son ouverture (le bouton cliqué disparaît).
    const openerRef = useRef(null);
    const addButtonRef = useRef(null);
    const dialogRef = useRef(null);
    const enrollRef = useRef(null);

    useEffect(() => {
        if (adding) enrollRef.current?.focus();
    }, [adding]);

    // afterRemoval : la ligne de l'appareil retiré va disparaître (et son bouton est encore désactivé à cet
    // instant) — le focus va directement sur « Ajouter un appareil ».
    const returnFocus = ({ afterRemoval = false } = {}) => {
        const opener = openerRef.current;
        openerRef.current = null;
        setTimeout(() => {
            const target = !afterRemoval && opener?.isConnected && !opener.disabled ? opener : addButtonRef.current;
            target?.focus();
        }, 0);
    };
    const cancelButtonRef = useRef(null);

    const trapFocus = (e) => {
        if (e.key === "Escape") {
            closeConfirm();
            return;
        }
        if (e.key !== "Tab" || !dialogRef.current) return;
        const buttons = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Tous les types vérifiés, comme le serveur (enrolled = au moins un facteur vérifié).
                const { data, error } = await getSupabaseBrowser().auth.mfa.listFactors();
                if (error) throw error;
                if (cancelled) return;
                setFactors((data?.all || []).filter((f) => f.status === "verified"));
                setLoadFailed(false);
            } catch (err) {
                console.error("MFA : lecture des facteurs impossible", err);
                if (!cancelled) setLoadFailed(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const reload = () => setReloadKey((k) => k + 1);

    const retryLoad = () => {
        setLoadFailed(false);
        setFactors(null);
        reload();
    };

    const enabled = factors ? factors.length > 0 : Boolean(mfa?.enrolled);
    const isLast = Boolean(confirmFactor) && (factors?.length || 0) <= 1;
    const nameOf = (f) => f?.friendly_name || t("Appareil sans nom");

    const handleEnrolled = async () => {
        setAdding(false);
        flashMessage?.(t("Appareil ajouté : la double authentification est activée."));
        reload();
        await onChanged?.();
    };

    function closeConfirm() {
        if (removing) return;
        setConfirmFactor(null);
        setRemoveError("");
        returnFocus();
    }

    const removeFactor = async () => {
        if (!confirmFactor || removing) return;
        setRemoving(true);
        setRemoveError("");
        try {
            const supabase = getSupabaseBrowser();
            const { error } = await supabase.auth.mfa.unenroll({ factorId: confirmFactor.id });
            if (error) {
                console.error("MFA : retrait du facteur impossible", error);
                setRemoveError(t("Impossible de retirer cet appareil. Réessayez."));
                // Le bouton de confirmation, désactivé pendant le retrait, a perdu le focus : on le remet
                // dans la fenêtre pour que Tab et Échap continuent d'y agir.
                setTimeout(() => cancelButtonRef.current?.focus(), 0);
                return;
            }
            // Supabase ramène au niveau aal1 les sessions validées avec ce facteur, mais le jeton en cours
            // garde « aal2 » jusqu'à son renouvellement (jusqu'à une heure) : on le renouvelle tout de suite
            // pour que /v1/admin/me décrive l'état réel (code demandé ou inscription obligatoire).
            try {
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) console.error("MFA : renouvellement de la session impossible", refreshError);
            } catch (err) {
                console.error("MFA : renouvellement de la session impossible", err);
            }
            setConfirmFactor(null);
            returnFocus({ afterRemoval: true });
            flashMessage?.(t("Appareil retiré."));
            reload();
            await onChanged?.();
        } catch (err) {
            console.error("MFA : retrait du facteur impossible", err);
            setRemoveError(t("Impossible de retirer cet appareil. Réessayez."));
            setTimeout(() => cancelButtonRef.current?.focus(), 0);
        } finally {
            setRemoving(false);
        }
    };

    return (
        <div data-testid="mfa-settings-section" className="space-y-6">
            <div className="rounded-2xl border border-brand-beige bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-beige/60 pb-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-base font-bold text-brand-night">
                            <KeyRound className="h-4 w-4 text-brand-gold" />
                            {t("Double authentification")}
                        </h2>
                        <p className="mt-0.5 text-xs text-brand-warmgray">
                            {t("Un code affiché par votre téléphone, en plus du mot de passe ou de Google.")}
                        </p>
                    </div>
                    <span
                        data-testid="mfa-status"
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                            enabled ? "bg-emerald-50 text-emerald-800" : "bg-brand-champagne text-brand-darkgold"
                        }`}
                    >
                        {enabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                        {enabled ? t("Double authentification : activée") : t("Double authentification : non activée")}
                    </span>
                </div>

                <p className="text-sm leading-relaxed text-brand-anthracite">
                    {enabled
                        ? t("Chaque nouvelle connexion demande le code affiché par l'un de vos appareils inscrits.")
                        : t("Seul votre mot de passe ou votre compte Google protège l'accès. Ajoutez un appareil pour qu'un code vous soit demandé à chaque connexion.")}
                </p>

                {factors === null && !loadFailed ? (
                    <p className="flex items-center gap-2 text-xs text-brand-warmgray">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("Chargement…")}
                    </p>
                ) : null}

                {loadFailed ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <p role="alert" className="text-xs font-semibold text-red-700">
                            {t("Impossible de lire vos appareils d'authentification.")}
                        </p>
                        <button type="button" onClick={retryLoad} className="btn-secondary">
                            <RefreshCw className="h-4 w-4" />
                            {t("Réessayer")}
                        </button>
                    </div>
                ) : null}

                {factors?.length ? (
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-warmgray">
                            {t("Vos appareils")}
                        </p>
                        <ul className="divide-y divide-brand-beige/60 rounded-xl border border-brand-beige">
                            {factors.map((f) => (
                                <li
                                    key={f.id}
                                    data-testid="mfa-factor-row"
                                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="break-words text-sm font-semibold text-brand-night">{nameOf(f)}</p>
                                        {f.created_at ? (
                                            <p className="text-xs text-brand-warmgray">
                                                {t("Ajouté le {date}", { date: formatDate(f.created_at, locale) })}
                                            </p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="mfa-factor-delete"
                                        onClick={(e) => {
                                            openerRef.current = e.currentTarget;
                                            setRemoveError("");
                                            setConfirmFactor(f);
                                        }}
                                        disabled={removing || adding}
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {t("Retirer")}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {factors !== null && factors.length === 0 ? (
                    <p className="text-xs text-brand-warmgray">{t("Aucun appareil inscrit.")}</p>
                ) : null}

                {!adding && factors !== null ? (
                    <button
                        ref={addButtonRef}
                        type="button"
                        data-testid="mfa-add-device"
                        onClick={() => setAdding(true)}
                        className="btn-primary"
                    >
                        <Plus className="h-4 w-4" />
                        {t("Ajouter un appareil")}
                    </button>
                ) : null}
            </div>

            {factors?.length ? (
                <TrustedDevicesSection
                    t={t}
                    locale={locale}
                    trustedSession={mfa?.trusted_device === true}
                    onRequestCode={onRequestCode}
                    onForgotCurrent={onChanged}
                />
            ) : null}

            {adding ? (
                <div ref={enrollRef} tabIndex={-1} className="outline-none">
                    <MfaEnroll
                        t={t}
                        locale={locale}
                        onEnrolled={handleEnrolled}
                        onCancel={() => {
                            setAdding(false);
                            setTimeout(() => addButtonRef.current?.focus(), 0);
                        }}
                    />
                </div>
            ) : null}

            {confirmFactor ? (
                <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="mfa-remove-title"
                    aria-describedby="mfa-remove-description"
                    ref={dialogRef}
                    onKeyDown={trapFocus}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-brand-night/60 p-4 backdrop-blur-sm"
                >
                    <div data-testid="mfa-remove-dialog" className="w-full max-w-md rounded-3xl border border-brand-beige bg-white p-6 shadow-2xl">
                        <h3 id="mfa-remove-title" className="font-serif text-lg font-bold text-brand-night">
                            {t("Retirer cet appareil ?")}
                        </h3>
                        <p className="mt-1 break-words text-sm font-semibold text-brand-anthracite">{nameOf(confirmFactor)}</p>
                        <div id="mfa-remove-description" className="mt-4 space-y-3 text-sm leading-relaxed text-brand-anthracite">
                            {isLast ? (
                                <>
                                    <p
                                        data-testid="mfa-remove-last-warning"
                                        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 font-semibold text-red-800"
                                    >
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        {t("C'est votre dernier appareil : la double authentification sera désactivée pour votre compte.")}
                                    </p>
                                    <p>
                                        {/* mfa.required_for_all (GET /v1/admin/me) : double authentification obligatoire pour toute l'équipe ou non. */}
                                        {mfa?.required_for_all === true
                                            ? t("La double authentification est obligatoire pour l'équipe : vous devrez inscrire un nouvel appareil tout de suite pour continuer à utiliser l'administration.")
                                            : mfa?.required_for_all === false
                                              ? t("Vous pourrez inscrire un autre appareil à tout moment depuis cet écran.")
                                              : t("Si la double authentification est obligatoire pour l'équipe, vous devrez inscrire un nouvel appareil tout de suite pour continuer à utiliser l'administration.")}
                                    </p>
                                </>
                            ) : (
                                <p>{t("Cet appareil ne pourra plus fournir de code pour votre compte. Vos autres appareils restent inscrits.")}</p>
                            )}
                        </div>
                        {removeError ? (
                            <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
                                {removeError}
                            </p>
                        ) : null}
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                ref={cancelButtonRef}
                                data-testid="mfa-remove-cancel"
                                onClick={closeConfirm}
                                disabled={removing}
                                autoFocus
                                className="btn-secondary"
                            >
                                {t("Annuler")}
                            </button>
                            <button
                                type="button"
                                data-testid="mfa-remove-confirm"
                                onClick={removeFactor}
                                disabled={removing}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {removing ? t("Retrait…") : t("Retirer l'appareil")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};
