const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");

/*
    Purchase orders = components the purchase manager bought. They are the "lots" the other two
    departments work on:
        ORDER_PLACED -> RECEIVED -> (Send to IQC) -> PENDING_IQC -> (IQC) -> PENDING_STORE -> (store manager) -> STORED
        (purchase manager: place order, mark received, send to IQC)     \-> REJECTED  (IQC approved nothing)

    This file also holds the shared READ side (list / get one) used by the iqc and incoming-stock modules,
    so all three screens always show the same numbers.
*/

const STATUSES = ["ORDER_PLACED", "RECEIVED", "PENDING_IQC", "PENDING_STORE", "STORED", "REJECTED"];
// what the IQC / store screens may see: a purchase is invisible to them until it is sent to IQC
const IQC_VISIBLE = ["PENDING_IQC", "PENDING_STORE", "STORED", "REJECTED"];
const MAX_ITEMS = 50;

const PO_SELECT = `
    SELECT
        po.id,
        po.po_number,
        po.supplier,
        po.notes,
        po.status,
        po.iqc_remarks,
        cu.name AS created_by_name,
        ru.name AS received_by_name,
        su.name AS sent_to_iqc_by_name,
        iu.name AS iqc_by_name,
        au.name AS accepted_by_name,
        DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(po.received_at, '%Y-%m-%d %H:%i:%s') AS received_at,
        DATE_FORMAT(po.sent_to_iqc_at, '%Y-%m-%d %H:%i:%s') AS sent_to_iqc_at,
        DATE_FORMAT(po.iqc_at, '%Y-%m-%d %H:%i:%s') AS iqc_at,
        DATE_FORMAT(po.accepted_at, '%Y-%m-%d %H:%i:%s') AS accepted_at
    FROM purchase_orders po
    LEFT JOIN users cu ON cu.id = po.created_by
    LEFT JOIN users ru ON ru.id = po.received_by
    LEFT JOIN users su ON su.id = po.sent_to_iqc_by
    LEFT JOIN users iu ON iu.id = po.iqc_by
    LEFT JOIN users au ON au.id = po.accepted_by
`;

const ITEM_SELECT = `
    SELECT
        i.id,
        i.purchase_order_id,
        i.component_id,
        c.sku,
        c.name,
        c.unit,
        i.quantity_ordered,
        i.quantity_received,
        i.quantity_defective,
        i.quantity_approved,
        i.iqc_decision,
        i.remarks
    FROM purchase_order_items i
    JOIN components c ON c.id = i.component_id
`;

const num = (v) => (v === null || v === undefined ? null : Number(v));

/* Attaches the lines (one query for all orders) and a few totals the screens show. */
async function withItems(conn, orders) {
    if (orders.length === 0) return [];

    const [items] = await conn.query(`${ITEM_SELECT} WHERE i.purchase_order_id IN (?) ORDER BY i.id`, [
        orders.map((o) => o.id),
    ]);
    const byOrder = new Map();
    for (const it of items) {
        if (!byOrder.has(it.purchase_order_id)) byOrder.set(it.purchase_order_id, []);
        byOrder.get(it.purchase_order_id).push(it);
    }

    return orders.map((o) => {
        const lines = byOrder.get(o.id) || [];
        return {
            ...o,
            items: lines,
            totals: {
                lines: lines.length,
                ordered: lines.reduce((s, l) => s + Number(l.quantity_ordered), 0),
                received: lines.reduce((s, l) => s + (num(l.quantity_received) ?? 0), 0),
                defective: lines.reduce((s, l) => s + Number(l.quantity_defective), 0),
                approved: lines.reduce((s, l) => s + (num(l.quantity_approved) ?? 0), 0),
                rejected_lines: lines.filter((l) => l.iqc_decision === "REJECTED").length,
            },
        };
    });
}

/* statuses: array of PURCHASE ORDER statuses to return (default: all). Newest first. */
async function listPurchases({ statuses } = {}, conn = db) {
    const wanted = (statuses || []).filter((s) => STATUSES.includes(s));
    const where = wanted.length ? "WHERE po.status IN (?)" : "";
    const [rows] = await conn.query(`${PO_SELECT} ${where} ORDER BY po.created_at DESC, po.id DESC LIMIT 300`, wanted.length ? [wanted] : []);
    return withItems(conn, rows);
}

async function getPurchase(id, conn = db) {
    const [rows] = await conn.query(`${PO_SELECT} WHERE po.id = ?`, [id]);
    if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
    const [one] = await withItems(conn, rows);
    return one;
}

