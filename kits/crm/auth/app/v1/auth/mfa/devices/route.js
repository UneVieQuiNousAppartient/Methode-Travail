// Kit CRM (methode-travail) — origine : KHI Educ, app/v1/auth/mfa/devices/route.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserWithMfa } from "@/lib/authServer";
import { TRUST_COOKIE, listTrustedDevices, parseTrustCookie, revokeTrustedDevices, trustCookieHeader } from "@/lib/mfaTrust";
import { audit } from "@/lib/audit";

// Appareils de confiance du compte connecté (lib/mfaTrust.js). Double authentification
// satisfaite exigée (aal2 ou session de confiance) : 403 { code } sinon.
//   GET    → { devices: [{ id, label, created_at, expires_at, last_used_at, current }] }
//   DELETE ?id=<uuid> → oublie cet appareil ; sans id → oublie tous les appareils. → { revoked: n }
//          L'appareil en cours oublié : son témoin est effacé (le code sera redemandé à la prochaine connexion).
const guard = async (request) => {
    const ctx = await getUserWithMfa(request);
    if (!ctx) return { error: NextResponse.json({ detail: "Non authentifié" }, { status: 401 }) };
    if (ctx.mfa.required && !ctx.mfa.satisfied) {
        return { error: NextResponse.json({ detail: "Double authentification requise.", code: ctx.mfa.code }, { status: 403 }) };
    }
    return { ctx, currentId: parseTrustCookie(request.cookies.get(TRUST_COOKIE)?.value)?.id || null };
};

export async function GET(request) {
    const { ctx, currentId, error } = await guard(request);
    if (error) return error;
    try {
        const devices = await listTrustedDevices(getSupabaseAdmin(), { userId: ctx.user.id });
        return NextResponse.json({ devices: devices.map((d) => ({ ...d, current: d.id === currentId })) });
    } catch (e) {
        console.error("[mfa/devices]", e.message);
        return NextResponse.json({ detail: "Erreur serveur" }, { status: 500 });
    }
}

export async function DELETE(request) {
    const { ctx, currentId, error } = await guard(request);
    if (error) return error;
    const id = request.nextUrl.searchParams.get("id");
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ detail: "Appareil inconnu" }, { status: 422 });
    try {
        const revoked = await revokeTrustedDevices(getSupabaseAdmin(), { userId: ctx.user.id, id: id ? id.toLowerCase() : null });
        if (revoked) {
            await audit({ actor: ctx.user.id, action: id ? "mfa.device_forgotten" : "mfa.devices_forgotten", target_type: "mfa_device", target_id: id, meta: { revoked } }, request);
        }
        const res = NextResponse.json({ revoked });
        if (!id || (currentId && id.toLowerCase() === currentId)) res.headers.append("Set-Cookie", trustCookieHeader("", 0));
        return res;
    } catch (e) {
        console.error("[mfa/devices]", e.message);
        return NextResponse.json({ detail: "Erreur serveur" }, { status: 500 });
    }
}
