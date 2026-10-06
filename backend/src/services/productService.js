const db = require("../config/db");

/*
    Products and their BOM (bill of materials).

    - Add a product by hand or in bulk (from a spreadsheet the browser has already read into rows).
    - Replace a product's BOM from the editor, or import it from a spreadsheet (replace or merge).
    - A BOM line points at a component; "quantity_required" is the amount needed for ONE unit of the
      product and may be NULL (not specified yet). "location" is the position on the PCB.
    - Components that do not exist yet can be created while saving a BOM. They get the next free
      CMP-#### SKU and an inventory row of 0 (no ledger entry, so stock stays in sync).

    The planning/validation functions are pure (no database) so they can be tested on their own.
*/

class HttpError extends Error {
    constructor(status, message, code, extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;
const QTY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const DEFAULT_MIN_STOCK = 50; // same minimum stock level the loaded components have
const MAX_BOM_LINES = 1000;
const MAX_PRODUCT_ROWS = 500;

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const orNull = (v) => (v === "" ? null : v);

/* "4K7" + "1206(1%)" -> same key however it is typed (case, spaces). */
const normKey = (name, size) => `${clean(name).toLowerCase()}|${clean(size).toLowerCase()}`;

/* Quantity: "" / null -> { value: null } (not specified); otherwise a number > 0 with up to 2 decimals. */
function parseQty(raw) {
    if (raw === null || raw === undefined) return { value: null };
    const s = String(raw).trim().replace(/,/g, "");
    if (s === "") return { value: null };
    if (!QTY_RE.test(s)) return { error: "Quantity must be a number with up to 2 decimals" };
    if (Number(s) <= 0) return { error: "Quantity must be greater than zero" };
    return { value: String(Number(s)) };
}

/* Validates the text fields shared by manual lines and imported rows. Returns an error string or "". */
function checkLineText({ name, size, category, location }) {
    if (!name) return "Part name is required";
    if (name.length > 150) return "Part name is longer than 150 characters";
    if (size && size.length > 100) return "Size is longer than 100 characters";
    if (category && category.length > 100) return "Category is longer than 100 characters";
    if (location && location.length > 255) return "Location is longer than 255 characters";
    return "";
}

/* ---------------------------------------------------------------- BOM import planning (pure) */

/*
    rows:       [{ line, name, size, category, quantity, location }]  from the spreadsheet
    components: [{ id, sku, name, size }]                             all components
    existing:   [{ component_id, quantity_required, location }]      the product's current BOM
    returns:    { rows: [...with status], lines: [...final BOM lines], summary }

    status: matched | new | missing (not found and createMissing is off) | invalid
    A BOM line is { component_id } or { newKey, name, size, category }, plus quantity_required and location.
*/
function planBomImport({ rows, components, existing, mode, createMissing }) {
    const byKey = new Map();
    for (const c of [...components].sort((a, b) => a.id - b.id)) {
        const k = normKey(c.name, c.size);
        if (!byKey.has(k)) byKey.set(k, c);
    }
    const seen = new Map(); // key -> first line number (duplicates inside the file)
    const out = [];
    const incoming = []; // lines that will be saved, in file order

    for (const r of rows) {
        const row = {
            line: r.line,
            name: clean(r.name),
            size: clean(r.size),
            category: clean(r.category),
            quantity: r.quantity === null || r.quantity === undefined ? "" : String(r.quantity).trim(),
            location: clean(r.location),
            status: "invalid",
            component: null,
            message: "",
        };
        out.push(row);

        const textError = checkLineText(row);
        const q = parseQty(row.quantity);
        if (textError || q.error) {
            row.message = textError || q.error;
            continue;
        }
        const key = normKey(row.name, row.size);
        if (seen.has(key)) {
            row.message = `Same part and size as line ${seen.get(key)}`;
            continue;
        }
        seen.set(key, row.line);

        const found = byKey.get(key);
        if (found) {
            row.status = "matched";
            row.component = { id: found.id, sku: found.sku, name: found.name, size: found.size };
            incoming.push({ component_id: found.id, quantity_required: q.value, location: orNull(row.location) });
        } else if (createMissing) {
            row.status = "new";
            row.message = "Will be created as a new component";
            incoming.push({ newKey: key, name: row.name, size: orNull(row.size), category: orNull(row.category), quantity_required: q.value, location: orNull(row.location) });
        } else {
            row.status = "missing";
            row.message = "No component with this name and size. Tick \"Create missing components\" or add it in Inventory first.";
        }
    }

    // Final BOM
    let lines;
    if (mode === "merge") {
        const incomingById = new Map(incoming.filter((l) => l.component_id).map((l) => [l.component_id, l]));
        lines = existing.map((e) => {
            const inc = incomingById.get(e.component_id);
            if (!inc) return { component_id: e.component_id, quantity_required: e.quantity_required, location: e.location };
            incomingById.delete(e.component_id);
            return {
                component_id: e.component_id,
                quantity_required: inc.quantity_required ?? e.quantity_required, // a blank cell keeps the current value
                location: inc.location ?? e.location,
            };
        });
        const existingIds = new Set(existing.map((e) => e.component_id));
        for (const l of incoming) if (l.newKey || !existingIds.has(l.component_id)) lines.push(l);
    } else {
        lines = incoming;
    }

    const count = (s) => out.filter((r) => r.status === s).length;
    const existingIds = new Set(existing.map((e) => e.component_id));
    return {
        rows: out,
        lines,
        summary: {
            matched: count("matched"),
            new: count("new"),
            missing: count("missing"),
            invalid: count("invalid"),
            existingLines: existing.length,
            updated: out.filter((r) => r.status === "matched" && existingIds.has(r.component.id)).length,
        },
    };
}

/* ---------------------------------------------------------------- database helpers */

const BOM_SELECT = `
    SELECT
        c.id AS component_id,
        c.sku AS component_sku,
        c.name AS component_name,
        c.category,
        c.size,
        c.unit,
        pb.quantity_required,
        pb.location,
        COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand
    FROM product_bom pb
    JOIN components c ON pb.component_id = c.id
    LEFT JOIN inventory i ON i.component_id = c.id
    WHERE pb.product_id = ?
    ORDER BY pb.id
`;

async function getBom(conn, productId) {
    const [rows] = await conn.query(BOM_SELECT, [productId]);
    return rows;
}

async function inTransaction(fn) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (error) {
        try { await conn.rollback(); } catch (_) { /* connection already gone */ }
        throw error;
    } finally {
        conn.release();
    }
}

async function lockProduct(conn, productId) {
    const [rows] = await conn.query("SELECT id FROM products WHERE id = ? FOR UPDATE", [productId]);
    if (rows.length === 0) throw new HttpError(404, "Product not found", "NOT_FOUND");
}

async function loadComponents(conn) {
    const [rows] = await conn.query("SELECT id, sku, name, size FROM components ORDER BY id");
    return rows;
}

async function nextComponentSkuNumber(conn) {
    const [[row]] = await conn.query(
        "SELECT MAX(CAST(SUBSTRING(sku, 5) AS UNSIGNED)) AS n FROM components WHERE sku REGEXP '^CMP-[0-9]+$'"
    );
    return Number(row.n || 0) + 1;
}

/* Creates the components for lines that carry { newKey, name, size, category }. Returns Map(newKey -> id). */
async function createComponents(conn, lines) {
    const made = new Map();
    let n = null;
    for (const l of lines) {
        if (!l.newKey || made.has(l.newKey)) continue;
        if (n === null) n = await nextComponentSkuNumber(conn);
        const sku = `CMP-${String(n++).padStart(4, "0")}`;
        try {
            const [r] = await conn.query(
                `INSERT INTO components (sku, name, description, unit, minimum_stock_level, category, size)
                 VALUES (?, ?, NULL, 'pcs', ?, ?, ?)`,
                [sku, l.name, DEFAULT_MIN_STOCK, l.category ?? null, l.size ?? null]
            );
            await conn.query(
                "INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved) VALUES (?, 0, 0)",
                [r.insertId]
            );
            made.set(l.newKey, { id: r.insertId, sku });
        } catch (error) {
            if (error.errno === 1062) {
                throw new HttpError(409, "Someone else added components at the same moment. Please try again.", "CONFLICT");
            }
            throw error;
        }
    }
    return made;
}

/* Replaces the product's BOM with `lines` (all of them already resolved or carrying newKey). */
async function replaceBom(conn, productId, lines) {
    const made = await createComponents(conn, lines);
    const resolved = lines.map((l) => ({
        component_id: l.newKey ? made.get(l.newKey).id : l.component_id,
        quantity_required: l.quantity_required ?? null,
        location: l.location ?? null,
    }));
    const ids = new Set();
    for (const l of resolved) {
        if (ids.has(l.component_id)) throw new HttpError(422, "The same component appears twice in this BOM", "VALIDATION");
        ids.add(l.component_id);
    }
    await conn.query("DELETE FROM product_bom WHERE product_id = ?", [productId]);
    if (resolved.length) {
        await conn.query(
            "INSERT INTO product_bom (product_id, component_id, quantity_required, location) VALUES ?",
            [resolved.map((l) => [productId, l.component_id, l.quantity_required, l.location])]
        );
    }
    return { createdComponents: made.size };
}

/* ---------------------------------------------------------------- products */

async function nextProductSku(conn = db) {
    const [[row]] = await conn.query(
        "SELECT MAX(CAST(SUBSTRING(sku, 5) AS UNSIGNED)) AS n FROM products WHERE sku REGEXP '^PRD-[0-9]+$'"
    );
    return `PRD-${String(Number(row.n || 0) + 1).padStart(3, "0")}`;
}

function checkProduct(input) {
    const sku = clean(input.sku).toUpperCase().replace(/\s+/g, "");
    const name = clean(input.name);
    const description = String(input.description ?? "").trim();
    if (!name) return { error: "Product name is required", field: "name" };
    if (name.length > 150) return { error: "Product name can be at most 150 characters", field: "name" };
    if (sku && !SKU_RE.test(sku)) return { error: "SKU can use letters, numbers, . _ - (2 to 50 characters)", field: "sku" };
    if (description.length > 2000) return { error: "Description can be at most 2000 characters", field: "description" };
    return { sku, name, description: description || null };
}

async function createProduct(input) {
    const p = checkProduct(input || {});
    if (p.error) throw new HttpError(422, p.error, "VALIDATION", { field: p.field });
    return inTransaction(async (conn) => {
        const sku = p.sku || (await nextProductSku(conn));
        try {
            const [r] = await conn.query("INSERT INTO products (sku, name, description) VALUES (?, ?, ?)", [sku, p.name, p.description]);
            const [[row]] = await conn.query("SELECT * FROM products WHERE id = ?", [r.insertId]);
            return row;
        } catch (error) {
            if (error.errno === 1062) throw new HttpError(409, `SKU ${sku} is already used by another product`, "DUPLICATE_SKU", { field: "sku" });
            throw error;
        }
    });
}

/*
    Bulk add. rows: [{ line, sku, name, description }]. Rows with a problem or an SKU that already
    exists are reported and skipped; the rest are created. dryRun only reports.
*/
async function importProducts({ rows, dryRun }) {
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(422, "No product rows to import", "VALIDATION");
    if (rows.length > MAX_PRODUCT_ROWS) throw new HttpError(422, `At most ${MAX_PRODUCT_ROWS} products can be imported at once`, "VALIDATION");

    const run = async (conn) => {
        const [existing] = await conn.query("SELECT sku FROM products");
        const taken = new Set(existing.map((r) => r.sku.toUpperCase()));
        let next = null;
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || {};
            const p = checkProduct(r);
            const row = { line: r.line ?? i + 1, sku: p.sku ?? clean(r.sku).toUpperCase(), name: clean(r.name), description: String(r.description ?? "").trim(), status: "new", message: "" };
            out.push(row);
            if (p.error) { row.status = "invalid"; row.message = p.error; continue; }
            if (!p.sku) {
                if (next === null) next = Number((await nextProductSku(conn)).slice(4));
                let sku;
                do { sku = `PRD-${String(next++).padStart(3, "0")}`; } while (taken.has(sku));
                row.sku = sku;
                row.message = "SKU generated";
            }
            if (taken.has(row.sku)) { row.status = "exists"; row.message = "A product with this SKU already exists. It will be skipped."; continue; }
            taken.add(row.sku);
            if (!dryRun) {
                await conn.query("INSERT INTO products (sku, name, description) VALUES (?, ?, ?)", [row.sku, p.name, p.description]);
            }
        }
        const count = (s) => out.filter((r) => r.status === s).length;
        return { rows: out, summary: { new: count("new"), exists: count("exists"), invalid: count("invalid") }, dryRun: !!dryRun };
    };

