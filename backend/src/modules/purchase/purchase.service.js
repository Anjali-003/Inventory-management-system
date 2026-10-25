const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const notifications = require("../notifications/notification.service");

/*
    Purchase orders = components the purchase manager bought. They are the "lots" the other two
    departments work on.

    Two ways to place one (POST /purchase):
      * for ONE approved order  { order_id, request_item_ids }: lines of that order's list (order_purchase_items),
        at exactly the quantities the Operations Admin sent (the server reads them from the list).
      * combined / for stock    { items: [{ component_id, quantity, request_item_ids? }] }: the purchase manager's own
        order. Each component may cover requirement lines of ANY approved orders (request_item_ids) and is ordered in
        the quantity he chooses (suppliers sell round figures): never less than those lines need, any surplus goes
        to stock. A component without request_item_ids is bought for stock (e.g. low or out of stock).
    Either way a requirement line can be on one purchase order only (lines are locked while the order is saved).
    purchase_orders.order_id is set when every covered line belongs to one order; a combined or stock purchase has none
    (its orders are read from order_purchase_items: `orders` on every purchase returned).

        ORDER_PLACED -> RECEIVED -> (Send to IQC) -> PENDING_IQC -> (IQC) -> PENDING_STORE -> (store manager) -> STORED
        (purchase manager: place order, mark received, send to IQC)     \-> REJECTED  (IQC approved nothing)

    This file also holds the shared READ side (list / get one) used by the iqc and incoming-stock modules,
    so all three screens always show the same numbers.
*/

const STATUSES = ["ORDER_PLACED", "RECEIVED", "PENDING_IQC", "PENDING_STORE", "STORED", "REJECTED"];
// what the IQC / store screens may see: a purchase is invisible to them until it is sent to IQC
const IQC_VISIBLE = ["PENDING_IQC", "PENDING_STORE", "STORED", "REJECTED"];

