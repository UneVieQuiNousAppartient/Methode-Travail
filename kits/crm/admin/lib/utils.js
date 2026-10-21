// Kit CRM (methode-travail) — origine : KHI Educ, lib/utils.js, oct. 2026. À adapter : voir BRIQUE.md.
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// cn() de shadcn/ui : assemble des classes et laisse la dernière gagner en cas de conflit (px-4 puis px-3 → px-3).
// tailwind-merge doit connaître les tailles de police NOMMÉES de tailwind.config.js (ici text-button, utilisée par
// .btn-primary / .btn-secondary) : sans cela il les prend pour des couleurs et les écrase par text-white, etc.
// Ajoutez à la liste chaque taille nommée de votre thème. Si le projet a déjà un lib/utils.js (shadcn), gardez le
// sien et ajoutez-y seulement ce bloc.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [{ text: ["button"] }],
        },
    },
});

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
