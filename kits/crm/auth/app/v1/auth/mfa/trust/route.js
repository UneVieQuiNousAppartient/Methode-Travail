// Kit CRM (methode-travail) — origine : KHI Educ, app/v1/auth/mfa/trust/route.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserWithMfa } from "@/lib/authServer";
import { TRUST_DAYS, trustCookieHeader, trustDevice } from "@/lib/mfaTrust";
import { audit } from "@/lib/audit";

// POST /v1/auth/mfa/trust — « Se souvenir de cet appareil pendant 30 jours » (lib/mfaTrust.js).
// Appelée juste après un code juste : session aal2 et facteur inscrit exigés (une session de confiance ne
// prolonge pas sa propre confiance). → 201 { trusted: true, expires_at, label } + témoin httpOnly ;
// 401 sans session ; 403 { code: "mfa_required" } hors aal2.
export async function POST(request) {
    const ctx = await getUserWithMfa(request);
    if (!ctx) return NextResponse.json({ detail: "Non authentifié" }, { status: 401 });
    if (!ctx.mfa.enrolled || ctx.mfa.aal !== "aal2") {
        return NextResponse.json({ detail: "Entrez d'abord le code de votre application d'authentification.", code: "mfa_required" }, { status: 403 });
    }
    try {
        const { device, cookieValue } = await trustDevice(getSupabaseAdmin(), {
            userId: ctx.user.id,
            userAgent: request.headers.get("user-agent"),
        });
        await audit({ actor: ctx.user.id, action: "mfa.device_trusted", target_type: "mfa_device", target_id: device.id, meta: { label: device.label } }, request);
        const res = NextResponse.json({ trusted: true, expires_at: device.expires_at, label: device.label }, { status: 201 });
        res.headers.append("Set-Cookie", trustCookieHeader(cookieValue, TRUST_DAYS * 24 * 60 * 60));
        return res;
    } catch (e) {
        console.error("[mfa/trust]", e.message);
        return NextResponse.json({ detail: "Erreur serveur" }, { status: 500 });
    }
}
