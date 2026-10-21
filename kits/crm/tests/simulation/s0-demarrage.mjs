// Kit CRM (methode-travail) — origine : KHI Educ, harnais de simulation de l'admin (bloc-notes de session, sim/s0.mjs), oct. 2026. À adapter : voir BRIQUE.md.
// Scénario 0 — démarrage : l'admin s'ouvre-t-il, quels appels au chargement, des doublons, des erreurs ?
// Usage : node simulation/s0-demarrage.mjs [capture.png]
import { openAdmin, duplicateGets } from "./harness.mjs";

const { browser, page, store, errors } = await openAdmin();
console.log("titre:", (await page.textContent("h1").catch(() => null)) || "(aucun h1)");
console.log("appels:", store.calls.map((c) => c.method + " " + c.path).slice(0, 30).join(" | "));
// Un même GET deux fois au démarrage = double chargement (deux effets, ou un effet relancé par un état).
console.log("GET en double:", duplicateGets(store).join(" ; ") || "aucun");
console.log("erreurs de page:", errors.join(" / ") || "aucune");
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await browser.close();