    if (dryRun) return run(db);
    try {
        return await inTransaction(run);
    } catch (error) {
        if (error.errno === 1062) throw new HttpError(409, "Another product with one of these SKUs was added just now. Please try again.", "CONFLICT");
        throw error;
    }
}

/* ---------------------------------------------------------------- BOM: manual save */

/*
    lines: [{ component_id } | { newComponent: { name, size, category } }, quantity_required, location]
    Replaces the whole BOM. A "newComponent" that matches an existing name + size reuses that component.
*/
async function saveBom(productId, input) {
    const lines = input && input.lines;
    if (!Array.isArray(lines)) throw new HttpError(422, "BOM lines are missing", "VALIDATION");
    if (lines.length > MAX_BOM_LINES) throw new HttpError(422, `A BOM can have at most ${MAX_BOM_LINES} lines`, "VALIDATION");

    return inTransaction(async (conn) => {
        await lockProduct(conn, productId);
        const components = await loadComponents(conn);
        const byId = new Map(components.map((c) => [c.id, c]));
        const byKey = new Map();
        for (const c of components) { const k = normKey(c.name, c.size); if (!byKey.has(k)) byKey.set(k, c); }

        const seen = new Map();
        const final = [];
        lines.forEach((raw, i) => {
            const fail = (message, field) => { throw new HttpError(422, `Line ${i + 1}: ${message}`, "VALIDATION", { line: i, field }); };
            const q = parseQty(raw && raw.quantity_required);
            if (q.error) fail(q.error, "quantity_required");
            const location = clean(raw && raw.location);
            if (location.length > 255) fail("Location is longer than 255 characters", "location");

            let line;
            if (raw && raw.component_id !== undefined && raw.component_id !== null) {
                const c = byId.get(Number(raw.component_id));
                if (!c) fail("Component not found", "component");
                line = { component_id: c.id };
            } else if (raw && raw.newComponent) {
                const nc = { name: clean(raw.newComponent.name), size: clean(raw.newComponent.size), category: clean(raw.newComponent.category) };
                const err = checkLineText({ ...nc, location: "" });
                if (err) fail(err, "component");
                const hit = byKey.get(normKey(nc.name, nc.size));
                line = hit ? { component_id: hit.id } : { newKey: normKey(nc.name, nc.size), name: nc.name, size: orNull(nc.size), category: orNull(nc.category) };
            } else {
                fail("Choose a component", "component");
            }
            const ident = line.newKey || `id:${line.component_id}`;
            if (seen.has(ident)) fail(`This component is already on line ${seen.get(ident) + 1}`, "component");
            seen.set(ident, i);
            final.push({ ...line, quantity_required: q.value, location: orNull(location) });
        });

        const { createdComponents } = await replaceBom(conn, productId, final);
        return { bom: await getBom(conn, productId), createdComponents };
    });
}

