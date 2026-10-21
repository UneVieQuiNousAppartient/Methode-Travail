// Kit CRM (methode-travail) — origine : KHI Educ, tests/unit/fake-supabase-lcap.mjs (+ base scriptée de tests/unit/centre-action.test.mjs), oct. 2026. À adapter : voir BRIQUE.md.
import { randomUUID } from "node:crypto";

// Deux faux Supabase pour tester routes et logique serveur sans réseau.
//
// 1. createFakeSupabase — base EN MÉMOIRE, à état. Chargée à la place de « @/lib/supabaseAdmin » par
//    fake-supabase-loader.mjs ; le test installe sa base :
//
//      const db = createFakeSupabase({ leads: [...] }, { rpc, fail });
//      db.auth = { getUser: async (jeton) => ({ data: { user }, error: null }) };   // si le code lit Auth
//      installFakeSupabase(db);
//
//    Couvre le sous-ensemble du client que le code serveur utilise : select, insert, update, upsert
//    (onConflict, ignoreDuplicates), delete ; filtres eq, neq, is, not(…, "is", …), in, ilike, lt, lte, gt,
//    gte, contains ; order, limit, range (sans effet) ; or() (ignoré : filtre de présélection) ; single,
//    maybeSingle ; rpc. Chaque lecture et chaque écriture est notée (db.reads, db.writes), chaque rpc aussi
//    (db.rpcs), chaque motif ILIKE reçu (db.ilikes). Aides : db.tables.<t>, db.row(t, id), db.writesTo(t).
//      rpc(name, args)  → { data, error } : réponse des fonctions (défaut : { data: true }) ;
//      fail(query)      → message (texte) ou erreur complète ({ code, message }, ex. 23505) ou null :
//                         simule une colonne absente, un doublon, une panne… (query.table, query.op).
//    Ce qu'elle ne fait pas : jointures imbriquées (select "*, lead:leads(*)"), count exact, RLS, contraintes.
//
// 2. createScriptedSupabase — base SCRIPTÉE, sans état : chaque table renvoie une réponse fixée d'avance,
//    et chaque appel est noté. Pour une fonction qui reçoit le client en paramètre (fn(supabase, …)) ou
//    quand il faut une forme que la base en mémoire ne sait pas produire (jointure, erreur ciblée).
//      results[table]       = réponse de maybeSingle()/single() pour cette table (défaut : aucune ligne) ;
//      results["table[]"]   = réponse d'une lecture de liste (await sans maybeSingle ; défaut : liste vide).
//      calls = [{ table, ops: [["select", "*"], ["eq", "id", 1], …] }]

let current = null;
export const installFakeSupabase = (db) => {
    current = db;
};
export const getSupabaseAdmin = () => {
    if (!current) throw new Error("base de test absente : appeler installFakeSupabase(createFakeSupabase(…))");
    return current;
};

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Motif LIKE (\ échappe, % et _ jokers) → expression régulière, casse ignorée (ILIKE).
const likeRegex = (pattern) => {
    let re = "";
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "\\" && i + 1 < pattern.length) re += reEscape(pattern[++i]);
        else if (c === "%") re += ".*";
        else if (c === "_") re += ".";
        else re += reEscape(c);
    }
    return new RegExp(`^${re}$`, "is");
};

const project = (row, cols) => {
    if (!cols || String(cols).trim() === "*") return { ...row };
    const names = String(cols).split(",").map((c) => c.trim()).filter(Boolean);
    return Object.fromEntries(names.map((c) => [c, row[c] ?? null]));
};

