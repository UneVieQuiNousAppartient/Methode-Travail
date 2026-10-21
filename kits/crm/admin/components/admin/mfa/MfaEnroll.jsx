// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/mfa/MfaEnroll.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
    CODE_LENGTH,
    MFA_ISSUER,
    MfaAccountFooter,
    MfaCodeField,
    MfaLostDeviceHelp,
    MfaShell,
    isFactorGoneError,
    isTeamAudience,
    isWrongCodeError,
    runSerially,
    unenrollQuietly,
    verifyErrorMessage,
    MfaRememberDevice,
    rememberThisDevice,
} from "./MfaShared";

// Inscription d'une application d'authentification. Deux usages :
//   - écran obligatoire pleine page (`mandatory`) quand /v1/admin/me répond mfa_enrollment_required
//     (double authentification exigée par le serveur et aucun facteur) — seule issue : s'inscrire ou se déconnecter ;
//   - dans Paramètres › Sécurité du compte (`onCancel`), pour un premier ou un second appareil.
// Le facteur créé par enroll reste « non vérifié » tant que le premier code n'est pas validé : il est
// retiré si l'on annule, se déconnecte ou quitte l'écran. La clé secrète ne vit que dans l'état du
// composant : jamais dans la console, le stockage local ou une requête autre que Supabase.
// L'écran obligatoire sert aussi aux espaces client (première connexion, components/mfa/SpaceMfaGate.jsx) :
// `audience` ("admin" par défaut, sinon espace client) en adapte l'introduction et les textes d'aide.

