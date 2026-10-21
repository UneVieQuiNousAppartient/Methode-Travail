// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/mfa/MfaChallenge.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
    CODE_LENGTH,
    MfaAccountFooter,
    MfaCodeField,
    MfaLostDeviceHelp,
    MfaRememberDevice,
    MfaShell,
    isFactorGoneError,
    isTeamAudience,
    isWrongCodeError,
    rememberThisDevice,
    verifyErrorMessage,
} from "./MfaShared";

// Écran « Code de vérification » : GET /v1/admin/me → mfa.code === "mfa_required",
// ou une route admin a répondu 403 { code: "mfa_required" }. La session (mot de passe ou Google) est au
// niveau aal1 ; challengeAndVerify la fait passer en aal2 et supabase-js enregistre aussitôt le nouveau
// jeton, que apiFetch reprend ensuite (aucun refreshSession nécessaire).
// Sert aussi aux espaces client (components/mfa/SpaceMfaGate.jsx) : `audience` ("admin" par défaut, sinon
// espace client) adapte les textes d'aide, voir isTeamAudience.
// defaultRemember / onCancel : code demandé volontairement par une session de confiance (Paramètres ›
// Sécurité) — case décochée par défaut (pas de second appareil) et bouton « Annuler » (la session reste valable).
export const MfaChallenge = ({ t, userEmail = "", onVerified, onLogout, audience = "admin", defaultRemember = true, onCancel }) => {
    const team = isTeamAudience(audience);
    // null = lecture en cours ; [] = aucun facteur TOTP vérifié
    const [factors, setFactors] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // « Se souvenir de cet appareil pendant 30 jours » : cochée par défaut.
    const [remember, setRemember] = useState(defaultRemember);
    // Garde synchrone : Entrée et la saisie du 6e chiffre peuvent partir dans le même instant.
    const busyRef = useRef(false);
    const inputRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // listFactors relit l'utilisateur sur le serveur : data.totp = facteurs TOTP vérifiés seulement.
                const { data, error: listError } = await getSupabaseBrowser().auth.mfa.listFactors();
                if (listError) throw listError;
                if (!cancelled) setFactors(Array.isArray(data?.totp) ? data.totp : []);
            } catch (err) {
                console.error("MFA : lecture des facteurs impossible", err);
                if (!cancelled) setLoadFailed(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const retryLoad = () => {
        setLoadFailed(false);
        setFactors(null);
        setReloadKey((k) => k + 1);
    };

    const verify = async (value) => {
        if (busyRef.current || value.length !== CODE_LENGTH || !factors?.length) return;
        busyRef.current = true;
        setBusy(true);
        setError("");
        try {
            const supabase = getSupabaseBrowser();
            let verified = false;
            let lastError = null;
            // Vrai tant que chaque appareil essayé a disparu : un seul « code incorrect » suffit à le faire tomber.
            let allGone = true;
            // Un code n'est valable que pour l'appareil qui l'affiche. Avec plusieurs appareils inscrits,
            // on essaie le premier, puis les suivants tant que Supabase répond « code incorrect » :
            // l'appareil de secours sert ainsi sans avoir à choisir dans une liste.
            for (const factor of factors) {
                const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                    factorId: factor.id,
                    code: value,
                });
                if (!verifyError) {
                    verified = true;
                    break;
                }
                const gone = isFactorGoneError(verifyError);
                if (!gone) {
                    allGone = false;
                    // Un « code incorrect » reste l'erreur à montrer, même si un appareil suivant a disparu.
                    if (!lastError || !isWrongCodeError(lastError)) lastError = verifyError;
                } else if (!lastError) {
                    lastError = verifyError;
                }
                // Appareil retiré entre-temps (autre onglet) : on passe au suivant comme pour un code faux.
                if (!isWrongCodeError(verifyError) && !gone) break;
            }
            if (verified) {
                // Session passée en aal2 : le serveur peut retenir l'appareil (un échec n'empêche pas d'entrer).
                if (remember && !(await rememberThisDevice())) {
                    toast.warning(t("Cet appareil n'a pas pu être retenu : le code sera redemandé à la prochaine connexion."));
                }
                await onVerified?.();
                setCode("");
                return;
            }
            // Plus aucun des appareils lus n'existe : le serveur décide (code, inscription ou rien) et la
            // liste est relue, au lieu d'un « Vérifiez votre connexion » sans issue.
            if (allGone && isFactorGoneError(lastError)) {
                setCode("");
                await onVerified?.();
                retryLoad();
                return;
            }
            if (isWrongCodeError(lastError)) {
                setCode("");
                inputRef.current?.focus();
            } else {
                console.error("MFA : vérification impossible", lastError);
            }
            setError(verifyErrorMessage(lastError, t, audience));
        } catch (err) {
            console.error("MFA : vérification impossible", err);
            setError(verifyErrorMessage(err, t, audience));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const handleChange = (value) => {
        setCode(value);
        if (error) setError("");
        // Envoi automatique au 6e chiffre (saisie ou code proposé par le téléphone).
        if (value.length === CODE_LENGTH) verify(value);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        verify(code);
    };

    return (
        <MfaShell
            t={t}
            audience={audience}
            testid="mfa-challenge"
            title={t("Code de vérification")}
            intro={t("Entrez le code à 6 chiffres affiché par votre application d'authentification.")}
        >
            {factors === null && !loadFailed ? (
                <p className="mt-6 flex items-center gap-2 text-sm text-brand-warmgray">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Chargement…")}
                </p>
            ) : null}

            {loadFailed ? (
                <div className="mt-6 space-y-3">
                    <p role="alert" className="flex items-start gap-2 rounded-[8px] bg-brand-champagne px-4 py-2.5 text-xs font-semibold text-brand-darkgold">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        {t("Impossible de lire vos appareils d'authentification.")}
                    </p>
                    <button type="button" onClick={retryLoad} className="btn-secondary w-full">
                        <RefreshCw className="h-4 w-4" />
                        {t("Réessayer")}
                    </button>
                </div>
            ) : null}

            {factors !== null && factors.length === 0 ? (
                <p
                    role="alert"
                    data-testid="mfa-no-factor"
                    className="mt-6 flex items-start gap-2 rounded-[8px] bg-brand-champagne px-4 py-2.5 text-xs font-semibold leading-relaxed text-brand-darkgold"
                >
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {team
                        ? t("Aucune application d'authentification n'est inscrite sur ce compte. Déconnectez-vous et prévenez l'administrateur du site.")
                        : t("Aucune application d'authentification n'est inscrite sur ce compte. Écrivez-nous : notre équipe réinitialisera votre accès.")}
                </p>
            ) : null}

            {factors?.length ? (
                <form data-testid="mfa-challenge-form" onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                    <MfaCodeField
                        id="mfa-challenge-code"
                        t={t}
                        value={code}
                        onChange={handleChange}
                        inputRef={inputRef}
                        busy={busy}
                        error={error}
                    />
                    <MfaRememberDevice t={t} checked={remember} onChange={setRemember} disabled={busy} />
                    <button
                        type="submit"
                        data-testid="mfa-verify-button"
                        disabled={busy || code.length !== CODE_LENGTH}
                        className="btn-primary w-full"
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {busy ? t("Vérification…") : t("Vérifier")}
                    </button>
                    {onCancel ? (
                        <button type="button" data-testid="mfa-challenge-cancel" onClick={onCancel} disabled={busy} className="btn-secondary w-full">
                            {t("Annuler")}
                        </button>
                    ) : null}
                </form>
            ) : null}

            <MfaAccountFooter t={t} userEmail={userEmail} onLogout={onLogout} busy={busy}>
                <p>
                    {team ? (
                        t("Téléphone perdu ? Demandez à l'administrateur du site de supprimer votre facteur dans Supabase.")
                    ) : (
                        <MfaLostDeviceHelp t={t} />
                    )}
                </p>
            </MfaAccountFooter>
        </MfaShell>
    );
};