export const createFakeSupabase = (tables = {}, { rpc = () => ({ data: true, error: null }), fail = () => null } = {}) => {
    const db = { tables: {}, reads: [], writes: [], rpcs: [], ilikes: [] };
    for (const [t, rows] of Object.entries(tables)) db.tables[t] = rows.map((r) => ({ ...r }));
    const rowsOf = (t) => (db.tables[t] ||= []);

    class Query {
        constructor(table) {
            Object.assign(this, { table, op: "select", cols: "*", filters: [], mode: "many", returning: false });
        }
        select(cols = "*") {
            if (this.op === "select") this.cols = cols;
            else Object.assign(this, { returning: true, cols });
            return this;
        }
        insert(rows) {
            return Object.assign(this, { op: "insert", rows: [].concat(rows) });
        }
        upsert(rows, opts = {}) {
            return Object.assign(this, { op: "upsert", rows: [].concat(rows), opts });
        }
        update(patch) {
            return Object.assign(this, { op: "update", patch });
        }
        delete() {
            return Object.assign(this, { op: "delete" });
        }
        where(fn) {
            this.filters.push(fn);
            return this;
        }
        eq(c, v) {
            return this.where((r) => r[c] === v);
        }
        neq(c, v) {
            return this.where((r) => r[c] !== v);
        }
        is(c, v) {
            return this.where((r) => (r[c] ?? null) === v);
        }
        not(c, op, v) {
            if (op !== "is") throw new Error(`fake-supabase : not(${op}) non pris en charge`);
            return this.where((r) => (r[c] ?? null) !== v);
        }
        // or(PostgREST) : non interprété (filtre de présélection) ; la classification se fait en JS.
        or() {
            return this;
        }
        in(c, vs) {
            return this.where((r) => vs.includes(r[c]));
        }
        ilike(c, p) {
            db.ilikes.push(p);
            const re = likeRegex(String(p));
            return this.where((r) => r[c] != null && re.test(String(r[c])));
        }
        lt(c, v) {
            return this.where((r) => r[c] != null && r[c] < v);
        }
        lte(c, v) {
            return this.where((r) => r[c] != null && r[c] <= v);
        }
        gt(c, v) {
            return this.where((r) => r[c] != null && r[c] > v);
        }
        gte(c, v) {
            return this.where((r) => r[c] != null && r[c] >= v);
        }
        contains(c, vs) {
            return this.where((r) => Array.isArray(r[c]) && vs.every((v) => r[c].includes(v)));
        }
        order() {
            return this;
        }
        limit() {
            return this;
        }
        range() {
            return this;
        }
        maybeSingle() {
            this.mode = "maybe";
            return this;
        }
        single() {
            this.mode = "single";
            return this;
        }
        then(ok, ko) {
            return Promise.resolve()
                .then(() => this.run())
                .then(ok, ko);
        }
        shape(rows) {
            const out = rows.map((r) => project(r, this.cols));
            if (this.mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: `${out.length} ligne(s) au lieu d'une` } };
            if (this.mode === "maybe") return out.length > 1 ? { data: null, error: { message: "plusieurs lignes" } } : { data: out[0] ?? null, error: null };
            return { data: out, error: null };
        }
        run() {
            const failure = fail(this);
            // Message (texte) ou erreur complète ({ code, message }, ex. 23505 de PostgreSQL).
            if (failure) return { data: null, error: typeof failure === "object" ? failure : { message: failure } };
            const rows = rowsOf(this.table);
            const match = (r) => this.filters.every((f) => f(r));
            if (this.op === "select") {
                db.reads.push({ table: this.table, cols: this.cols });
                return this.shape(rows.filter(match));
            }
            if (this.op === "insert" || this.op === "upsert") {
                const keys = this.op === "upsert" ? String(this.opts.onConflict || "id").split(",").map((k) => k.trim()) : null;
                const added = [];
                for (const row of this.rows) {
                    const existing = keys && rows.find((r) => keys.every((k) => r[k] === row[k]));
                    if (existing) {
                        if (!this.opts.ignoreDuplicates) Object.assign(existing, row);
                        continue;
                    }
                    const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
                    rows.push(full);
                    added.push(full);
                }
                db.writes.push({ op: this.op, table: this.table, rows: added.map((r) => ({ ...r })) });
                return this.returning ? this.shape(added) : { data: null, error: null };
            }
            if (this.op === "update") {
                const hit = rows.filter(match);
                for (const r of hit) Object.assign(r, this.patch);
                db.writes.push({ op: "update", table: this.table, patch: { ...this.patch }, ids: hit.map((r) => r.id) });
                return this.returning ? this.shape(hit) : { data: null, error: null };
            }
            if (this.op === "delete") {
                const hit = rows.filter(match);
                db.tables[this.table] = rows.filter((r) => !hit.includes(r));
                db.writes.push({ op: "delete", table: this.table, ids: hit.map((r) => r.id) });
                // .delete().select() renvoie les lignes retirées, comme Supabase.
                return { data: this.returning ? hit.map((r) => project(r, this.cols)) : null, error: null };
            }
            throw new Error(`fake-supabase : opération ${this.op} inconnue`);
        }
    }

    db.from = (table) => new Query(table);
    db.rpc = async (name, args) => {
        db.rpcs.push({ name, args });
        return rpc(name, args);
    };
    db.row = (table, id) => rowsOf(table).find((r) => r.id === id);
    db.writesTo = (table) => db.writes.filter((w) => w.table === table);
    return db;
};

// Base scriptée (voir en tête). Les opérations d'écriture renvoient la réponse de liste de la table.
export const WRITE_OPS = Object.freeze(["upsert", "update", "insert", "delete"]);
export const createScriptedSupabase = (results = {}) => {
    const calls = [];
    const from = (table) => {
        const ops = [];
        calls.push({ table, ops });
        const q = {};
        for (const op of ["select", "eq", "neq", "is", "not", "in", "ilike", "lt", "lte", "gt", "gte", "contains", "or", "order", "limit", "range", "upsert", "update", "insert", "delete"]) {
            q[op] = (...args) => (ops.push([op, ...args]), q);
        }
        q.maybeSingle = async () => results[table] ?? { data: null, error: null };
        q.single = async () => results[table] ?? { data: null, error: { message: "0 ligne(s) au lieu d'une" } };
        q.then = (resolve, reject) => Promise.resolve(results[`${table}[]`] ?? { data: [], error: null }).then(resolve, reject);
        return q;
    };
    // Écritures notées : calls.filter((c) => c.ops.some(([op]) => WRITE_OPS.includes(op))).
    return { from, calls, rpc: async (name, args) => (calls.push({ rpc: name, args }), results[`rpc:${name}`] ?? { data: null, error: null }) };
};