const PO_SELECT = `
    SELECT
        po.id,
        po.po_number,
        po.order_id,
        o.order_number,
        po.supplier,
        po.notes,
        DATE_FORMAT(po.expected_delivery_date, '%Y-%m-%d') AS expected_delivery_date,
        -- days past the promised date: until it arrives, or how late it arrived (0 = on time / not due yet)
        GREATEST(0, DATEDIFF(COALESCE(DATE(po.received_at), CURDATE()), po.expected_delivery_date)) AS late_days,
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
    LEFT JOIN orders o ON o.id = po.order_id
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

    // the requirement lines each purchase covers: which orders it serves and how much of each component is for them
    const [covered] = await conn.query(
        `SELECT r.purchase_order_id, r.component_id, r.quantity, o.order_number
         FROM order_purchase_items r JOIN orders o ON o.id = r.order_id
         WHERE r.purchase_order_id IN (?) ORDER BY r.id`,
        [orders.map((o) => o.id)]
    );
    const coveredBy = new Map();
    for (const r of covered) {
        if (!coveredBy.has(r.purchase_order_id)) coveredBy.set(r.purchase_order_id, { orders: [], need: new Map() });
        const c = coveredBy.get(r.purchase_order_id);
        if (!c.orders.includes(r.order_number)) c.orders.push(r.order_number);
        c.need.set(r.component_id, (c.need.get(r.component_id) || 0) + Number(r.quantity));
    }

    return orders.map((o) => {
        const c = coveredBy.get(o.id) || { orders: [], need: new Map() };
        const lines = (byOrder.get(o.id) || []).map((l) => ({ ...l, for_orders: c.need.get(l.component_id) || 0 }));
        return {
            ...o,
            // ORDER = one order's list, COMBINED = several orders, STOCK = bought for stock only
            kind: c.orders.length === 0 ? "STOCK" : c.orders.length === 1 ? "ORDER" : "COMBINED",
            orders: c.orders,
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

function parseSupplier(body) {
    const supplier = typeof body.supplier === "string" ? body.supplier.trim().replace(/\s+/g, " ") : "";
    if (supplier.length < 2 || supplier.length > 150) {
        throw new AppError(422, "Supplier name must be 2-150 characters", "VALIDATION", { field: "supplier" });
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes.length > 500) throw new AppError(422, "Notes must be 500 characters or fewer", "VALIDATION", { field: "notes" });
    // when the supplier promised to deliver: lets everyone see late deliveries (and per-supplier delays in Reports)
    const raw = typeof body.expected_delivery_date === "string" ? body.expected_delivery_date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
        throw new AppError(422, "Enter the date the supplier will deliver", "VALIDATION", { field: "expected_delivery_date" });
    }
    return { supplier, notes: notes || null, expectedDate: raw };
}

function parseCreate(body) {
    const { supplier, notes, expectedDate } = parseSupplier(body);

    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw new AppError(422, "Select the approved order you are buying for", "VALIDATION", { field: "order_id" });
    }

    // ids of the lines of the Operations Admin's list (order_purchase_items.id). Nothing else is accepted.
    if (!Array.isArray(body.request_item_ids) || body.request_item_ids.length === 0) {
        throw new AppError(422, "Select at least one component from the Operations Admin's list", "VALIDATION");
    }
    // no cap on the number of lines: they all come from the Operations Admin's list, and a big BOM can have hundreds
    const ids = body.request_item_ids.map((v) => Number(v));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new AppError(422, "Invalid component selected", "VALIDATION");
    }
    if (new Set(ids).size !== ids.length) {
        throw new AppError(422, "The same component is selected twice", "VALIDATION");
    }

    return { orderId, supplier, notes, expectedDate, requestItemIds: ids };
}

const MAX_ITEMS = 500;
const positiveIds = (raw, label) => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw new AppError(422, `${label} must be a list`, "VALIDATION");
    const ids = raw.map((v) => Number(v));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new AppError(422, `${label} has an invalid id`, "VALIDATION");
    return ids;
};

/* { supplier, notes?, items: [{ component_id, quantity, request_item_ids? }] } -> checked, quantities in cents */
function parseCombined(body) {
    const { supplier, notes, expectedDate } = parseSupplier(body);
    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new AppError(422, "Add at least one component to the order", "VALIDATION", { field: "items" });
    }
    if (body.items.length > MAX_ITEMS) throw new AppError(422, `At most ${MAX_ITEMS} components per order`, "VALIDATION", { field: "items" });

    const components = new Set();
    const lineIds = new Set();
    const items = body.items.map((raw, line) => {
        const componentId = Number(raw && raw.component_id);
        if (!Number.isInteger(componentId) || componentId <= 0) {
            throw new AppError(422, "A component on the order is invalid", "VALIDATION", { field: "items", line });
        }
        if (components.has(componentId)) {
            throw new AppError(422, "The same component is on the order twice: put the whole quantity on one line", "VALIDATION", { field: "items", line });
        }
        components.add(componentId);
        let cents;
        try {
            cents = inventory.parseQty(raw.quantity, "Quantity");
        } catch (error) {
            error.extra = { field: "items", line };
            throw error;
        }
        const requestItemIds = positiveIds(raw.request_item_ids, "request_item_ids");
        for (const id of requestItemIds) {
            if (lineIds.has(id)) throw new AppError(422, "The same requirement line is on the order twice", "VALIDATION", { field: "items", line });
            lineIds.add(id);
        }
        return { componentId, cents, requestItemIds };
    });
    return { supplier, notes, expectedDate, items };
}

/*
    body: { order_id, supplier, notes?, request_item_ids: [order_purchase_items.id, ...] }
    The order must be APPROVED, every selected line must belong to it and must not be on a purchase order yet.
    Lines are locked first, so two clicks (or two purchase managers) can never order the same line twice.
*/
async function createPurchase(body, userId) {
    const b = body || {};
    const forOneOrder = b.order_id !== undefined && b.order_id !== null && b.order_id !== "";
    return forOneOrder ? createForOrder(b, userId) : createCombined(b, userId);
}

/* Inserts the purchase order with its lines and links the covered requirement lines to it. Returns its id. */
async function insertPurchase(conn, { orderId, supplier, notes, expectedDate, userId, lines, requestItemIds }) {
    // po_number is derived from the id, so insert with a throw-away unique value first
    const [res] = await conn.query(
        `INSERT INTO purchase_orders (po_number, order_id, supplier, notes, expected_delivery_date, status, created_by)
         VALUES (CONCAT('TMP-', UUID()), ?, ?, ?, ?, 'ORDER_PLACED', ?)`,
        [orderId, supplier, notes, expectedDate, userId]
    );
    const poId = res.insertId;
    await conn.query(`UPDATE purchase_orders SET po_number = ? WHERE id = ?`, [`PO-${String(poId).padStart(4, "0")}`, poId]);
    for (const l of lines) {
        await conn.query(
            `INSERT INTO purchase_order_items (purchase_order_id, component_id, quantity_ordered) VALUES (?, ?, ?)`,
            [poId, l.componentId, l.quantity]
        );
    }
    for (const id of requestItemIds) {
        await conn.query(`UPDATE order_purchase_items SET purchase_order_id = ? WHERE id = ?`, [poId, id]);
    }
    return poId;
}

/*
    The purchase manager's own order: several orders' requirements combined and/or components for stock, each in the
    quantity he chooses (a round figure is fine) but never below what the covered requirement lines need.
*/
async function createCombined(body, userId) {
    const { supplier, notes, expectedDate, items } = parseCombined(body);

    return inventory.inTransaction(async (conn) => {
        const componentIds = items.map((i) => i.componentId);
        const [known] = await conn.query(`SELECT id, name FROM components WHERE id IN (?)`, [componentIds]);
        const nameOf = new Map(known.map((c) => [c.id, c.name]));
        const missing = componentIds.find((id) => !nameOf.has(id));
        if (missing) throw new AppError(422, "A component on the order does not exist", "UNKNOWN_COMPONENT", { component_id: missing });

        const allLineIds = items.flatMap((i) => i.requestItemIds);
        const lineById = new Map();
        if (allLineIds.length) {
            // locked: two purchase managers (or two clicks) can never order the same requirement line twice
            const [lines] = await conn.query(
                `SELECT r.id, r.order_id, r.component_id, r.quantity, r.purchase_order_id, o.order_number, o.approval_status
                 FROM order_purchase_items r JOIN orders o ON o.id = r.order_id
                 WHERE r.id IN (?) FOR UPDATE`,
                [allLineIds]
            );
            for (const l of lines) lineById.set(l.id, l);
        }

        const orderIds = new Set();
        for (const item of items) {
            let needCents = 0;
            for (const id of item.requestItemIds) {
                const line = lineById.get(id);
                if (!line || line.component_id !== item.componentId) {
                    throw new AppError(422, `${nameOf.get(item.componentId)}: a requirement line does not belong to this component. Refresh the page.`, "NOT_ON_LIST");
                }
                if (line.approval_status !== "APPROVED") {
                    throw AppError.conflict(`Order ${line.order_number} is not approved, so nothing can be bought for it.`, "NOT_APPROVED");
                }
                if (line.purchase_order_id !== null && line.purchase_order_id !== undefined) {
                    throw AppError.conflict(`${nameOf.get(item.componentId)} for order ${line.order_number} has already been ordered. Refresh the page.`, "ALREADY_ORDERED");
                }
                needCents += inventory.toCents(line.quantity);
                orderIds.add(line.order_id);
            }
            if (item.cents < needCents) {
                throw new AppError(
                    422,
                    `${nameOf.get(item.componentId)}: order at least ${inventory.fromCents(needCents).replace(/\.00$/, "")}, that is what the selected orders need.`,
                    "BELOW_REQUIREMENT",
                    { field: "items", component_id: item.componentId, minimum: Number(inventory.fromCents(needCents)) }
                );
            }
        }

        const poId = await insertPurchase(conn, {
            orderId: orderIds.size === 1 ? [...orderIds][0] : null,
            supplier,
            notes,
            expectedDate,
            userId,
            lines: items.map((i) => ({ componentId: i.componentId, quantity: inventory.fromCents(i.cents) })),
            requestItemIds: allLineIds,
        });
        return getPurchase(poId, conn);
    });
}

/* One approved order's list, at the quantities the Operations Admin sent. */
async function createForOrder(body, userId) {
    const { orderId, supplier, notes, expectedDate, requestItemIds } = parseCreate(body);

    return inventory.inTransaction(async (conn) => {
        const [orders] = await conn.query(`SELECT id, approval_status FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
        if (orders.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (orders[0].approval_status !== "APPROVED") {
            throw AppError.conflict("This order is not approved, so nothing can be bought for it.", "NOT_APPROVED");
        }

        const [lines] = await conn.query(
            `SELECT id, order_id, component_id, quantity, purchase_order_id
             FROM order_purchase_items WHERE id IN (?) FOR UPDATE`,
            [requestItemIds]
        );
        const byId = new Map(lines.map((l) => [l.id, l]));
        for (const id of requestItemIds) {
            const line = byId.get(id);
            if (!line || line.order_id !== orderId) {
                throw new AppError(422, "A selected component is not on the Operations Admin's list for this order.", "NOT_ON_LIST");
            }
            if (line.purchase_order_id !== null && line.purchase_order_id !== undefined) {
                throw AppError.conflict("A selected component has already been ordered. Refresh the page.", "ALREADY_ORDERED");
            }
        }

        const poId = await insertPurchase(conn, {
            orderId,
            supplier,
            notes,
            expectedDate,
            userId,
            lines: requestItemIds.map((id) => ({ componentId: byId.get(id).component_id, quantity: byId.get(id).quantity })),
            requestItemIds,
        });
        return getPurchase(poId, conn);
    });
}

