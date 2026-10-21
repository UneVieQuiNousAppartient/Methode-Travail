// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/mfa/MfaShared.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { LogOut } from "lucide-react";
import { AdminAuthLayout } from "@/components/admin/AdminAuthLayout";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { BRAND } from "@/lib/adminClient/brand";

// Double authentification (TOTP) — pièces communes à MfaChallenge, MfaEnroll et MfaSettingsSection. Supabase Auth
// gère les facteurs côté navigateur ; le SERVEUR (brique kits/crm/auth/) décide qui doit être au niveau « aal2 » et
// le dit dans GET /v1/admin/me → mfa.code. L'écran ne décide jamais seul.

export const CODE_LENGTH = 6;

// Nom affiché par l'application d'authentification au-dessus du code.
export const MFA_ISSUER = BRAND.mfaIssuer;

// Public des écrans : « admin » (l'équipe, valeur par défaut) ou toute autre valeur (« client », « membre »… :
// un espace client où la double authentification est obligatoire). À un client, on ne parle ni d'administration ni
// de Supabase : son accès se réinitialise sur demande à l'équipe.
export const isTeamAudience = (audience = "admin") => audience === "admin";

// Chiffres seulement, six au plus.
export const sanitizeCode = (value) => String(value || "").replace(/\D/g, "").slice(0, CODE_LENGTH);

// Codes d'erreur de Supabase Auth pour un code faux ou périmé (@supabase/auth-js 2.86, ErrorCode).
// Sans code (ancienne API), un 422 sur la vérification est un code refusé.
const WRONG_CODE_ERRORS = new Set(["mfa_verification_failed", "mfa_challenge_expired", "mfa_verification_rejected"]);
export const isWrongCodeError = (error) =>
    Boolean(error) && (WRONG_CODE_ERRORS.has(error.code) || (!error.code && error.status === 422));
const isRateLimitError = (error) => error?.code === "over_request_rate_limit" || error?.status === 429;
// Facteur disparu entre-temps (retiré par une inscription lancée dans un autre onglet, ou purgé par
// Supabase) : ni un code faux ni une panne réseau — il faut un nouveau code QR, ou laisser le serveur
// dire ce qu'il exige encore.
export const isFactorGoneError = (error) =>
    Boolean(error) && (error.code === "mfa_factor_not_found" || (!error.code && error.status === 404));
// Double authentification désactivée sur le projet, ou trop d'appareils : l'utilisateur n'y peut rien seul.
const ADMIN_ERRORS = new Set(["mfa_totp_enroll_not_enabled", "mfa_totp_verify_not_enabled", "too_many_enrolled_mfa_factors"]);

// Message affiché après un échec de vérification. Le message brut de Supabase n'est jamais montré
// (anglais, technique) : l'appelant le consigne dans la console. `audience` : voir isTeamAudience.
export const verifyErrorMessage = (error, t, audience = "admin") => {
    if (isWrongCodeError(error)) return t("Code incorrect ou expiré. Réessayez avec le code affiché maintenant.");
    if (isRateLimitError(error)) return t("Trop de tentatives. Patientez un moment, puis réessayez.");
    if (ADMIN_ERRORS.has(error?.code)) {
        return isTeamAudience(audience)
            ? t("La double authentification n'est pas disponible pour ce compte : prévenez l'administrateur du site.")
            : t("La double authentification n'est pas disponible pour ce compte : écrivez-nous pour que notre équipe vérifie votre accès.");
    }
    return t("La vérification n'a pas abouti. Vérifiez votre connexion, puis réessayez.");
};

// « Téléphone perdu ? » d'un client : l'équipe retire son appareil et il en inscrit un nouveau à la connexion
// suivante. Lien vers la page de contact (BRAND.contactHref). Une seule phrase à traduire, coupée autour de {link} ;
// <span> : se glisse dans un <p>.
export const MfaLostDeviceHelp = ({ t, href = BRAND.contactHref }) => {
    const [before, after = ""] = t("Téléphone perdu ? {link} : notre équipe réinitialisera votre accès.").split("{link}");
    return (
        <span>
            {before}
            <a
                href={href}
                data-testid="mfa-contact-link"
                className="font-semibold text-brand-night underline decoration-brand-gold underline-offset-4 transition-colors hover:text-brand-darkgold"
            >
                {t("Écrivez-nous")}
            </a>
            {after}
        </span>
    );
};

// Opérations d'inscription en file : en développement, React monte deux fois les effets (StrictMode) ;
// deux inscriptions simultanées portant le même nom d'appareil seraient refusées par Supabase
// (mfa_factor_name_conflict). Chaque opération attend la fin de la précédente.
let mfaQueue = Promise.resolve();
export const runSerially = (fn) => {
    const run = mfaQueue.then(fn);
    mfaQueue = run.catch(() => {});
    return run;
};

// Retrait « au mieux » d'un facteur en attente (inscription abandonnée) : un échec ne bloque rien,
// le facteur non vérifié est de toute façon retiré au début de la prochaine inscription.
export const unenrollQuietly = async (factorId) => {
    try {
        const { error } = await getSupabaseBrowser().auth.mfa.unenroll({ factorId });
        if (error) console.error("MFA : facteur en attente non retiré", error);
    } catch (err) {
        console.error("MFA : facteur en attente non retiré", err);
    }
};

