// Kit CRM (methode-travail) — origine : KHI Educ, harnais de simulation de l'admin (bloc-notes de session, sim/common.mjs), oct. 2026. À adapter : voir BRIQUE.md.
// Aides de scénario : une étape = une action de l'utilisateur, puis le compte rendu de ce qui s'est passé.
import { SELECTORS, confirmCard } from "./harness.mjs";

// step(nom, fn) : exécute fn (qui renvoie true/false si une confirmation a été montrée, ou rien), attend,
// puis écrit une ligne :
//   • nom
//       confirmation: oui|NON|- | appels: écritures /v1 faites pendant l'étape | message: nouveaux messages
//       éphémères (AUCUN = action sans retour visible) | encart: role=status/alert affichés
// Une étape impossible (sélecteur absent…) écrit « ✖ … SCÉNARIO IMPOSSIBLE » sans arrêter la suite.
export function stepper(page, store) {
    return async function step(name, fn) {
        const before = store.calls.length;
        // Marque les messages déjà là : seuls les nouveaux comptent pour cette étape.
        await page.evaluate((sel) => document.querySelectorAll(sel).forEach((t) => t.setAttribute("data-sim-seen", "1")), SELECTORS.toast);
        let confirm;
        try {
            confirm = await fn();
        } catch (e) {
            console.log(`✖ ${name} — SCÉNARIO IMPOSSIBLE : ${e.message.split("\n")[0].slice(0, 140)}`);
            return;
        }
        await page.waitForTimeout(900);
        const w = store.calls.slice(before).filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path} ${JSON.stringify(c.body || {}).slice(0, 70)}`);
        const inline = await page.$$eval('[role="status"]:not(.sr-only), [role="alert"]:not(.sr-only)', (els) => els.map((e) => e.textContent.trim()).filter(Boolean)).catch(() => []);
        const fresh = await page.$$eval(`${SELECTORS.toast}:not([data-sim-seen])`, (els) => els.map((e) => e.textContent.trim()));
        console.log(`• ${name}\n    confirmation: ${confirm === undefined ? "-" : confirm ? "oui" : "NON"} | appels: ${w.join(" ; ") || "aucun"} | message: ${fresh.join(" / ") || "AUCUN"}${inline.length ? " | encart: " + inline.join(" / ").slice(0, 120) : ""}`);
    };
}

// Valide la boîte de confirmation si elle s'affiche (saisie de « supprimer » si demandée) → true/false.
export async function confirmIfShown(page, typed = "supprimer") {
    await page.waitForTimeout(250);
    if (await confirmCard(page).isVisible().catch(() => false)) {
        const inp = page.locator(SELECTORS.confirmInput);
        if (await inp.isVisible().catch(() => false)) await inp.fill(typed);
        await page.click(SELECTORS.confirmButton);
        return true;
    }
    return false;
}
