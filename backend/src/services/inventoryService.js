const crypto = require("crypto");
const db = require("../config/db");

/*
    Single place where stock changes.

    Invariants enforced here (not in the UI):
      1. inventory.quantity_on_hand changes ONLY together with one inventory_transactions row,
         inside the same DB transaction.
      2. The inventory row is locked (SELECT ... FOR UPDATE) before it is read or changed, so two
         concurrent requests (or a request and a production run) are serialised per component.
      3. Stock can never go below zero or below what is reserved for production.
      4. Every request carries an idempotency key; a retry/double submit posts exactly once.
      5. Ledger rows are never updated or deleted (also blocked by DB triggers, migration 006).

    All quantities are handled as integer "hundredths" (DECIMAL(12,2)) so there is no float drift.
*/

class HttpError extends Error {
    constructor(status, message, code, extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

const DB_MAX_CENTS = 999999999999; // DECIMAL(12,2) upper bound: 9,999,999,999.99
const QTY_RE = /^\d{1,10}(\.\d{1,2})?$/;

const toCents = (v) => {
    const [i, f = ""] = String(v).trim().split(".");
    return Number(i) * 100 + Number((f + "00").slice(0, 2));
};

const fromCents = (c) =>
    `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

const show = (c) => Number(fromCents(c)).toLocaleString("en-US", { maximumFractionDigits: 2 });

function parseQty(raw, field, { allowZero = false } = {}) {
    if (raw === undefined || raw === null || raw === "") {
        throw new HttpError(422, `${field} is required`, "VALIDATION");
    }
    if (typeof raw !== "string" && typeof raw !== "number") {
        throw new HttpError(422, `${field} must be a number`, "VALIDATION");
    }
    const text = String(raw).trim();
    if (!QTY_RE.test(text)) {
        throw new HttpError(
            422,
            `${field} must be a positive number with at most 2 decimal places`,
            "VALIDATION"
        );
    }
    const cents = toCents(text);
    if (cents > DB_MAX_CENTS) {
        throw new HttpError(422, `${field} is too large`, "VALIDATION");
    }
    if (!allowZero && cents <= 0) {
        throw new HttpError(422, `${field} must be greater than zero`, "VALIDATION");
    }
    return cents;
}

/* Structured stock-out reasons (the Inventory History balance sheet groups a shortfall by these). */
const STOCK_OUT_REASON_CODES = [
    "ISSUED_TO_PRODUCTION",
    "PRODUCTION_WASTAGE",
    "DAMAGED",
    "REPLACEMENT",
    "QUALITY_CONTROL",
    "TESTING",
    "RND",
    "REWORK",
    "CUSTOMER_SAMPLE",
    "WARRANTY",
    "LOST",
    "WRONG_ISSUE",
    "RETURNED_TO_SUPPLIER",
    "SAMPLE_TESTING", // old code (kept so rows saved earlier stay valid); the UI now offers TESTING / CUSTOMER_SAMPLE
    "OTHER",
];
// An order must be selected for these: the pieces were used for / taken because of that order.
const ORDER_REQUIRED = new Set([
    "PRODUCTION_WASTAGE",
    "DAMAGED",
    "REPLACEMENT",
    "QUALITY_CONTROL",
    "TESTING",
    "RND",
    "REWORK",
]);

function parseReasonCode(raw) {
    if (raw === undefined || raw === null || raw === "") return null;
    const code = String(raw).trim().toUpperCase();
    if (!STOCK_OUT_REASON_CODES.includes(code)) {
        throw new HttpError(422, "Unknown stock-out reason", "VALIDATION");
    }
    return code;
}

function parseOrderId(raw) {
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(422, "Order is not valid", "VALIDATION");
    return n;
}

function parseReason(raw, { required = true, min = 3 } = {}) {
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!text) {
        if (required) throw new HttpError(422, "A reason is required", "VALIDATION");
        return null;
    }
    if (text.length < min) {
        throw new HttpError(422, `Reason must be at least ${min} characters`, "VALIDATION");
    }
    if (text.length > 255) {
        throw new HttpError(422, "Reason must be 255 characters or fewer", "VALIDATION");
    }
    return text;
}

/* Optional short free-text attribute (category / size). undefined = not supplied -> leave unchanged. */
function parseAttr(raw, field, label) {
    if (raw === undefined || raw === null) return undefined;
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!text) return undefined;
    if (text.length > 100) throw new HttpError(422, `${label} must be 100 characters or fewer`, "VALIDATION", { field });
    return text;
}

function parseLocation(raw) {
    if (raw === undefined || raw === null) return undefined;
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!text) return undefined;
    if (text.length > 100) throw new HttpError(422, "Location must be 100 characters or fewer", "VALIDATION", { field: "location" });
    return text;
}

function parseRef(raw) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return null;
    if (text.length > 60) {
        throw new HttpError(422, "Reference must be 60 characters or fewer", "VALIDATION");
    }
    return text;
}

function parseKey(raw) {
    if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(raw.trim())) {
        throw new HttpError(
            400,
            "Missing or invalid idempotency_key (8-64 letters, digits, - or _)",
            "IDEMPOTENCY_KEY_REQUIRED"
        );
    }
    return raw.trim();
}

function parseId(raw, name = "id") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new HttpError(400, `Invalid ${name}`, "VALIDATION");
    }
    return n;
}

/* Runs fn inside a transaction; retries on deadlock / lock-wait timeout. */
async function inTransaction(fn) {
    for (let attempt = 1; ; attempt++) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const result = await fn(conn);
            await conn.commit();
            return result;
        } catch (error) {
            try {
                await conn.rollback();
            } catch (_) {
                /* connection already gone */
            }
            if ((error.errno === 1213 || error.errno === 1205) && attempt < 3) continue;
            throw error;
        } finally {
            conn.release();
        }
    }
}

const SIGNED = `CASE t.direction WHEN 'IN' THEN t.quantity WHEN 'OUT' THEN -t.quantity ELSE 0 END`;

const ITEM_SELECT = `
    SELECT
        i.id,
        i.component_id,
        c.sku,
        c.name AS component_name,
        c.unit,
        c.category,
        c.size,
        i.quantity_on_hand,
        i.quantity_reserved,
        i.location,
        (i.quantity_on_hand - i.quantity_reserved) AS available,
        c.minimum_stock_level,
        i.is_active,
        i.archived_at,
        DATE_FORMAT(lt.last_movement_at, '%Y-%m-%d %H:%i:%s') AS last_movement_at,
        COALESCE(lt.ledger_balance, 0) AS ledger_balance,
        (i.quantity_on_hand = COALESCE(lt.ledger_balance, 0)) AS in_sync
    FROM inventory i
    JOIN components c ON c.id = i.component_id
    LEFT JOIN (
        SELECT t.component_id,
               MAX(t.created_at) AS last_movement_at,
               SUM(${SIGNED}) AS ledger_balance
        FROM inventory_transactions t
        GROUP BY t.component_id
    ) lt ON lt.component_id = i.component_id
`;

async function fetchItem(conn, inventoryId) {
    const [rows] = await conn.query(`${ITEM_SELECT} WHERE i.id = ?`, [inventoryId]);
    return rows[0] || null;
}

const LEDGER_SELECT = `
    SELECT
        t.id,
        t.component_id,
        c.sku,
        c.name AS component_name,
        c.unit,
        t.transaction_type,
        t.direction,
        t.quantity,
        t.balance_after,
        t.reason,
        t.reference_no,
        t.reference_type,
        t.reference_id,
        t.created_by,
        COALESCE(u.name, 'System') AS user_name,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM inventory_transactions t
    JOIN components c ON c.id = t.component_id
    LEFT JOIN users u ON u.id = t.created_by
`;

/* ------------------------------------------------------------------ reads */

async function listInventory({ status = "active" } = {}) {
    const where =
        status === "archived" ? "WHERE i.is_active = 0" : status === "all" ? "" : "WHERE i.is_active = 1";
    const [rows] = await db.query(`${ITEM_SELECT} ${where} ORDER BY i.id`);
    return rows;
}

async function getItem(inventoryId) {
    const id = parseId(inventoryId);
    const item = await fetchItem(db, id);
    if (!item) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");

    const [recent] = await db.query(
        `${LEDGER_SELECT} WHERE t.component_id = ? AND t.transaction_type <> 'OPENING_BALANCE' ORDER BY t.created_at DESC, t.id DESC LIMIT 15`,
        [item.component_id]
    );
    return { ...item, recent_movements: recent };
}

/* Type-ahead lookup for the component picker: every word must match the SKU or the name,
   best matches first, and only a handful of rows are returned (never the whole catalogue). */
async function listComponentOptions({ q = "", limit = 8 } = {}) {
    const take = Math.min(50, Math.max(1, Number(limit) || 8));
    const tokens = String(q || "").trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 5);

    const where = [];
    const params = [];
    for (const t of tokens) {
        const like = `%${escapeLike(t)}%`;
        where.push("(c.sku LIKE ? OR c.name LIKE ?)");
        params.push(like, like);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const first = tokens[0] || "";
    const prefix = `${escapeLike(first)}%`;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM components c ${clause}`, params);
    const [rows] = await db.query(
        `
        SELECT c.id, c.sku, c.name, c.unit, c.category, c.size, c.minimum_stock_level,
               i.id AS inventory_id,
               i.is_active,
               i.location,
               COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand
        FROM components c
        LEFT JOIN inventory i ON i.component_id = c.id
        ${clause}
        ORDER BY (c.sku = ?) DESC, (c.sku LIKE ? OR c.name LIKE ?) DESC, c.name
        LIMIT ?
        `,
        [...params, first, prefix, prefix, take]
    );
    return { rows, total: Number(total) };
}

