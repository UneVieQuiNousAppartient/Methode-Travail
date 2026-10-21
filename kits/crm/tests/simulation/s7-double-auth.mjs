// Kit CRM (methode-travail) — origine : KHI Educ, harnais de simulation de l'admin (bloc-notes de session, sim/s7.mjs), oct. 2026. À adapter : voir BRIQUE.md.
// Scénario 7 — double authentification « se souvenir de cet appareil 30 jours » (brique auth) :
//   avec appareil de confiance → l'admin s'ouvre sans demander le code ;
//   sans                       → écran du code, case « se souvenir » présente.
// data-testid attendus : mfa-challenge, admin-dashboard, mfa-remember-device (à adapter au frontend).
// Usage : node simulation/s7-double-auth.mjs [capture-sans-appareil.png]
import { openAdmin, makeStore } from "./harness.mjs";

for (const [label, hasDevice] of [["appareil de confiance", true], ["sans appareil de confiance", false]]) {
    const store = makeStore();
    store.mfaNeed = true;
    store.hasDevice = hasDevice;
    const opened = await openAdmin({ store }).catch((e) => ({ err: e }));
    if (!opened.page) {
        console.log(`✖ ${label} → ouverture impossible : ${opened.err?.message?.split("\n")[0]}`);
        continue;
    }
    const { browser, page, errors } = opened;
    await page.waitForTimeout(2500);
    const challenge = await page.isVisible('[data-testid="mfa-challenge"]');
    const dashboard = await page.isVisible('[data-testid="admin-dashboard"]');
    const box = await page.locator('[data-testid="mfa-remember-device"]').isChecked().catch(() => "absente");
    const calls = store.calls.map((c) => c.method + " " + c.path).filter((c) => /mfa|admin\/me|auth\/role/.test(c));
    const expected = hasDevice ? dashboard && !challenge : challenge && !dashboard;
    console.log(`${expected ? "✓" : "✖"} ${label} → écran du code: ${challenge} | admin: ${dashboard} | case cochée: ${box} | appels: ${calls.join(" ; ")} | erreurs: ${errors.join(" / ") || "aucune"}`);
    if (!hasDevice && process.argv[2]) await page.screenshot({ path: process.argv[2] });
    await browser.close();
}
