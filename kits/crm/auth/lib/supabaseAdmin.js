// Kit CRM (methode-travail) — origine : KHI Educ, lib/supabaseAdmin.js, oct. 2026. À adapter : voir BRIQUE.md.
import { createClient } from "@supabase/supabase-js";

// Client serveur — clé service_role, jamais exposée au navigateur.
// Pas de repli sur la clé anon : les routes /v1/* écrivent dans des tables
// protégées par RLS et doivent échouer bruyamment si la clé manque,
// plutôt que renvoyer des listes vides ou des insertions refusées.
export const getSupabaseAdmin = () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY manquante : .env.local en local, variables d'environnement de l'hébergeur en production (puis redéployer). Valeur : Supabase → Project Settings → API → service_role.",
        );
    }
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
};
