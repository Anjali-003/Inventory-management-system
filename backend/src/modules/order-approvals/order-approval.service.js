const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const { planOrder } = require("./order-planner");

/*
    Order approval.  Every new order starts as PENDING_APPROVAL.
        Operations Admin:  approve  -> APPROVED   (the order now shows in the Purchase Manager's "Approved orders" list)
                           reject   -> REJECTED   (remarks are required)
    A decision is final: only PENDING_APPROVAL orders can be decided (row is locked, so a double click or two
    admins deciding at once can never decide the same order twice).

    Dispatch (the normal way to approve): while an order waits, the admin sees what can be built from the stock on the shelf
    (getPlan). dispatch() then approves it and records two lists in the same transaction: the producible quantities
    for the Production Manager and the missing components for the Purchase Manager. approve() stays for a plain approval.

    Each purchase line (purchase_request.items[]) carries request_item_id (the id the Purchase Manager sends back to place the
    order) and purchase_order_id / po_number / po_status: null while the line is still "to order".

    The same READ side feeds both screens (Operations Admin = all, Purchase Manager = APPROVED only), so the
    numbers always match.
*/

const APPROVAL_STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"]; // DRAFT is marketing-only: never listed here
const MAX_REMARKS = 500;

const ORDER_SELECT = `
    SELECT
        o.id,
        o.order_number,
        o.status,
        o.approval_status,
        o.approval_remarks,
        cu.name AS created_by_name,
        DATE_FORMAT(o.sent_to_admin_at, '%Y-%m-%d %H:%i:%s') AS sent_to_admin_at,
        au.name AS approved_by_name,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(o.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
    FROM orders o
    LEFT JOIN users cu ON cu.id = o.created_by
    LEFT JOIN users au ON au.id = o.approved_by
`;

/* Attaches the product lines (one query for all orders) and totals. */
async function withItems(conn, orders) {
    if (orders.length === 0) return [];

    const [items] = await conn.query(
        `SELECT oi.order_id, oi.product_id, p.sku, p.name, oi.quantity
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (?)
         ORDER BY oi.id`,
        [orders.map((o) => o.id)]
    );

    const byOrder = new Map();
    for (const it of items) {
        if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
        byOrder.get(it.order_id).push({ ...it, quantity: Number(it.quantity) });
    }

    const ids = orders.map((o) => o.id);
    const production = await requestsOf(
        conn,
        `SELECT r.order_id, r.product_id, p.sku, p.name, r.quantity, u.name AS sent_by_name,
                DATE_FORMAT(r.sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at
         FROM order_production_items r
         JOIN products p ON p.id = r.product_id
         LEFT JOIN users u ON u.id = r.sent_by
         WHERE r.order_id IN (?) ORDER BY r.id`,
        ids
    );
    const purchase = await requestsOf(
        conn,
        `SELECT r.order_id, r.id AS request_item_id, r.component_id, c.sku, c.name, c.unit, r.quantity,
                r.purchase_order_id, po.po_number, po.status AS po_status,
                u.name AS sent_by_name,
                DATE_FORMAT(r.sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at
         FROM order_purchase_items r
         JOIN components c ON c.id = r.component_id
         LEFT JOIN purchase_orders po ON po.id = r.purchase_order_id
         LEFT JOIN users u ON u.id = r.sent_by
         WHERE r.order_id IN (?) ORDER BY r.id`,
        ids
    );

    return orders.map((o) => {
        const lines = byOrder.get(o.id) || [];
        return {
            ...o,
            items: lines,
            totals: { lines: lines.length, quantity: lines.reduce((s, l) => s + l.quantity, 0) },
            // what the Operations Admin sent on approval; null when nothing was sent
            production_request: production.get(o.id) || null,
            purchase_request: purchase.get(o.id) || null,
        };
    });
}

/* Runs one of the two request queries and groups the rows per order: { sent_at, sent_by_name, items: [...] }. */
async function requestsOf(conn, sql, ids) {
    const [rows] = await conn.query(sql, [ids]);
    const byOrder = new Map();
    for (const { order_id, sent_at, sent_by_name, ...item } of rows) {
        if (!byOrder.has(order_id)) byOrder.set(order_id, { sent_at, sent_by_name, items: [] });
        byOrder.get(order_id).items.push({ ...item, quantity: Number(item.quantity) });
    }
    return byOrder;
}

