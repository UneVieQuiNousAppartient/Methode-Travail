// Veille des skills copiées d'un autre dépôt (.claude/skills/*) : compare chaque skill à sa source
// GitHub et signale celles qui ont changé en amont. Ne met RIEN à jour : une skill est une instruction
// que l'agent suivra, on relit le diff avant de la remplacer (convention SOURCE.md, README du modèle).
//
// Deux sources d'information :
//   - skills-lock.json (skills installées par `npx skills add`) : SKILL.md local vs distant ;
//   - SOURCE.md « Copié depuis https://github.com/<dépôt>/tree/<commit>/<chemin> » : dernier commit du chemin.
// Silencieux sans réseau ou sans dépôt ; 12 s maximum. Sortie : une ligne par skill à revoir.
//
// Usage : node scripts/skills-check.mjs — à la main (skill point-projet), ou en hook SessionStart
// facultatif dans .claude/settings.json (coûte jusqu'à 12 s au démarrage de chaque session).
// Modèle « methode-travail » : repris tel quel de KHI Educ (15 oct. 2026), générique.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, ".claude", "skills");
const deadline = Date.now() + 12000;
const sha = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
const get = async (url, headers = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.max(1000, deadline - Date.now()));
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "methode-travail-skills-check", ...headers } });
        return r.ok ? await r.text() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
};

const main = async () => {
    if (!existsSync(SKILLS)) return;
    const updates = [];
    const checks = [];

    // 1. skills-lock.json
    const lockPath = path.join(ROOT, "skills-lock.json");
    if (existsSync(lockPath)) {
        try {
            const lock = JSON.parse(readFileSync(lockPath, "utf8"));
            for (const [name, info] of Object.entries(lock.skills || {})) {
                const local = path.join(SKILLS, name, "SKILL.md");
                if (!existsSync(local) || info.sourceType !== "github" || !info.skillPath) continue;
                checks.push((async () => {
                    const remote = await get(`https://raw.githubusercontent.com/${info.source}/HEAD/${info.skillPath}`);
                    if (remote && sha(remote) !== sha(readFileSync(local, "utf8"))) updates.push(`${name} (source ${info.source}) — SKILL.md a changé en amont`);
                })());
            }
        } catch {
            // lock illisible : on ignore
        }
    }

    // 2. SOURCE.md des skills copiés à la main
    for (const dir of readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
        const src = path.join(SKILLS, dir, "SOURCE.md");
        if (!existsSync(src)) continue;
        const m = /github\.com\/([^/\s]+\/[^/\s]+)\/tree\/([0-9a-f]{7,40})\/([^\s)]+)/.exec(readFileSync(src, "utf8"));
        if (!m) continue;
        const [, repo, pinned, dirPath] = m;
        checks.push((async () => {
            // Dernier commit qui touche le dossier : aujourd'hui (HEAD) vs au moment de la copie (sha épinglé).
            // Comparer au sha épinglé lui-même donnerait un faux positif dès qu'un autre dossier du dépôt bouge.
            const hdr = { Accept: "application/vnd.github+json" };
            const q = `path=${encodeURIComponent(dirPath)}&per_page=1`;
            const [nowJson, thenJson] = await Promise.all([
                get(`https://api.github.com/repos/${repo}/commits?${q}`, hdr),
                get(`https://api.github.com/repos/${repo}/commits?${q}&sha=${pinned}`, hdr),
            ]);
            if (!nowJson || !thenJson) return;
            try {
                const latest = JSON.parse(nowJson)?.[0]?.sha || "";
                const atCopy = JSON.parse(thenJson)?.[0]?.sha || "";
                if (latest && atCopy && latest !== atCopy) updates.push(`${dir} (source ${repo}) — ${dirPath} a changé depuis la copie (${atCopy.slice(0, 7)} → ${latest.slice(0, 7)})`);
            } catch {
                // réponse inattendue (limite de débit GitHub) : on ignore
            }
        })());
    }

    await Promise.all(checks);
    if (updates.length) {
        console.log(`Skills à revoir (${updates.length}) — relire le diff avant de remplacer (npx skills update -p, ou nouvelle copie + SOURCE.md) :`);
        for (const u of updates) console.log(`  - ${u}`);
    }
};

main().catch(() => {});
