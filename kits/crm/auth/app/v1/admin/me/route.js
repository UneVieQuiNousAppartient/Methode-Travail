// Kit CRM (methode-travail) — origine : KHI Educ, app/v1/admin/me/route.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { deny, getAdminFromRequest } from "@/lib/authServer";
import { ROLE_LABELS, permissionsOf } from "@/lib/roles";

// GET /v1/admin/me — qui suis-je, quel rôle, quels droits (pour cacher ce qui est interdit).
// Point d'extension : ajouter ici ce dont l'écran a besoin au chargement (ex. adresse publique du site).
export async function GET(request) {
    const admin = await getAdminFromRequest(request);
    if (!admin) return deny(request);
    return NextResponse.json({
        email: admin.email,
        name: admin.name || null,
        role: admin.role,
        role_label: ROLE_LABELS[admin.role] || admin.role,
        via: admin.via,
        permissions: permissionsOf(admin.role),
        // Double authentification (lib/mfa.js) — null hors session (clé d'API).
        // code : null | "mfa_required" (demander le code) | "mfa_enrollment_required" (proposer l'inscription).
        // trusted_device : session de confiance (appareil retenu 30 jours, lib/mfaTrust.js).
        mfa: admin.mfa
            ? { enrolled: admin.mfa.enrolled, aal: admin.mfa.aal, required: admin.mfa.required, required_for_all: admin.mfa.required_for_all, code: admin.mfa.code, trusted_device: Boolean(admin.mfa.trusted_device) }
            : null,
    });
}
