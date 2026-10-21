// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/fake-supabase-loader.mjs, oct. 2026. À adapter : voir BRIQUE.md.
// Crochets de chargement des tests de routes, enregistrés APRÈS alias-loader.mjs (ils passent donc
// en premier : Node appelle le dernier crochet enregistré d'abord) :
//   « @/lib/supabaseAdmin » → fake-supabase.mjs (base en mémoire, sans réseau) ;
//   « next/server »         → « next/server.js » (Next n'a pas de carte d'exports lisible par Node seul).
// Usage, en tête du test :
//   import { register } from "node:module";
//   register("./alias-loader.mjs", import.meta.url);
//   register("./fake-supabase-loader.mjs", import.meta.url);
//   const { createFakeSupabase, installFakeSupabase } = await import("./fake-supabase.mjs");
//   // puis les modules du projet par import() dynamique (après register, jamais en import statique).
const FAKE = new URL("./fake-supabase.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
    if (specifier === "@/lib/supabaseAdmin") return { url: FAKE, shortCircuit: true };
    if (specifier === "next/server") return next("next/server.js", context);
    return next(specifier, context);
}
