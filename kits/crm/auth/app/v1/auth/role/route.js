// Kit CRM (methode-travail) — origine : KHI Educ, app/v1/auth/role/route.js, oct. 2026. À adapter : voir BRIQUE.md.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/authServer";

// Renvoie le rôle de l'utilisateur connecté : admin (liste blanche) ou le rôle de profiles.
// Ouverte en aal1 (pas de contrôle MFA) : sert au routage juste après la connexion, avant l'écran du code.
// Rôle par défaut sans profil : à adapter (ici le rôle client par défaut de 0002_profiles.sql).
export async function GET(request) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ detail: "Non authentifié" }, { status: 401 });
    }
    const supabase = getSupabaseAdmin();
    const { data: adminRow } = await supabase
        .from("admin_allowlist")
        .select("email, role, name")
        .eq("email", user.email)
        .maybeSingle();
    if (adminRow) {
        // `role: "admin"` = accès à l'espace admin ; `team_role` = droits dans cet espace (lib/roles.js)
        return NextResponse.json({ role: "admin", team_role: adminRow.role || "admin", name: adminRow.name || null, email: user.email });
    }
    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    return NextResponse.json({
        role: profile?.role || "parent",
        email: user.email,
    });
}