/* ---------------------------------------------------------------- BOM: spreadsheet import */

async function importBom(productId, input) {
    const { rows, dryRun } = input || {};
    const mode = input && input.mode === "merge" ? "merge" : "replace";
    const createMissing = !!(input && input.createMissing);
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(422, "No BOM rows to import", "VALIDATION");
    if (rows.length > MAX_BOM_LINES) throw new HttpError(422, `A BOM can have at most ${MAX_BOM_LINES} lines`, "VALIDATION");

    const plan = async (conn) => {
        const [existing] = await conn.query(
            "SELECT component_id, quantity_required, location FROM product_bom WHERE product_id = ? ORDER BY id",
            [productId]
        );
        const components = await loadComponents(conn);
        return planBomImport({
            rows,
            components,
            existing: existing.map((e) => ({ ...e, quantity_required: e.quantity_required === null ? null : String(Number(e.quantity_required)) })),
            mode,
            createMissing,
        });
    };

    if (dryRun) {
        const [p] = await db.query("SELECT id FROM products WHERE id = ?", [productId]);
        if (p.length === 0) throw new HttpError(404, "Product not found", "NOT_FOUND");
        const { rows: planned, summary } = await plan(db);
        return { rows: planned, summary, mode, dryRun: true };
    }

    return inTransaction(async (conn) => {
        await lockProduct(conn, productId);
        const { rows: planned, lines, summary } = await plan(conn);
        if (summary.invalid > 0) throw new HttpError(422, "Fix the rows marked invalid first", "VALIDATION", { summary });
        if (summary.missing > 0) throw new HttpError(422, "Some parts do not exist yet. Allow creating missing components or remove those rows.", "VALIDATION", { summary });
        if (lines.length === 0) throw new HttpError(422, "Nothing to import", "VALIDATION");
        const { createdComponents } = await replaceBom(conn, productId, lines);
        return { rows: planned, summary, mode, dryRun: false, createdComponents, bom: await getBom(conn, productId) };
    });
}

module.exports = {
    HttpError,
    // pure, for tests
    normKey, parseQty, checkLineText, planBomImport, checkProduct,
    // database
    getBom, nextProductSku, createProduct, importProducts, saveBom, importBom,
};
