// Kit CRM (methode-travail) — origine : KHI Educ, scripts/run-unit-tests.mjs, oct. 2026. À adapter : voir BRIQUE.md.
// Lance chaque tests/unit/*.test.mjs dans un processus Node séparé et résume. Aucune dépendance :
// un test échoue en sortant avec un code ≠ 0 ; ses lignes « ✓ » / « ✖ » sont comptées.
// Un processus par fichier : chaque test enregistre ses propres crochets de chargement et sa base.
// Usage : npm test   (ou node scripts/run-unit-tests.mjs [motif] — ex. « mfa » pour mfa*.test.mjs)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "unit");
const filter = process.argv[2] || "";
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs") && f.includes(filter)).sort();
let failed = 0;
for (const f of files) {
    const r = spawnSync(process.execPath, ["--no-warnings", path.join(dir, f)], { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" } });
    const out = (r.stdout || "") + (r.stderr || "");
    const checks = (out.match(/^✓/gm) || []).length;
    const fails = (out.match(/^✖/gm) || []).length;
    const ok = r.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${f}  (${checks} ok${fails ? `, ${fails} échec(s)` : ""})`);
    if (!ok) {
        failed += 1;
        console.log(out.split("\n").filter((l) => l.startsWith("✖") || /Error|error/.test(l)).map((l) => "      " + l).join("\n"));
    }
}
console.log(`\n${files.length - failed}/${files.length} fichiers de tests au vert`);
process.exit(failed || !files.length ? 1 : 0);
