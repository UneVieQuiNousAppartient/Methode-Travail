// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/alias-loader.mjs, oct. 2026. À adapter : voir BRIQUE.md.
// Résout l'alias "@/…" du projet hors Next.js (tests unitaires), comme jsconfig.json pour Next.
// Portable : la racine est déduite de l'emplacement de ce fichier (tests/unit/ → ../../).
import { existsSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).href;
export async function resolve(specifier, context, next) {
    // « next/server » (routes, lib/authServer.js) : Next le résout lui-même ;
    // hors Next, l'ESM de Node exige l'extension.
    if (specifier === "next/server") return next("next/server.js", context);
    // « next/cache » : idem. Hors Next, revalidateTag lève (pas de requête en cours) : l'appeler dans un try/catch.
    if (specifier === "next/cache") return next("next/cache.js", context);
    if (specifier.startsWith("@/")) {
        const rel = specifier.slice(2);
        if (rel.endsWith(".js")) return next(ROOT + rel, context);
        // « @/lib/ai » = lib/ai.js, ou lib/ai/index.js (dossier), comme le fait Next
        const file = new URL(rel + ".js", ROOT);
        const index = new URL(rel + "/index.js", ROOT);
        return next(existsSync(file) || !existsSync(index) ? file.href : index.href, context);
    }
    return next(specifier, context);
}