/*
    Moves one purchase a single step forward (row is locked, so a double click can never do it twice).
        receive      ORDER_PLACED -> RECEIVED       "the goods have arrived"
        send-to-iqc  RECEIVED     -> PENDING_IQC    "hand them to the IQC manager"
*/
async function advance(purchaseId, { from, to, byColumn, atColumn, conflictCode, conflictMessage, notice, before }, userId) {
    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, po_number, status FROM purchase_orders WHERE id = ? FOR UPDATE`, [purchaseId]);
        if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
        if (rows[0].status !== from) throw AppError.conflict(conflictMessage, conflictCode);
        if (before) await before(conn);

        await conn.query(`UPDATE purchase_orders SET status = ?, ${byColumn} = ?, ${atColumn} = NOW() WHERE id = ?`, [to, userId, purchaseId]);
        // the department that receives the purchase next (saved with this step, pushed after commit)
        if (notice) {
            const poNumber = rows[0].po_number || `#${purchaseId}`;
            await notifications.notify(conn, { ...notice(poNumber), payload: { purchase_id: purchaseId, po_number: poNumber }, userId });
        }
        return getPurchase(purchaseId, conn);
    });
}

/*
    body.items = [{ id: purchase_order_items.id, received }]: how many pieces of each component actually arrived
    (the purchase manager counts them; IQC later only decides how many of those are rejected). Every line must be
    given. Without items (older screens) every line counts as received in full.
*/
function parseReceived(body) {
    const b = body || {};
    if (b.items === undefined || b.items === null) return null;
    if (!Array.isArray(b.items) || b.items.length === 0) throw new AppError(422, "Enter the received quantity of every component", "VALIDATION");
    const seen = new Set();
    return b.items.map((raw, line) => {
        const id = Number(raw && raw.id);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) throw new AppError(422, "Invalid received line", "VALIDATION", { line });
        seen.add(id);
        try {
            return { id, received: inventory.parseQty(raw.received, "Received quantity", { allowZero: true }) };
        } catch (error) {
            error.extra = { line, field: "received" };
            throw error;
        }
    });
}

