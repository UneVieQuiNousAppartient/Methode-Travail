// Kit CRM (methode-travail) — origine : KHI Educ, lib/mfa.js, oct. 2026. À adapter : voir BRIQUE.md.
// Double authentification (MFA, TOTP de Supabase Auth).
//
// Supabase gère l'inscription du facteur (application d'authentification, code QR) et la vérification
// du code côté navigateur (supabase.auth.mfa.enroll / challenge / verify) ; la session passe alors du
// niveau « aal1 » (mot de passe ou Google) au niveau « aal2 ». Le serveur, lui, décide qui doit être
// en aal2 (lib/authServer.js) :
//   Équipe (liste blanche) :
//   - un membre qui a un facteur vérifié : toujours (sinon, voler son mot de passe suffirait) ;
//   - tous les membres si ADMIN_MFA_REQUIRED=1 (à activer une fois l'écran d'inscription livré et
//     chaque membre inscrit : sans facteur, l'accès est refusé avec le code mfa_enrollment_required).
//   GET /v1/admin/me répond toujours (avec `mfa`) pour que l'écran sache s'il doit demander le code ou
//   proposer l'inscription. Les clés d'API ne sont pas concernées (secrets gérés dans l'admin).
//   Téléphone perdu : Supabase › Authentication › Users › le membre › supprimer le facteur.
//
//   Espaces clients (rôles de MFA_ALWAYS_ROLES) : double authentification OBLIGATOIRE pour tous, sans
//   variable d'environnement — première connexion : inscription du facteur ; ensuite, le code à chaque
//   connexion. Deux verrous : la base (politiques restrictives aal2, supabase/migrations/0003…) pour ce que
//   le navigateur lit, et getUserWithRole (lib/authServer.js) pour les routes serveur, qui passent par
//   service_role et contournent RLS. GET /v1/auth/role reste ouvert en aal1 (routage après connexion).

export const mfaRequiredForAll = () => process.env.ADMIN_MFA_REQUIRED === "1";

// Rôles de profiles pour qui le facteur ET la session aal2 sont toujours exigés. Exemple : à adapter.
export const MFA_ALWAYS_ROLES = Object.freeze(["parent", "tutor"]);
export const mfaRequiredForRole = (role) => MFA_ALWAYS_ROLES.includes(role);

// Niveau de la session, lu dans le jeton (déjà validé par supabase.auth.getUser) : "aal1" | "aal2" | null.
// Ne JAMAIS appeler sur un jeton non vérifié : la charge utile d'un JWT se falsifie sans la signature.
export const sessionAal = (token) => {
    try {
        const payload = String(token || "").split(".")[1];
        if (!payload) return null;
        const aal = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.aal;
        return aal === "aal1" || aal === "aal2" ? aal : null;
    } catch {
        return null;
    }
};

// → { enrolled, aal, required, required_for_all, satisfied, code, trusted_device } ; code : null |
// "mfa_required" | "mfa_enrollment_required". required_for_all = ADMIN_MFA_REQUIRED actif : l'écran
// « Sécurité du compte » peut dire sans conditionnel qu'après le retrait du dernier appareil il faudra en
// inscrire un. trusted (lib/mfaTrust.js) : la session en cours est une session de confiance (appareil retenu
// 30 jours) — elle remplace le code, jamais l'inscription : sans facteur vérifié, elle ne compte pas.
export const isEnrolled = (user) => (user?.factors || []).some((f) => f?.status === "verified");

export const mfaState = (user, token, { requiredForAll = mfaRequiredForAll(), trusted = false } = {}) => {
    const enrolled = isEnrolled(user);
    const aal = sessionAal(token);
    const required = enrolled || requiredForAll;
    const trustedSession = Boolean(trusted) && enrolled && aal !== "aal2";
    const satisfied = !required || aal === "aal2" || trustedSession;
    const code = satisfied ? null : enrolled ? "mfa_required" : "mfa_enrollment_required";
    return { enrolled, aal, required, required_for_all: Boolean(requiredForAll), satisfied, code, trusted_device: trustedSession };
};

export const MFA_MESSAGES = {
    mfa_required: "Double authentification requise : entrez le code de votre application d'authentification.",
    mfa_enrollment_required: "Double authentification obligatoire : activez-la avant d'accéder à l'administration.",
};

// Mêmes codes pour les espaces clients ; seule la destination change (pas d'« administration »).
export const MFA_SPACE_MESSAGES = {
    mfa_required: MFA_MESSAGES.mfa_required,
    mfa_enrollment_required: "Double authentification obligatoire : activez-la avant d'accéder à votre espace.",
};
