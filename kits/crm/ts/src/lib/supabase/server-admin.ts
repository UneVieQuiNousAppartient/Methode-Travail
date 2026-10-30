// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/supabase/server-admin.ts, commit 508f19a (2026-10-30) ; généralisé : repris tel quel. SERVEUR SEULEMENT : clé service_role, contourne la RLS ; ne jamais importer depuis un composant client.
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRole) return null;

  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