/* statuses: array of approval statuses to return (default: all). Newest first. */
async function listOrders({ statuses } = {}, conn = db) {
    const wanted = (statuses || []).filter((s) => APPROVAL_STATUSES.includes(s));
    const where = wanted.length ? "WHERE o.approval_status IN (?)" : "WHERE o.approval_status <> 'DRAFT'";
    const order = wanted.length === 1 && wanted[0] === "APPROVED" ? "o.approved_at DESC, o.id DESC" : "o.id DESC";

    const [rows] = await conn.query(`${ORDER_SELECT} ${where} ORDER BY ${order} LIMIT 300`, wanted.length ? [wanted] : []);
    return withItems(conn, rows);
}

async function getOrder(id, conn = db) {
    const [rows] = await conn.query(`${ORDER_SELECT} WHERE o.id = ?`, [id]);
    if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
    const [one] = await withItems(conn, rows);
    return one;
}

/* Orders by id, newest first (used by the marketing screen). */
async function getOrdersByIds(ids, conn = db) {
    if (ids.length === 0) return [];
    const [rows] = await conn.query(`${ORDER_SELECT} WHERE o.id IN (?) ORDER BY o.id DESC`, [ids]);
    return withItems(conn, rows);
}

function parseRemarks(raw, { required }) {
    const remarks = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (required && remarks.length < 3) {
        throw new AppError(422, "Please write the reason for rejecting this order (at least 3 characters)", "VALIDATION", { field: "remarks" });
    }
    if (remarks.length > MAX_REMARKS) {
        throw new AppError(422, `Remarks must be ${MAX_REMARKS} characters or fewer`, "VALIDATION", { field: "remarks" });
    }
    return remarks || null;
}