function markReceived(purchaseId, body, userId) {
    const items = parseReceived(body);
    return advance(purchaseId, {
        from: "ORDER_PLACED", to: "RECEIVED", byColumn: "received_by", atColumn: "received_at",
        conflictCode: "NOT_ORDERED", conflictMessage: "This purchase is not waiting to be received. Refresh the page.",
        before: async (conn) => {
            if (!items) {
                await conn.query(`UPDATE purchase_order_items SET quantity_received = quantity_ordered WHERE purchase_order_id = ?`, [purchaseId]);
                return;
            }
            const [lines] = await conn.query(`SELECT id FROM purchase_order_items WHERE purchase_order_id = ?`, [purchaseId]);
            const byId = new Map(items.map((i) => [i.id, i]));
            if (lines.length !== items.length || lines.some((l) => !byId.has(l.id))) {
                throw new AppError(422, "Enter the received quantity of every component", "VALIDATION");
            }
            if (items.every((i) => i.received === 0)) throw new AppError(422, "Nothing was received. Enter the pieces that arrived.", "VALIDATION");
            for (const it of items) {
                await conn.query(`UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?`, [inventory.fromCents(it.received), it.id]);
            }
        },
    }, userId);
}

function sendToIqc(purchaseId, userId) {
    return advance(purchaseId, {
        from: "RECEIVED", to: "PENDING_IQC", byColumn: "sent_to_iqc_by", atColumn: "sent_to_iqc_at",
        conflictCode: "NOT_RECEIVED", conflictMessage: "Mark this purchase as received before sending it to IQC. Refresh the page.",
        notice: (poNumber) => ({
            role: "IQC_MANAGER", type: "PURCHASE_SENT_TO_IQC", severity: "action", link: "/iqc?status=PENDING_IQC",
            title: `Purchase ${poNumber} is waiting for inspection`,
            body: "The Purchase Manager sent the received goods to IQC.",
        }),
    }, userId);
}

module.exports = { STATUSES, IQC_VISIBLE, listPurchases, getPurchase, createPurchase, markReceived, sendToIqc };