// supabase-js renvoie « data:image/svg+xml;utf-8,<svg…> » avec le SVG brut : un « # » ou un « % » du
// dessin peut tronquer l'URL selon le navigateur. On réencode le SVG.
const SVG_PREFIX = "data:image/svg+xml;utf-8,";
const toSvgDataUrl = (qr) => {
    const value = String(qr || "");
    if (value.startsWith(SVG_PREFIX)) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.slice(SVG_PREFIX.length))}`;
    }
    if (value.startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
    return value;
};

// Clé lisible à recopier : groupes de 4 caractères.
const groupSecret = (secret) => (String(secret || "").match(/.{1,4}/g) || []).join(" ");

export const MfaEnroll = ({
    t,
    locale = "fr-CA",
    mandatory = false,
    userEmail = "",
    onEnrolled,
    onCancel,
    onLogout,
    audience = "admin",
}) => {
    const team = isTeamAudience(audience);
    // Écran obligatoire (première connexion) : « Se souvenir de cet appareil 30 jours », cochée par défaut.
    // Dans Paramètres (appareil ajouté), la session est déjà vérifiée : pas de case.
    const [remember, setRemember] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhase] = useState("loading"); // loading | ready | error
    const [enrollment, setEnrollment] = useState(null); // { id, qr, secret }
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Facteur créé et pas encore vérifié : à retirer si l'inscription est abandonnée.
    const pendingRef = useRef(null);
    const busyRef = useRef(false);
    const inputRef = useRef(null);
    const copiedTimer = useRef(null);

    useEffect(() => {
        let cancelled = false;
        runSerially(async () => {
            const supabase = getSupabaseBrowser();
            // (a) Un essai abandonné laisse un facteur TOTP non vérifié : on le retire d'abord, sinon il
            // compte dans la limite de facteurs de Supabase et peut bloquer la nouvelle inscription.
            const { data: list, error: listError } = await supabase.auth.mfa.listFactors();
            if (listError) throw listError;
            for (const factor of list?.all || []) {
                if (factor.factor_type === "totp" && factor.status === "unverified") await unenrollQuietly(factor.id);
            }
            if (cancelled) return;
            // (b) Nom unique et lisible dans la liste des appareils (unicité exigée par Supabase).
            const deviceName = (timeStyle) =>
                t("Appareil ajouté le {date}", {
                    date: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle }),
                });
            let result = await supabase.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: deviceName("short"),
                issuer: MFA_ISSUER,
            });
            // Deux inscriptions dans la même minute (deux onglets) : on ajoute les secondes.
            if (result.error?.code === "mfa_factor_name_conflict") {
                result = await supabase.auth.mfa.enroll({
                    factorType: "totp",
                    friendlyName: deviceName("medium"),
                    issuer: MFA_ISSUER,
                });
            }
            if (result.error) throw result.error;
            const factorId = result.data?.id;
            if (cancelled) {
                if (factorId) await unenrollQuietly(factorId);
                return;
            }
            pendingRef.current = factorId;
            setEnrollment({
                id: factorId,
                qr: toSvgDataUrl(result.data?.totp?.qr_code),
                secret: result.data?.totp?.secret || "",
            });
            setPhase("ready");
        }).catch((err) => {
            // L'erreur de Supabase ne contient pas la clé : elle peut aller dans la console.
            console.error("MFA : inscription impossible", err);
            if (!cancelled) setPhase("error");
        });
        return () => {
            cancelled = true;
            const pending = pendingRef.current;
            pendingRef.current = null;
            if (pending) runSerially(() => unenrollQuietly(pending));
        };
        // Relancé seulement par « Réessayer » : changer de langue ne doit pas recréer le facteur.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    useEffect(() => () => clearTimeout(copiedTimer.current), []);

    const retry = () => {
        setEnrollment(null);
        setCode("");
        setError("");
        setPhase("loading");
        setAttempt((a) => a + 1);
    };

    const copySecret = async () => {
        if (!enrollment?.secret) return;
        try {
            await navigator.clipboard.writeText(enrollment.secret);
            setCopied(true);
            clearTimeout(copiedTimer.current);
            copiedTimer.current = setTimeout(() => setCopied(false), 2500);
        } catch {
            // Presse-papiers refusé par le navigateur : la clé reste sélectionnable à la main.
        }
    };

    const activate = async (value) => {
        if (busyRef.current || !enrollment || value.length !== CODE_LENGTH) return;
        busyRef.current = true;
        setBusy(true);
        setError("");
        try {
            const { error: verifyError } = await getSupabaseBrowser().auth.mfa.challengeAndVerify({
                factorId: enrollment.id,
                code: value,
            });
            if (verifyError) {
                // Facteur en attente retiré ailleurs (autre onglet) : ce code QR est mort, on en crée un
                // nouveau au lieu de laisser chaque code échouer sur « Vérifiez votre connexion ».
                if (isFactorGoneError(verifyError)) {
                    pendingRef.current = null;
                    retry();
                    setError(t("Ce code QR n'est plus valide : scannez le nouveau code affiché ci-dessous."));
                    return;
                }
                if (isWrongCodeError(verifyError)) {
                    setCode("");
                    inputRef.current?.focus();
                } else {
                    console.error("MFA : activation impossible", verifyError);
                }
                setError(verifyErrorMessage(verifyError, t, audience));
                return;
            }
            // Vérifié : le facteur est définitif, il ne doit plus être retiré au démontage.
            pendingRef.current = null;
            if (mandatory && remember && !(await rememberThisDevice())) {
                toast.warning(t("Cet appareil n'a pas pu être retenu : le code sera redemandé à la prochaine connexion."));
            }
            await onEnrolled?.();
        } catch (err) {
            console.error("MFA : activation impossible", err);
            setError(verifyErrorMessage(err, t, audience));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const handleChange = (value) => {
        setCode(value);
        if (error) setError("");
        if (value.length === CODE_LENGTH) activate(value);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        activate(code);
    };

    // Déconnexion depuis l'écran obligatoire : le facteur en attente se retire AVANT, car sans session
    // Supabase refuserait de le supprimer.
    const handleLogout = async () => {
        if (leaving) return;
        setLeaving(true);
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) await runSerially(() => unenrollQuietly(pending));
        await onLogout?.();
    };

    // Annulation dans Paramètres : le retrait du facteur en attente se fait au démontage (effet ci-dessus).
    const handleCancel = () => {
        if (busy) return;
        onCancel?.();
    };

    const body = (
        <div className="space-y-5">
            {phase === "loading" ? (
                <p className="flex items-center gap-2 text-sm text-brand-warmgray">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Préparation du code QR…")}
                </p>
            ) : null}

            {phase === "error" ? (
                <div className="space-y-3">
                    <p role="alert" className="flex items-start gap-2 rounded-[8px] bg-brand-champagne px-4 py-2.5 text-xs font-semibold text-brand-darkgold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {t("Impossible de préparer l'inscription. Réessayez dans un instant.")}
                    </p>
                    <button type="button" onClick={retry} className="btn-secondary w-full sm:w-auto">
                        <RefreshCw className="h-4 w-4" />
                        {t("Réessayer")}
                    </button>
                </div>
            ) : null}

            {phase === "ready" && enrollment ? (
                <>
                    <div className="space-y-4">
                        <p className="text-sm leading-relaxed text-brand-anthracite">
                            {/* Client : l'introduction nomme déjà les applications ; beaucoup n'en ont encore aucune
                                sur leur téléphone. */}
                            {team
                                ? t("Scannez ce code avec une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…).")
                                : t("Ouvrez l'application sur votre téléphone (installez-la au besoin depuis la boutique d'applications), puis scannez ce code.")}
                        </p>
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                            <img
                                data-testid="mfa-enroll-qr"
                                src={enrollment.qr}
                                alt={t("Code QR à scanner avec votre application d'authentification")}
                                width={176}
                                height={176}
                                className="h-44 w-44 shrink-0 rounded-xl border border-brand-beige bg-white p-2"
                            />
                            <div className="w-full min-w-0 space-y-2">
                                <p className="text-xs leading-relaxed text-brand-warmgray">
                                    {t("Impossible de scanner ? Entrez cette clé dans l'application :")}
                                </p>
                                <code
                                    data-testid="mfa-enroll-secret"
                                    aria-label={t("Clé de configuration")}
                                    className="block select-all break-all rounded-lg border border-brand-beige bg-brand-warmwhite px-3 py-2.5 font-mono text-sm tracking-wide text-brand-night"
                                >
                                    {groupSecret(enrollment.secret)}
                                </code>
                                <button
                                    type="button"
                                    data-testid="mfa-enroll-copy"
                                    onClick={copySecret}
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-brand-beige bg-white px-3 text-xs font-bold text-brand-night transition-colors hover:bg-brand-champagne"
                                >
                                    {copied ? <Check className="h-4 w-4 text-brand-gold" /> : <Copy className="h-4 w-4 text-brand-gold" />}
                                    <span aria-live="polite">{copied ? t("Clé copiée") : t("Copier la clé")}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <form data-testid="mfa-enroll-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <p className="text-sm leading-relaxed text-brand-anthracite">
                            {t("Entrez ensuite le code à 6 chiffres affiché par l'application.")}
                        </p>
                        <MfaCodeField
                            id="mfa-enroll-code"
                            t={t}
                            value={code}
                            onChange={handleChange}
                            inputRef={inputRef}
                            busy={busy}
                            error={error}
                            autoFocus={false}
                        />
                        {mandatory ? <MfaRememberDevice t={t} checked={remember} onChange={setRemember} disabled={busy} /> : null}
                        <div className={mandatory ? "" : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"}>
                            {!mandatory ? (
                                <button
                                    type="button"
                                    data-testid="mfa-enroll-cancel"
                                    onClick={handleCancel}
                                    disabled={busy}
                                    className="btn-secondary"
                                >
                                    {t("Annuler")}
                                </button>
                            ) : null}
                            <button
                                type="submit"
                                data-testid="mfa-enroll-verify"
                                disabled={busy || code.length !== CODE_LENGTH}
                                className={mandatory ? "btn-primary w-full" : "btn-primary"}
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                {busy ? t("Activation…") : t("Activer")}
                            </button>
                        </div>
                    </form>
                </>
            ) : null}

            {!mandatory && phase !== "ready" ? (
                <div className="flex justify-end">
                    <button type="button" data-testid="mfa-enroll-cancel" onClick={handleCancel} className="btn-secondary">
                        {t("Annuler")}
                    </button>
                </div>
            ) : null}

            <p className="flex items-start gap-2 rounded-xl border border-brand-beige bg-brand-warmwhite px-4 py-3 text-xs leading-relaxed text-brand-anthracite">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
                {team ? (
                    t("Gardez un second appareil inscrit, ou prévenez l'administrateur du site en cas de perte : le facteur se supprime depuis Supabase.")
                ) : (
                    <MfaLostDeviceHelp t={t} />
                )}
            </p>
        </div>
    );

    // Pourquoi ce code, dit à un client plutôt qu'à l'équipe.
    const mandatoryIntro = team
        ? t("La double authentification est obligatoire pour accéder à l'administration.")
        : t("Pour protéger vos informations, l'accès à votre espace demande un code à usage unique généré par une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…). L'activation ne se fait qu'une fois ; ensuite, le code vous est demandé à chaque connexion.");

    if (mandatory) {
        return (
            <MfaShell
                t={t}
                audience={audience}
                testid="mfa-enroll"
                title={t("Activez la double authentification")}
                intro={mandatoryIntro}
            >
                <div className="mt-6">{body}</div>
                <MfaAccountFooter t={t} userEmail={userEmail} onLogout={handleLogout} busy={busy || leaving} />
            </MfaShell>
        );
    }

    return (
        <div data-testid="mfa-enroll" className="rounded-2xl border border-brand-beige bg-white p-6 space-y-5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-night">
                <Smartphone className="h-4 w-4 text-brand-gold" />
                {t("Ajouter un appareil")}
            </h3>
            {body}
        </div>
    );
};