async function decide(orderId, decision, body, userId) {
    const remarks = parseRemarks(body && body.remarks, { required: decision === "REJECTED" });

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, approval_status FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
        if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (rows[0].approval_status !== "PENDING_APPROVAL") {
            throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
        }

        await conn.query(
            `UPDATE orders SET approval_status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
            [decision, remarks, userId, orderId]
        );
        return getOrder(orderId, conn);
    });
}

const approve = (orderId, body, userId) => decide(orderId, "APPROVED", body, userId);
const reject = (orderId, body, userId) => decide(orderId, "REJECTED", body, userId);

/* ------------------------------------------------------------------ planning + dispatch */

const toCents = (v) => Math.round(Number(v) * 100);

/*
    Loads what the planner needs for one order: its lines, each product's BOM and every component's available stock
    (on hand - reserved). lock = true locks those inventory rows until the transaction ends (used by dispatch, so
    nobody can take the stock between the check and the save).
    A product whose BOM is missing, or has a line without a quantity, cannot be planned reliably: it is handed to the
    planner with an empty BOM, which reports it in missing_bom.
*/
async function computePlan(conn, orderId, { lock = false } = {}) {
    const [items] = await conn.query(
        `SELECT oi.product_id, p.sku, p.name, oi.quantity
         FROM order_items oi JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ? ORDER BY oi.id`,
        [orderId]
    );
    if (items.length === 0) throw AppError.conflict("This order has no products.", "NO_ITEMS");

    const [bomRows] = await conn.query(
        `SELECT pb.product_id, pb.component_id, pb.quantity_required, c.sku, c.name, c.unit
         FROM product_bom pb JOIN components c ON c.id = pb.component_id
         WHERE pb.product_id IN (?)`,
        [items.map((i) => i.product_id)]
    );

    const bomByProduct = {};
    const incomplete = new Set();
    const blankLines = {}; // product_id -> components whose quantity is blank (or 0), to tell the user exactly what to fix
    const componentInfo = {};
    for (const r of bomRows) {
        componentInfo[r.component_id] = { sku: r.sku, name: r.name, unit: r.unit };
        if (r.quantity_required === null || Number(r.quantity_required) <= 0) { incomplete.add(r.product_id); (blankLines[r.product_id] ||= []).push({ component_id: r.component_id, sku: r.sku, name: r.name }); continue; }
        (bomByProduct[r.product_id] ||= []).push({ component_id: r.component_id, quantity_per_unit: Number(r.quantity_required) });
    }
    for (const id of incomplete) bomByProduct[id] = [];

    const componentIds = Object.keys(componentInfo).map(Number);
    const availableByComp = {};
    if (componentIds.length) {
        const [stock] = await conn.query(
            `SELECT component_id, quantity_on_hand, quantity_reserved FROM inventory WHERE component_id IN (?)${lock ? " FOR UPDATE" : ""}`,
            [componentIds]
        );
        for (const r of stock) availableByComp[r.component_id] = Number(r.quantity_on_hand) - Number(r.quantity_reserved);
    }

    const plan = planOrder({
        items: items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
        bomByProduct,
        availableByComp,
        componentInfo,
    });

    const byProduct = new Map(items.map((i) => [i.product_id, i]));
    return {
        order_id: orderId,
        ...plan,
        // products that DO have BOM lines but at least one line has no quantity (planner treats them as missing_bom)
        incomplete_bom: plan.missing_bom.filter((id) => blankLines[id]).map((id) => ({ product_id: id, components: blankLines[id] })),
        lines: plan.lines.map((l) => ({ ...l, sku: byProduct.get(l.product_id).sku, name: byProduct.get(l.product_id).name })),
    };
}

/* GET /order-approvals/:id/plan: only an order that still waits for a decision can be planned. */
async function getPlan(orderId, conn = db) {
    const [rows] = await conn.query(`SELECT approval_status FROM orders WHERE id = ?`, [orderId]);
    if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
    if (rows[0].approval_status !== "PENDING_APPROVAL") {
        throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
    }
    return computePlan(conn, orderId);
}

/* [{ <idField>, quantity }] from the request -> Map(id -> cents). Rejects bad ids / quantities and duplicates. */
function parseList(raw, idField, label) {
    if (raw === undefined || raw === null) return new Map();
    if (!Array.isArray(raw)) throw new AppError(422, `${label} must be a list`, "VALIDATION", { field: label });
    const out = new Map();
    for (const row of raw) {
        const id = Number(row && row[idField]);
        const qty = Number(row && row.quantity);
        if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0) {
            throw new AppError(422, `${label} has an invalid line`, "VALIDATION", { field: label });
        }
        if (out.has(id)) throw new AppError(422, `${label} lists the same item twice`, "VALIDATION", { field: label });
        out.set(id, toCents(qty));
    }
    return out;
}

const sameList = (sent, expected) =>
    sent.size === expected.size && [...expected].every(([id, cents]) => sent.get(id) === cents);

/*
    POST /order-approvals/:id/dispatch  { remarks?, production_items: [{ product_id, quantity }], purchase_items: [{ component_id, quantity }] }
    The two lists are what the admin saw on screen. The plan is calculated again under a lock; if stock changed in the
    meantime the lists no longer match and the whole request is refused with 409 STALE_PLAN (nothing is saved).
*/
async function dispatch(orderId, body, userId) {
    const remarks = parseRemarks(body && body.remarks, { required: false });
    const sentProduction = parseList(body && body.production_items, "product_id", "production_items");
    const sentPurchase = parseList(body && body.purchase_items, "component_id", "purchase_items");
    if (sentProduction.size === 0 && sentPurchase.size === 0) {
        throw new AppError(422, "There is nothing to send: no product can be made now and no component is short.", "VALIDATION");
    }

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, approval_status FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
        if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (rows[0].approval_status !== "PENDING_APPROVAL") {
            throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
        }

        const plan = await computePlan(conn, orderId, { lock: true });
        const producible = plan.lines.filter((l) => l.can_make > 0);
        const expectedProduction = new Map(producible.map((l) => [l.product_id, toCents(l.can_make)]));
        const expectedPurchase = new Map(plan.shortages.map((s) => [s.component_id, toCents(s.shortage)]));

        if (!sameList(sentProduction, expectedProduction) || !sameList(sentPurchase, expectedPurchase)) {
            throw AppError.conflict(
                "Stock changed while you were reviewing this order. The plan has been refreshed: check it and send again.",
                "STALE_PLAN"
            );
        }

        await conn.query(
            `UPDATE orders SET approval_status = 'APPROVED', approval_remarks = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
            [remarks, userId, orderId]
        );
        if (producible.length) {
            await conn.query(
                `INSERT INTO order_production_items (order_id, product_id, quantity, sent_by) VALUES ?`,
                [producible.map((l) => [orderId, l.product_id, l.can_make, userId])]
            );
        }
        if (plan.shortages.length) {
            await conn.query(
                `INSERT INTO order_purchase_items (order_id, component_id, quantity, sent_by) VALUES ?`,
                [plan.shortages.map((s) => [orderId, s.component_id, s.shortage, userId])]
            );
        }
        return getOrder(orderId, conn);
    });
}

module.exports = { APPROVAL_STATUSES, listOrders, getOrder, getOrdersByIds, approve, reject, getPlan, dispatch };
