// Kit CRM (methode-travail) — origine : KHI Educ, lib/supabaseClient.js, oct. 2026. À adapter : voir BRIQUE.md.
import { createBrowserClient } from "@supabase/ssr";

// Client navigateur — clé anon publique, sécurité assurée par RLS (jamais la clé service_role ici).
// createBrowserClient garde un client unique par onglet : l'appeler à chaque requête ne recrée pas de session.
export const getSupabaseBrowser = () =>
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
