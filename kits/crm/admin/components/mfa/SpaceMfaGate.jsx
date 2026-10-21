// Kit CRM (methode-travail) — origine : KHI Educ, components/mfa/SpaceMfaGate.jsx, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { MfaChallenge } from "@/components/admin/mfa/MfaChallenge";
import { MfaEnroll } from "@/components/admin/mfa/MfaEnroll";
import { redeemTrustedDevice } from "@/components/admin/mfa/MfaShared";

// Double authentification obligatoire d'un espace client (hors équipe).
// La base refuse ses tables sans session « aal2 » (RLS) et ses routes /v1/<espace>/* répondent 403 { code: "mfa_…" } :
// chaque espace vérifie donc le niveau de la session AVANT toute lecture, puis affiche ici l'écran du
// code (appareil déjà inscrit) ou l'inscription obligatoire (première connexion).

export const SPACE_MFA_CODES = ["mfa_required", "mfa_enrollment_required"];

// → null (session aal2 ou session de confiance : accès) | "mfa_required" | "mfa_enrollment_required".
// `user` vient de supabase.auth.getUser(), relu sur le serveur : ses facteurs sont à jour. nextLevel de
// getAuthenticatorAssuranceLevel se lit dans la session stockée, qui ignore encore un appareil retiré
// par l'équipe (téléphone perdu) ou inscrit depuis un autre appareil : il enverrait vers un écran du code
// sans appareil. Même règle que le serveur (brique kits/crm/auth/) : un facteur vérifié = le code.
export const readSpaceMfaGate = async (supabase, user) => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data?.currentLevel === "aal2") return null;
    const enrolled = (user?.factors || []).some((factor) => factor?.status === "verified");
    if (!enrolled) return "mfa_enrollment_required";
    // Appareil de confiance (« 30 jours ») : la session en cours devient session de confiance ;
    // la base l'accepte alors comme aal2 (public.mfa_session_ok()) et l'espace charge sans demander le code.
    return (await redeemTrustedDevice()) ? null : "mfa_required";
};

// Écran à la place de l'espace. `audience` : "client" par défaut (toute valeur autre que "admin" : textes d'aide
// sans « administration ») ;
// onPassed : l'espace relit le niveau puis charge ses données ; onLogout : la déconnexion de l'espace.
export const SpaceMfaGate = ({ gate, audience = "client", t, locale, userEmail = "", onPassed, onLogout }) => (
    <div data-testid="space-mfa-gate">
        {gate === "mfa_required" ? (
            <MfaChallenge audience={audience} t={t} userEmail={userEmail} onVerified={onPassed} onLogout={onLogout} />
        ) : (
            <MfaEnroll
                mandatory
                audience={audience}
                t={t}
                locale={locale}
                userEmail={userEmail}
                onEnrolled={onPassed}
                onLogout={onLogout}
            />
        )}
    </div>
);
