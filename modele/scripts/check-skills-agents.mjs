// Méthode 1.7.0, repris tel quel de VieSolution-CSF (scripts/check-skills-agents.mjs, 6 nov. 2026).
// Signale chaque skill déclarée dans le champ `skills:` d'un agent (.claude/agents/*.md) mais introuvable.
//
// Incident (6 nov. 2026) : `ux-agent` déclarait `design:accessibility-review` depuis des semaines ; le plugin
// `design` est désactivé dans .claude/settings.json (15 oct.). Test sur un vrai lancement de l'agent : la skill
// manquait SANS aucun message d'erreur. Une skill absente ne se voit pas — d'où ce contrôle.
//
// Où l'on cherche une skill « nom » ou « plugin:nom » :
//   1. .claude/skills/<nom>/SKILL.md (dépôt : toujours disponible) ;
//   2. ~/.claude/skills/<nom>/SKILL.md (skills personnelles) ;
//   3. ~/.claude/plugins/**/skills/<nom>/SKILL.md (plugins du compte), sauf si le plugin est désactivé
//      dans .claude/settings.json (`enabledPlugins`, valeur false) quand le nom porte un préfixe « plugin: ».
// Une skill de plugin est disponible ICI mais peut manquer ailleurs (autre poste, autre compte) : c'est
// pourquoi le registre (.claude/skills/REGISTRE.md) réserve le préchargement obligatoire aux skills du dépôt.
//
// Usage : node scripts/check-skills-agents.mjs — appelé par scripts/session-start.sh. N'échoue jamais
// (code 0) : il avertit. Sortie vide quand tout est trouvé.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = path.join(ROOT, ".claude", "agents");
const HOME = os.homedir();
// Skills intégrées à Claude Code lui-même (aucun fichier sur disque) : liste relevée le 6 nov. 2026 dans la
// liste des skills d'une session. Une skill intégrée peut disparaître avec une version : la retirer d'ici
// si c'est le cas.
const BUILTIN = new Set(["claude-api", "code-review", "simplify", "security-review", "init", "loop", "run", "update-config"]);

/** Liste `skills:` du frontmatter : `skills: [a, b]` ou liste YAML `- a`. */
export function parseSkills(markdown) {
    const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return [];
    const lines = fm[1].split(/\r?\n/);
    const i = lines.findIndex((l) => /^skills:/.test(l));
    if (i < 0) return [];
    const inline = lines[i].replace(/^skills:\s*/, "").replace(/\s+#.*$/, "").trim();
    const clean = (s) => s.trim().replace(/^["']|["']$/g, "");
    if (inline.startsWith("[")) {
        // liste inline, éventuellement sur plusieurs lignes jusqu'au « ] »
        let texte = inline;
        for (let k = i + 1; !texte.includes("]") && k < lines.length; k++) texte += lines[k].replace(/\s+#.*$/, "");
        return texte.replace(/^\[/, "").replace(/\].*$/, "").split(",").map(clean).filter(Boolean);
    }
    if (inline) return [clean(inline)]; // `skills: nom` (valeur seule)
    const out = [];
    for (const l of lines.slice(i + 1)) {
        const m = l.match(/^\s*-\s*(.+)$/);
        if (!m) break;
        out.push(m[1].trim().replace(/^["']|["']$/g, ""));
    }
    return out;
}

function disabledPlugins() {
    try {
        const s = JSON.parse(readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));
        return new Set(Object.entries(s.enabledPlugins ?? {}).filter(([, v]) => v === false).map(([k]) => k.split("@")[0]));
    } catch {
        return new Set();
    }
}

/** Skill → plugins qui la fournissent (nom du dossier parent de `skills/`, qui est aussi la clé de
 *  `enabledPlugins` pour les plugins synchronisés nommés : `design`, `engineering`…). Profondeur bornée. */
function pluginSkillDirs() {
    const found = new Map();
    const base = path.join(HOME, ".claude", "plugins");
    const walk = (dir, depth) => {
        if (depth > 6) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(dir, e.name);
            if (e.name === "skills") {
                for (const s of readdirSync(p, { withFileTypes: true })) {
                    if (!s.isDirectory() || !existsSync(path.join(p, s.name, "SKILL.md"))) continue;
                    found.set(s.name, [...(found.get(s.name) ?? []), path.basename(dir)]);
                }
            } else walk(p, depth + 1);
        }
    };
    if (existsSync(base) && statSync(base).isDirectory()) walk(base, 0);
    return found;
}

export function locate(name, { pluginDirs, disabled, root = ROOT, home = HOME }) {
    const [plugin, bare] = name.includes(":") ? name.split(":", 2) : [null, name];
    if (!plugin && BUILTIN.has(bare)) return "intégrée";
    if (!plugin && existsSync(path.join(root, ".claude", "skills", bare, "SKILL.md"))) return "dépôt";
    if (!plugin && existsSync(path.join(home, ".claude", "skills", bare, "SKILL.md"))) return "personnelle";
    if (plugin && disabled.has(plugin)) return null;
    // Un nom court n'est trouvé que si l'un des plugins qui le fournissent n'est pas désactivé ;
    // un nom préfixé, seulement dans le plugin nommé.
    const fournisseurs = (pluginDirs.get(bare) ?? []).filter((nom) => !disabled.has(nom) && (!plugin || nom === plugin || !/^[a-z-]+$/.test(nom)));
    return fournisseurs.length ? "plugin" : null;
}

function main() {
    if (!existsSync(AGENTS)) return;
    const ctx = { pluginDirs: pluginSkillDirs(), disabled: disabledPlugins() };
    const missing = [];
    for (const f of readdirSync(AGENTS).filter((x) => x.endsWith(".md")).sort()) {
        for (const skill of parseSkills(readFileSync(path.join(AGENTS, f), "utf8"))) {
            if (!locate(skill, ctx)) missing.push(`- \`${f.replace(/\.md$/, "")}\` attend \`${skill}\` : introuvable (l'agent travaillera SANS, sans message d'erreur)`);
        }
    }
    if (missing.length) {
        console.log("\n## ⚠️ Skills déclarées mais absentes");
        console.log(missing.join("\n"));
        console.log("Voir .claude/skills/REGISTRE.md (quoi faire quand une skill manque).");
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (e) {
        console.error(`[check-skills-agents] ignoré : ${e.message}`);
    }
}