// Écran pleine page (inscription, code) dans le gabarit de la page de connexion qui le précède : l'équipe et les
// espaces client gardent le même volet et la même carte (AdminAuthLayout, variante "team" ou "space").
export const MfaShell = ({ t, audience = "admin", testid, title, intro, children, brandName = BRAND.name, logo = BRAND.logo }) => (
    <AdminAuthLayout t={t} testid={testid} variant={isTeamAudience(audience) ? "team" : "space"} brandName={brandName}>
        {logo ? <img src={logo} alt={brandName} className="h-12 w-auto rounded-lg border border-brand-beige/70 bg-white p-1" /> : null}
        <h1 className={`${logo ? "mt-6 " : ""}font-serif text-2xl font-bold text-brand-night sm:text-3xl`}>{title}</h1>
        {intro ? <p className="mt-1.5 text-xs leading-relaxed text-brand-warmgray sm:text-sm">{intro}</p> : null}
        {children}
    </AdminAuthLayout>
);

// Pied des écrans pleine page : compte connecté et déconnexion (cible de 44 px).
export const MfaAccountFooter = ({ t, userEmail = "", onLogout, busy = false, children }) => (
    <div className="mt-6 space-y-2 border-t border-brand-beige/70 pt-5 text-center text-xs leading-relaxed text-brand-warmgray">
        {children}
        {/* break-words : une longue adresse ne déborde pas de la carte à 375 px */}
        {userEmail ? <p className="break-words">{t("Connecté en tant que {email}", { email: userEmail })}</p> : null}
        <button
            type="button"
            data-testid="mfa-logout"
            onClick={() => onLogout?.()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-night underline decoration-brand-gold underline-offset-4 transition-colors hover:text-brand-darkgold disabled:opacity-50"
        >
            <LogOut className="h-4 w-4" />
            {t("Se déconnecter")}
        </button>
    </div>
);

// Champ du code : chiffres seulement, clavier numérique, remplissage automatique du code reçu.
// Pas de maxLength : un code collé avec séparateur (« 123 456 ») serait coupé avant nettoyage ;
// sanitizeCode garde déjà six chiffres au plus.
// En cours de vérification il passe en lecture seule (et non « disabled ») pour garder le focus.
// autoFocus : oui sur l'écran du code ; non à l'inscription, où le clavier du téléphone masquerait
// le code QR et la clé avant qu'on les ait lus.
export const MfaCodeField = ({ id, t, value, onChange, inputRef, busy = false, error = "", autoFocus = true }) => {
    const errorId = `${id}-error`;
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-brand-night">
                {t("Code à 6 chiffres")}
            </label>
            <input
                id={id}
                ref={inputRef}
                data-testid="mfa-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus={autoFocus}
                readOnly={busy}
                value={value}
                onChange={(e) => onChange(sanitizeCode(e.target.value))}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? errorId : undefined}
                className="input-field text-center font-mono text-xl tracking-[0.4em]"
            />
            {error ? (
                <p
                    id={errorId}
                    role="alert"
                    data-testid="mfa-error"
                    className="mt-2 rounded-[8px] bg-brand-champagne px-4 py-2.5 text-xs font-semibold text-brand-darkgold"
                >
                    {error}
                </p>
            ) : null}
        </div>
    );
};

// --- Appareil de confiance (routes de la brique kits/crm/auth/) ------------------------------------
// « Se souvenir de cet appareil pendant 30 jours » : cochée par défaut (sinon personne ne la coche). Après un code
// juste, rememberThisDevice demande au serveur de poser le témoin httpOnly ; à la connexion suivante,
// redeemTrustedDevice le présente AVANT l'écran du code : réponse vraie = la session en cours vaut un code
// juste (serveur et base), rien à demander. Le témoin n'est jamais lisible par le JavaScript de la page.
const authPost = async (path) => {
    const {
        data: { session },
    } = await getSupabaseBrowser().auth.getSession();
    if (!session?.access_token) return null;
    return fetch(path, { method: "POST", credentials: "same-origin", headers: { Authorization: `Bearer ${session.access_token}` } });
};

export const rememberThisDevice = async () => {
    try {
        const res = await authPost("/v1/auth/mfa/trust");
        return Boolean(res?.ok);
    } catch (err) {
        console.error("MFA : appareil non retenu", err);
        return false;
    }
};

export const redeemTrustedDevice = async () => {
    try {
        const res = await authPost("/v1/auth/mfa/trusted-session");
        if (!res?.ok) return false;
        const data = await res.json().catch(() => ({}));
        return data?.trusted === true;
    } catch {
        return false;
    }
};

export const MfaRememberDevice = ({ t, checked, onChange, disabled = false }) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-brand-beige bg-brand-warmwhite px-3 py-2.5 text-sm text-brand-night">
        <input
            type="checkbox"
            data-testid="mfa-remember-device"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-darkgold"
        />
        <span>
            <span className="font-semibold">{t("Se souvenir de cet appareil pendant 30 jours")}</span>
            <span className="mt-0.5 block text-xs text-brand-warmgray">
                {t("Le code ne sera plus demandé sur cet appareil. Décochez sur un ordinateur partagé.")}
            </span>
        </span>
    </label>
);