/* Next free CMP-### code, offered as the default SKU when a new component is created. */
async function nextSku() {
    const [[row]] = await db.query(
        `SELECT MAX(CAST(SUBSTRING(sku, 5) AS UNSIGNED)) AS n FROM components WHERE sku REGEXP '^CMP-[0-9]+$'`
    );
    return `CMP-${String(Number(row.n || 0) + 1).padStart(3, "0")}`;
}

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

async function getLedger(query = {}) {
    // Opening-balance rows are still written for the books but are not shown in the ledger view.
    const where = ["t.transaction_type <> 'OPENING_BALANCE'"];
    const params = [];

    if (query.component_id) {
        where.push("t.component_id = ?");
        params.push(parseId(query.component_id, "component_id"));
    }
    if (query.direction) {
        if (!["IN", "OUT", "RESERVE", "RELEASE", "NONE"].includes(query.direction)) {
            throw new HttpError(400, "Invalid direction", "VALIDATION");
        }
        where.push("t.direction = ?");
        params.push(query.direction);
    }
    if (query.type) {
        if (!/^[A-Z_]{2,30}$/.test(query.type)) {
            throw new HttpError(400, "Invalid type", "VALIDATION");
        }
        where.push("t.transaction_type = ?");
        params.push(query.type);
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (query.from) {
        if (!dateRe.test(query.from)) throw new HttpError(400, "Invalid from date", "VALIDATION");
        where.push("t.created_at >= ?");
        params.push(query.from);
    }
    if (query.to) {
        if (!dateRe.test(query.to)) throw new HttpError(400, "Invalid to date", "VALIDATION");
        where.push("t.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
        params.push(query.to);
    }
    if (query.q && String(query.q).trim()) {
        const like = `%${escapeLike(String(query.q).trim().slice(0, 80))}%`;
        where.push(
            "(c.sku LIKE ? OR c.name LIKE ? OR t.reason LIKE ? OR t.reference_no LIKE ? OR u.name LIKE ?)"
        );
        params.push(like, like, like, like, like);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size) || 25));
    const page = Math.max(1, Number(query.page) || 1);

    const [[summary]] = await db.query(
        `
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN t.direction = 'IN'  THEN t.quantity END), 0) AS total_in,
               COALESCE(SUM(CASE WHEN t.direction = 'OUT' THEN t.quantity END), 0) AS total_out
        FROM inventory_transactions t
        JOIN components c ON c.id = t.component_id
        LEFT JOIN users u ON u.id = t.created_by
        ${clause}
        `,
        params
    );

    const [rows] = await db.query(
        `${LEDGER_SELECT} ${clause} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
    );

    return {
        rows,
        total: Number(summary.total),
        total_in: summary.total_in,
        total_out: summary.total_out,
        page,
        page_size: pageSize,
    };
}

/* ------------------------------------------------------------- idempotency */

async function findReplay(key, expected) {
    const [rows] = await db.query(
        `SELECT id, component_id, direction, quantity FROM inventory_transactions WHERE idempotency_key = ?`,
        [key]
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    const same =
        row.component_id === expected.componentId &&
        (!expected.direction || row.direction === expected.direction) &&
        (expected.cents === undefined || toCents(row.quantity) === expected.cents);

    if (!same) {
        throw new HttpError(
            409,
            "This request id was already used for a different stock movement. Refresh and try again.",
            "IDEMPOTENCY_CONFLICT"
        );
    }
    const [[inv]] = await db.query(`SELECT id FROM inventory WHERE component_id = ?`, [row.component_id]);
    const item = await fetchItem(db, inv.id);
    return { item, movement_id: row.id, replayed: true };
}

/* Runs the work; if a parallel duplicate won the race, return its result instead of failing. */
async function withReplayGuard(key, expected, work) {
    const existing = await findReplay(key, expected);
    if (existing) return existing;
    try {
        return await inTransaction(work);
    } catch (error) {
        if (error.errno === 1062 && /uq_inv_txn_idempotency/.test(error.message)) {
            const replay = await findReplay(key, expected);
            if (replay) return replay;
        }
        throw error;
    }
}

async function insertLedger(conn, m) {
    const [result] = await conn.query(
        `
        INSERT INTO inventory_transactions
            (component_id, transaction_type, direction, quantity, balance_after,
             reason, reason_code, reference_no, created_by, order_id, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            m.componentId,
            m.type,
            m.direction,
            fromCents(m.cents),
            fromCents(m.balanceAfterCents),
            m.reason,
            m.reasonCode || null,
            m.referenceNo || null,
            m.userId,
            m.orderId || null,
            m.key,
        ]
    );
    return result.insertId;
}