function parseCreate(body) {
    const supplier = typeof body.supplier === "string" ? body.supplier.trim().replace(/\s+/g, " ") : "";
    if (supplier.length < 2 || supplier.length > 150) {
        throw new AppError(422, "Supplier name must be 2-150 characters", "VALIDATION", { field: "supplier" });
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes.length > 500) throw new AppError(422, "Notes must be 500 characters or fewer", "VALIDATION", { field: "notes" });

    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new AppError(422, "Add at least one component to the purchase", "VALIDATION");
    }
    if (body.items.length > MAX_ITEMS) {
        throw new AppError(422, `One purchase can hold at most ${MAX_ITEMS} components`, "VALIDATION");
    }

    const seen = new Set();
    const items = body.items.map((raw, line) => {
        const id = Number(raw && raw.component_id);
        if (!Number.isInteger(id) || id <= 0) {
            throw new AppError(422, "Select a component", "VALIDATION", { line, field: "component" });
        }
        if (seen.has(id)) {
            throw new AppError(422, "This component appears more than once in the list", "VALIDATION", { line, field: "component" });
        }
        seen.add(id);

        let cents;
        try {
            cents = inventory.parseQty(raw.quantity, "Quantity");
        } catch (error) {
            error.extra = { line, field: "quantity" };
            throw error;
        }
        return { componentId: id, cents };
    });

    return { supplier, notes: notes || null, items };
}

async function createPurchase(body, userId) {
    const { supplier, notes, items } = parseCreate(body || {});

    return inventory.inTransaction(async (conn) => {
        const ids = items.map((i) => i.componentId);
        const [found] = await conn.query(`SELECT id FROM components WHERE id IN (?)`, [ids]);
        const have = new Set(found.map((r) => r.id));
        items.forEach((it, line) => {
            if (!have.has(it.componentId)) {
                throw new AppError(404, "Component not found", "NOT_FOUND", { line, field: "component" });
            }
        });

        // po_number is derived from the id, so insert with a throw-away unique value first
        const [res] = await conn.query(
            `INSERT INTO purchase_orders (po_number, supplier, notes, status, created_by)
             VALUES (CONCAT('TMP-', UUID()), ?, ?, 'ORDER_PLACED', ?)`,
            [supplier, notes, userId]
        );
        const poId = res.insertId;
        await conn.query(`UPDATE purchase_orders SET po_number = ? WHERE id = ?`, [`PO-${String(poId).padStart(4, "0")}`, poId]);

        for (const it of items) {
            await conn.query(
                `INSERT INTO purchase_order_items (purchase_order_id, component_id, quantity_ordered) VALUES (?, ?, ?)`,
                [poId, it.componentId, inventory.fromCents(it.cents)]
            );
        }
        return getPurchase(poId, conn);
    });
}

/*
    Moves one purchase a single step forward (row is locked, so a double click can never do it twice).
        receive      ORDER_PLACED -> RECEIVED       "the goods have arrived"
        send-to-iqc  RECEIVED     -> PENDING_IQC    "hand them to the IQC manager"
*/
async function advance(purchaseId, { from, to, byColumn, atColumn, conflictCode, conflictMessage }, userId) {
    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE`, [purchaseId]);
        if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
        if (rows[0].status !== from) throw AppError.conflict(conflictMessage, conflictCode);

        await conn.query(`UPDATE purchase_orders SET status = ?, ${byColumn} = ?, ${atColumn} = NOW() WHERE id = ?`, [to, userId, purchaseId]);
        return getPurchase(purchaseId, conn);
    });
}

function markReceived(purchaseId, userId) {
    return advance(purchaseId, {
        from: "ORDER_PLACED", to: "RECEIVED", byColumn: "received_by", atColumn: "received_at",
        conflictCode: "NOT_ORDERED", conflictMessage: "This purchase is not waiting to be received. Refresh the page.",
    }, userId);
}

function sendToIqc(purchaseId, userId) {
    return advance(purchaseId, {
        from: "RECEIVED", to: "PENDING_IQC", byColumn: "sent_to_iqc_by", atColumn: "sent_to_iqc_at",
        conflictCode: "NOT_RECEIVED", conflictMessage: "Mark this purchase as received before sending it to IQC. Refresh the page.",
    }, userId);
}

/* Component picker for the purchase form (the inventory picker is behind the inventory permission). */
async function componentOptions(query = {}) {
    return inventory.listComponentOptions({ q: query.q, limit: query.limit });
}

module.exports = { STATUSES, IQC_VISIBLE, listPurchases, getPurchase, createPurchase, markReceived, sendToIqc, componentOptions };
