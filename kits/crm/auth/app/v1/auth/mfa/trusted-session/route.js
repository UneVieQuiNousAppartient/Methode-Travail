// Kit CRM (methode-travail) — origine : KHI Educ, app/v1/auth/mfa/trusted-session/route.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserWithMfa } from "@/lib/authServer";
import { TRUST_COOKIE, redeemTrustCookie, sessionIdOf, trustCookieHeader } from "@/lib/mfaTrust";

// POST /v1/auth/mfa/trusted-session — à la connexion, avant l'écran du code (lib/mfaTrust.js) :
// si ce navigateur présente un témoin d'appareil de confiance valide pour CE compte, la session Supabase en
// cours devient une session de confiance (le code n'est pas redemandé). → 200 { trusted: true|false }.
// Témoin absent : { trusted: false } ; témoin invalide, retiré ou échu : { trusted: false } et témoin effacé.
// Session déjà en aal2, ou compte sans facteur : { trusted: false } (rien à faire).
export async function POST(request) {
    const ctx = await getUserWithMfa(request);
    if (!ctx) return NextResponse.json({ detail: "Non authentifié" }, { status: 401 });
    const cookieValue = request.cookies.get(TRUST_COOKIE)?.value;
    if (!cookieValue || !ctx.mfa.enrolled || ctx.mfa.aal === "aal2") return NextResponse.json({ trusted: Boolean(ctx.mfa.trusted_device) });
    const device = await redeemTrustCookie(getSupabaseAdmin(), {
        cookieValue,
        userId: ctx.user.id,
        sessionId: sessionIdOf(ctx.token),
    }).catch((e) => {
        console.error("[mfa/trusted-session]", e.message);
        return null;
    });
    const res = NextResponse.json({ trusted: Boolean(device) });
    if (!device) res.headers.append("Set-Cookie", trustCookieHeader("", 0));
    return res;
}