async function lockById(conn, inventoryId) {
    const [rows] = await conn.query(`SELECT * FROM inventory WHERE id = ? FOR UPDATE`, [inventoryId]);
    if (rows.length === 0) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
    return rows[0];
}

/* --------------------------------------------------------------- mutations */

/* ADD / IN -------------------------------------------------------------- */
async function stockIn(body, userId) {
    const componentId = parseId(body.component_id, "component_id");
    const cents = parseQty(body.quantity, "Quantity");
    const reason = parseReason(body.reason);
    const referenceNo = parseRef(body.reference_no);
    const location = parseLocation(body.location);
    const category = parseAttr(body.category, "category", "Category");
    const size = parseAttr(body.size, "size", "Size");
    const key = parseKey(body.idempotency_key);

    return withReplayGuard(key, { componentId, direction: "IN", cents }, async (conn) => {
        const [comp] = await conn.query(`SELECT id FROM components WHERE id = ?`, [componentId]);
        if (comp.length === 0) throw new HttpError(404, "Component not found", "NOT_FOUND");

        // First stock-in for a component creates its inventory row; concurrent creators collapse here.
        await conn.query(
            `INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved)
             VALUES (?, 0, 0)
             ON DUPLICATE KEY UPDATE component_id = component_id`,
            [componentId]
        );
        const [rows] = await conn.query(
            `SELECT * FROM inventory WHERE component_id = ? FOR UPDATE`,
            [componentId]
        );
        const inv = rows[0];

        const after = toCents(inv.quantity_on_hand) + cents;
        if (after > DB_MAX_CENTS) {
            throw new HttpError(422, "Resulting stock would exceed the maximum allowed", "VALIDATION");
        }

        await conn.query(
            `UPDATE inventory
                SET quantity_on_hand = ?, is_active = 1, archived_at = NULL
              WHERE id = ?`,
            [fromCents(after), inv.id]
        );
        if (location !== undefined) await conn.query(`UPDATE inventory SET location = ? WHERE id = ?`, [location, inv.id]);
        if (category !== undefined || size !== undefined) {
            await conn.query(`UPDATE components SET category = COALESCE(?, category), size = COALESCE(?, size) WHERE id = ?`,
                [category ?? null, size ?? null, componentId]);
        }
        const movementId = await insertLedger(conn, {
            componentId,
            type: "STOCK_IN",
            direction: "IN",
            cents,
            balanceAfterCents: after,
            reason,
            referenceNo,
            userId,
            key,
        });

        return { item: await fetchItem(conn, inv.id), movement_id: movementId, replayed: false };
    });
}

/* BATCH STOCK IN ("add to list" receipt) -----------------------------------
   One request = one DB transaction = all lines or none. A line is either an existing component
   (component_id) or a brand-new one (new_component) that is created inside the same transaction,
   so a failure can never leave a half-created component or a half-posted receipt behind. */
const MAX_BATCH = 50;
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;
const UNIT_RE = /^[A-Za-z][A-Za-z0-9 ./-]{0,19}$/;

const lineError = (line, field, message, status = 422, code = "VALIDATION") =>
    new HttpError(status, message, code, { line, field });

/* Tags any HttpError thrown by fn with the index of the line that caused it. */
const atLine = (line, fn) => {
    try {
        return fn();
    } catch (error) {
        if (error instanceof HttpError) error.extra = { line, ...(error.extra || {}) };
        throw error;
    }
};

const fieldErr = (field, message) => new HttpError(422, message, "VALIDATION", { field });

function parseNewComponent(raw) {
    const sku = String(raw.sku ?? "").trim().toUpperCase();
    if (!SKU_RE.test(sku)) {
        throw fieldErr("sku", "SKU must be 2-50 characters: letters, digits, dot, dash or underscore");
    }
    const name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 150) throw fieldErr("name", "Name must be 2-150 characters");

    const unit = String(raw.unit ?? "pcs").trim().toLowerCase();
    if (!UNIT_RE.test(unit)) throw fieldErr("unit", "Enter a valid unit, for example pcs, kg or m");

    let minCents = 0;
    const minRaw = raw.minimum_stock_level;
    if (minRaw !== undefined && minRaw !== null && minRaw !== "") {
        try {
            minCents = parseQty(minRaw, "Minimum stock level", { allowZero: true });
        } catch (error) {
            error.extra = { field: "minimum_stock_level" };
            throw error;
        }
    }
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    if (description.length > 500) throw fieldErr("description", "Description must be 500 characters or fewer");

    const category = parseAttr(raw.category, "category", "Category");
    const size = parseAttr(raw.size, "size", "Size");

    return { sku, name, unit, minCents, description: description || null, category: category ?? null, size: size ?? null };
}

function parseBatchItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new HttpError(422, "Add at least one item to the list", "VALIDATION");
    }
    if (rawItems.length > MAX_BATCH) {
        throw new HttpError(422, `One receipt can hold at most ${MAX_BATCH} items`, "VALIDATION");
    }

    const seenIds = new Set();
    const seenSkus = new Set();
    const seenNames = new Set();

    return rawItems.map((raw, i) =>
        atLine(i, () => {
            if (!raw || typeof raw !== "object") throw new HttpError(422, "Invalid line", "VALIDATION");

            const hasId = raw.component_id !== undefined && raw.component_id !== null && raw.component_id !== "";
            const hasNew = !!raw.new_component && typeof raw.new_component === "object";
            if (hasId === hasNew) {
                throw new HttpError(
                    422,
                    "Each line needs either an existing component or a new component",
                    "VALIDATION"
                );
            }

            let cents;
            try {
                cents = parseQty(raw.quantity, "Quantity");
            } catch (error) {
                error.extra = { field: "quantity" };
                throw error;
            }
            const item = { cents, reason: parseReason(raw.reason), referenceNo: parseRef(raw.reference_no), location: parseLocation(raw.location),
                category: parseAttr(raw.category, "category", "Category"), size: parseAttr(raw.size, "size", "Size") };

            if (hasId) {
                const id = parseId(raw.component_id, "component_id");
                if (seenIds.has(id)) {
                    throw new HttpError(422, "This component appears more than once in the list", "VALIDATION", {
                        field: "component",
                    });
                }
                seenIds.add(id);
                item.componentId = id;
            } else {
                const nc = parseNewComponent(raw.new_component);
                if (seenSkus.has(nc.sku)) throw fieldErr("sku", `SKU ${nc.sku} appears more than once in the list`);
                if (seenNames.has(nc.name.toLowerCase())) {
                    throw fieldErr("name", `"${nc.name}" appears more than once in the list`);
                }
                seenSkus.add(nc.sku);
                seenNames.add(nc.name.toLowerCase());
                item.newComponent = nc;
            }
            return item;
        })
    );
}

async function stockInBatch(body, userId) {
    const key = parseKey(body.idempotency_key);
    const items = parseBatchItems(body.items);
    // One stable key per line, derived from the request key, so the whole receipt replays as a unit.
    const keys = items.map((_, i) => crypto.createHash("sha1").update(`${key}:${i}`).digest("hex"));

    const replay = async () => {
        const [rows] = await db.query(
            `
            SELECT t.id, t.idempotency_key, t.component_id, t.quantity, t.balance_after, c.sku, c.name, c.unit
            FROM inventory_transactions t
            JOIN components c ON c.id = t.component_id
            WHERE t.idempotency_key IN (?)
            `,
            [keys]
        );
        if (rows.length === 0) return null;

        const byKey = new Map(rows.map((r) => [r.idempotency_key, r]));
        const same =
            rows.length === keys.length &&
            items.every((it, i) => {
                const r = byKey.get(keys[i]);
                return r && toCents(r.quantity) === it.cents && (it.componentId === undefined || r.component_id === it.componentId);
            });
        if (!same) {
            throw new HttpError(
                409,
                "This request id was already used for a different receipt. Refresh and try again.",
                "IDEMPOTENCY_CONFLICT"
            );
        }
        return {
            items: items.map((_, i) => {
                const r = byKey.get(keys[i]);
                return {
                    line: i,
                    component_id: r.component_id,
                    sku: r.sku,
                    name: r.name,
                    unit: r.unit,
                    quantity: r.quantity,
                    balance_after: r.balance_after,
                    movement_id: r.id,
                };
            }),
            count: items.length,
            replayed: true,
        };
    };

    const work = async (conn) => {
        const ids = new Array(items.length).fill(null);
        const created = new Array(items.length).fill(false);

        // 1) create the brand-new components
        for (let i = 0; i < items.length; i++) {
            const nc = items[i].newComponent;
            if (!nc) {
                ids[i] = items[i].componentId;
                continue;
            }
            const [sameName] = await conn.query(`SELECT sku FROM components WHERE name = ? LIMIT 1`, [nc.name]);
            if (sameName.length) {
                throw lineError(
                    i,
                    "name",
                    `A component named "${nc.name}" already exists (${sameName[0].sku}). Select it instead of creating a new one.`,
                    409,
                    "DUPLICATE_NAME"
                );
            }
            try {
                const [r] = await conn.query(
                    `INSERT INTO components (sku, name, description, unit, minimum_stock_level, category, size) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [nc.sku, nc.name, nc.description, nc.unit, fromCents(nc.minCents), nc.category, nc.size]
                );
                ids[i] = r.insertId;
                created[i] = true;
            } catch (error) {
                if (error.errno === 1062) {
                    throw lineError(i, "sku", `SKU ${nc.sku} is already used by another component`, 409, "DUPLICATE_SKU");
                }
                throw error;
            }
        }

        // 2) existing components must really exist
        const existingIds = items.filter((it) => it.componentId !== undefined).map((it) => it.componentId);
        if (existingIds.length) {
            const [found] = await conn.query(`SELECT id FROM components WHERE id IN (?)`, [existingIds]);
            const have = new Set(found.map((r) => r.id));
            items.forEach((it, i) => {
                if (it.componentId !== undefined && !have.has(it.componentId)) {
                    throw lineError(i, "component", "Component not found", 404, "NOT_FOUND");
                }
            });
        }

        // 3) make sure each has an inventory row, then lock them ALL in id order
        //    (same order in every request => two receipts can never deadlock each other)
        const allIds = [...new Set(ids)].sort((a, b) => a - b);
        for (const id of allIds) {
            await conn.query(
                `INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved)
                 VALUES (?, 0, 0)
                 ON DUPLICATE KEY UPDATE component_id = component_id`,
                [id]
            );
        }
        const [locked] = await conn.query(
            `SELECT * FROM inventory WHERE component_id IN (?) ORDER BY component_id FOR UPDATE`,
            [allIds]
        );
        const inv = new Map(locked.map((r) => [r.component_id, r]));

        // 4) post every line: balance + ledger row together
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const row = inv.get(ids[i]);
            const after = toCents(row.quantity_on_hand) + it.cents;
            if (after > DB_MAX_CENTS) {
                throw lineError(i, "quantity", "Resulting stock would exceed the maximum allowed");
            }
            await conn.query(
                `UPDATE inventory SET quantity_on_hand = ?, is_active = 1, archived_at = NULL WHERE id = ?`,
                [fromCents(after), row.id]
            );
            if (it.location !== undefined) {
                await conn.query(`UPDATE inventory SET location = ? WHERE id = ?`, [it.location, row.id]);
            }
            if (!created[i] && (it.category !== undefined || it.size !== undefined)) {
                await conn.query(`UPDATE components SET category = COALESCE(?, category), size = COALESCE(?, size) WHERE id = ?`,
                    [it.category ?? null, it.size ?? null, ids[i]]);
            }
            const movementId = await insertLedger(conn, {
                componentId: ids[i],
                type: "STOCK_IN",
                direction: "IN",
                cents: it.cents,
                balanceAfterCents: after,
                reason: it.reason,
                referenceNo: it.referenceNo,
                userId,
                key: keys[i],
            });
            row.quantity_on_hand = fromCents(after);
            results.push({
                line: i,
                component_id: ids[i],
                quantity: fromCents(it.cents),
                balance_after: fromCents(after),
                movement_id: movementId,
                created: created[i],
            });
        }

        const [meta] = await conn.query(`SELECT id, sku, name, unit FROM components WHERE id IN (?)`, [allIds]);
        const byId = new Map(meta.map((r) => [r.id, r]));
        return {
            items: results.map((r) => ({ ...r, ...pick(byId.get(r.component_id)) })),
            count: results.length,
            replayed: false,
        };
    };

    const earlier = await replay();
    if (earlier) return earlier;
    try {
        return await inTransaction(work);
    } catch (error) {
        // a parallel duplicate of this same request won the race: hand back its result
        if (error.errno === 1062 && /uq_inv_txn_idempotency/.test(error.message)) {
            const again = await replay();
            if (again) return again;
        }
        throw error;
    }
}

const pick = (c) => ({ sku: c.sku, name: c.name, unit: c.unit });

/* OUT ------------------------------------------------------------------- */
async function stockOut(inventoryIdRaw, body, userId) {
    const inventoryId = parseId(inventoryIdRaw);
    const cents = parseQty(body.quantity, "Quantity");
    const reason = parseReason(body.reason);
    const reasonCode = parseReasonCode(body.reason_code);
    const orderId = parseOrderId(body.order_id);
    const referenceNo = parseRef(body.reference_no);
    const key = parseKey(body.idempotency_key);

    if (reasonCode && ORDER_REQUIRED.has(reasonCode) && !orderId) {
        throw new HttpError(422, "Select the order for this reason", "VALIDATION");
    }

    const [preRows] = await db.query(`SELECT component_id FROM inventory WHERE id = ?`, [inventoryId]);
    if (preRows.length === 0) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
    const pre = preRows[0];

    return withReplayGuard(key, { componentId: pre.component_id, direction: "OUT", cents }, async (conn) => {
        const inv = await lockById(conn, inventoryId);
        if (!inv.is_active) {
            throw new HttpError(409, "This item is archived. Stock it in again to reactivate it.", "ARCHIVED");
        }

        if (orderId) {
            const [ord] = await conn.query(`SELECT id FROM orders WHERE id = ?`, [orderId]);
            if (ord.length === 0) throw new HttpError(422, "Order not found", "VALIDATION");
        }

        const onHand = toCents(inv.quantity_on_hand);
        const available = onHand - toCents(inv.quantity_reserved);

        if (cents > available) {
            throw new HttpError(
                409,
                `Insufficient stock: only ${show(Math.max(available, 0))} available to issue` +
                    (onHand !== available ? ` (${show(onHand - available)} is reserved for production)` : ""),
                "INSUFFICIENT_STOCK",
                { available: fromCents(Math.max(available, 0)) }
            );
        }

        const after = onHand - cents;
        // Belt and braces: the guard is repeated in the UPDATE itself.
        const [upd] = await conn.query(
            `UPDATE inventory
                SET quantity_on_hand = ?
              WHERE id = ? AND quantity_on_hand - quantity_reserved >= ?`,
            [fromCents(after), inventoryId, fromCents(cents)]
        );
        if (upd.affectedRows !== 1) {
            throw new HttpError(409, "Insufficient stock", "INSUFFICIENT_STOCK");
        }

        const movementId = await insertLedger(conn, {
            componentId: inv.component_id,
            type: "STOCK_OUT",
            direction: "OUT",
            cents,
            balanceAfterCents: after,
            reason,
            reasonCode,
            orderId,
            referenceNo,
            userId,
            key,
        });

        return { item: await fetchItem(conn, inventoryId), movement_id: movementId, replayed: false };
    });
}

/* EDIT / ADJUSTMENT ------------------------------------------------------ */
async function updateItem(inventoryIdRaw, body, userId) {
    const inventoryId = parseId(inventoryIdRaw);
    const changesQty = body.new_quantity !== undefined && body.new_quantity !== null && body.new_quantity !== "";
    const changesMin =
        body.minimum_stock_level !== undefined && body.minimum_stock_level !== null && body.minimum_stock_level !== "";

    if (!changesQty && !changesMin) {
        throw new HttpError(422, "Nothing to change", "VALIDATION");
    }

    const newCents = changesQty ? parseQty(body.new_quantity, "Counted quantity", { allowZero: true }) : null;
    const minCents = changesMin ? parseQty(body.minimum_stock_level, "Minimum stock level", { allowZero: true }) : null;

    let expectedCents = null;
    let reason = null;
    let key = null;
    if (changesQty) {
        if (body.expected_on_hand === undefined || body.expected_on_hand === null || body.expected_on_hand === "") {
            throw new HttpError(422, "expected_on_hand is required when changing quantity", "VALIDATION");
        }
        expectedCents = parseQty(body.expected_on_hand, "expected_on_hand", { allowZero: true });
        reason = parseReason(body.reason);
        key = parseKey(body.idempotency_key);
    }

    const [preRows] = await db.query(`SELECT component_id FROM inventory WHERE id = ?`, [inventoryId]);
    if (preRows.length === 0) throw new HttpError(404, "Inventory item not found", "NOT_FOUND");
    const componentId = preRows[0].component_id;

    const work = async (conn) => {
        const inv = await lockById(conn, inventoryId);
        if (!inv.is_active) {
            throw new HttpError(409, "This item is archived. Stock it in again to reactivate it.", "ARCHIVED");
        }

        let movementId = null;

        if (changesQty) {
            const onHand = toCents(inv.quantity_on_hand);

            if (onHand !== expectedCents) {
                throw new HttpError(
                    409,
                    `Stock changed while you were editing (now ${show(onHand)}). Review the new balance and try again.`,
                    "STALE",
                    { current_on_hand: fromCents(onHand) }
                );
            }
            const reserved = toCents(inv.quantity_reserved);
            if (newCents < reserved) {
                throw new HttpError(
                    409,
                    `Cannot set stock below the ${show(reserved)} reserved for production`,
                    "BELOW_RESERVED"
                );
            }

            const delta = newCents - onHand;
            if (delta !== 0) {
                await conn.query(`UPDATE inventory SET quantity_on_hand = ? WHERE id = ?`, [
                    fromCents(newCents),
                    inventoryId,
                ]);
                movementId = await insertLedger(conn, {
                    componentId,
                    type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
                    direction: delta > 0 ? "IN" : "OUT",
                    cents: Math.abs(delta),
                    balanceAfterCents: newCents,
                    reason,
                    referenceNo: parseRef(body.reference_no),
                    userId,
                    key,
                });
            }
        }

        if (changesMin) {
            await conn.query(`UPDATE components SET minimum_stock_level = ? WHERE id = ?`, [
                fromCents(minCents),
                componentId,
            ]);
        }

        return { item: await fetchItem(conn, inventoryId), movement_id: movementId, replayed: false };
    };

    if (changesQty) {
        return withReplayGuard(key, { componentId, cents: undefined }, work);
    }
    return inTransaction(work);
}

/* SAFE DELETE (archive) --------------------------------------------------- */
async function archiveItem(inventoryIdRaw, body, userId) {
    const inventoryId = parseId(inventoryIdRaw);
    const reason = parseReason(body && body.reason, { required: false }) || "Archived by user";

    return inTransaction(async (conn) => {
        const inv = await lockById(conn, inventoryId);

        if (!inv.is_active) {
            throw new HttpError(409, "This item is already archived", "ALREADY_ARCHIVED");
        }
        if (toCents(inv.quantity_reserved) > 0) {
            throw new HttpError(
                409,
                `Cannot archive: ${show(toCents(inv.quantity_reserved))} is reserved for production`,
                "HAS_RESERVED"
            );
        }
        if (toCents(inv.quantity_on_hand) > 0) {
            throw new HttpError(
                409,
                `Cannot archive while ${show(toCents(inv.quantity_on_hand))} is still on hand. Stock it out or adjust it to zero first.`,
                "HAS_STOCK"
            );
        }

        await conn.query(`UPDATE inventory SET is_active = 0, archived_at = NOW() WHERE id = ?`, [inventoryId]);

        // Audit entry: history is preserved, nothing is removed. Quantity is 0 because no stock moved.
        await conn.query(
            `INSERT INTO inventory_transactions
                (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
             VALUES (?, 'ARCHIVED', 'NONE', 0, 0, ?, ?)`,
            [inv.component_id, reason, userId]
        );

        return { item: await fetchItem(conn, inventoryId), replayed: false };
    });
}

module.exports = {
    HttpError,
    listInventory,
    getItem,
    getLedger,
    listComponentOptions,
    stockIn,
    stockInBatch,
    nextSku,
    stockOut,
    STOCK_OUT_REASON_CODES,
    updateItem,
    archiveItem,
};
