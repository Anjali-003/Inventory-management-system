const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const idem = require("../../shared/idempotency");
const { planOrder } = require("./order-planner");

/*
    Order approval.  Every new order starts as PENDING_APPROVAL.
        Operations Admin:  approve  -> APPROVED   (the order now shows in the Purchase Manager's "Approved orders" list)
                           reject   -> REJECTED   (remarks are required)
    A decision is final: only PENDING_APPROVAL orders can be decided (row is locked, so a double click or two
    admins deciding at once can never decide the same order twice).

    There is no partial approval: an order is approved as a whole or rejected. The admin sees the producible quantities
    and component shortages. On approval, the required inventory for currently producible quantities is deducted immediately
    and recorded in the stock ledger; those deducted materials are later physically handed over by Store when Production
    submits material requests. Missing components for the rest of the order go to the Purchase Manager. Store allotment does
    not deduct inventory again. Rejecting is only possible while the order is PENDING_APPROVAL.

    Dispatch (the normal way to approve): while an order waits, the admin sees what can be built from the stock on the shelf
    (getPlan). dispatch() then approves it and records two lists in the same transaction: the producible quantities
    for the Production Manager and the missing components for the Purchase Manager. approve() stays for a plain approval.

    Each purchase line (purchase_request.items[]) carries request_item_id (the id the Purchase Manager sends back to place the
    order) and purchase_order_id / po_number / po_status: null while the line is still "to order".

    The same READ side feeds both screens (Operations Admin = all, Purchase Manager = APPROVED only), so the
    numbers always match.

    No double deductions.  approve() and dispatch() move stock, so each request must be applied at most once. Three
    independent layers, each closing a gap the others leave:
      1. idempotency_key (required)  A double click or a network retry carries the SAME key: the first request is applied,
         every repeat gets the first response replayed and never reaches the stock (shared/idempotency.js). A client
         that lost the response therefore still learns that its request succeeded.
      2. expected_round (required)   The approval round the client saw (GET .../plan, or the order's approval_round).
         A partly approved order is deliberately approvable again, so without this a repeat of the same request would be
         accepted as "the next pass" and deduct a second time. Two admins, two tabs, or a retry under a NEW key all
         arrive with a round that is no longer current and are refused with 409 STALE_ROUND.
      3. ledger key  Every stock movement carries `approval-<order>-<round>-<component>`, UNIQUE in the database. If the
         two layers above were ever bypassed, the second deduction fails and the whole transaction rolls back.
*/

const APPROVAL_STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"]; // DRAFT is marketing-only: never listed here
const MAX_REMARKS = 500;
const APPROVABLE = ["PENDING_APPROVAL"]; // statuses an order can be approved from

const ORDER_SELECT = `
    SELECT
        o.id,
        o.order_number,
        o.status,
        o.approval_status,
        o.approval_round,
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

    // an order approved in several passes has several rows per product: show each product once, quantities added up
    for (const request of production.values()) {
        const perProduct = new Map();
        for (const it of request.items) {
            const seen = perProduct.get(it.product_id);
            if (seen) seen.quantity += it.quantity;
            else perProduct.set(it.product_id, { ...it });
        }
        request.items = [...perProduct.values()];
    }

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

/*
    The duplicate-deduction guard for the two actions that move stock (approve, dispatch).
    A reject moves no stock and can only happen once (PENDING_APPROVAL -> REJECTED), so it needs no guard.
*/
function parseGuard(body, { action, orderId, userId, opts }) {
    const key = idem.parseKey(body && body.idempotency_key);
    const raw = body && body.expected_round;
    const expectedRound = raw === undefined || raw === null || raw === "" ? NaN : Number(raw);
    if (!Number.isInteger(expectedRound) || expectedRound < 0) {
        throw new AppError(
            422,
            "expected_round is required: send the approval_round of the order you were looking at",
            "EXPECTED_ROUND_REQUIRED",
            { field: "expected_round" }
        );
    }
    const { idempotency_key, ...payload } = body;
    return { key, expectedRound, action, userId, payload: { orderId, ...payload }, onReplay: opts && opts.onReplay };
}

/* Fails when the order moved on since the client looked at it (another approval pass was applied meanwhile). */
function assertCurrentRound(row, expectedRound) {
    const current = Number(row.approval_round) || 0;
    if (current !== expectedRound) {
        throw AppError.conflict(
            "This order changed since you opened it: an approval was already applied. Refresh the page and check the plan again.",
            "STALE_ROUND",
            { current_round: current }
        );
    }
}

/* The status row is the last write of the transaction: if it did not land, the stock + ledger rows written before it must not stay. */
function assertSaved(result) {
    if (!result || result.affectedRows !== 1) {
        throw AppError.conflict("The order could not be saved. Nothing was changed: refresh the page and try again.", "ORDER_NOT_SAVED");
    }
}

/*
    One transaction. With a guard, the request is claimed first, so a repeat of it is replayed instead of run.
    The ledger's UNIQUE key is the last line of defence: should it ever fire, nothing was committed.
*/
async function inGuardedTransaction(guard, work) {
    try {
        return await inventory.inTransaction((conn) => (guard ? idem.once(conn, guard, () => work(conn)) : work(conn)));
    } catch (error) {
        if (error && error.errno === 1062 && /uq_inv_txn_idempotency/.test(error.message || "")) {
            throw AppError.conflict("This approval was already applied. Refresh the page.", "ALREADY_APPLIED");
        }
        throw error;
    }
}

async function decide(orderId, decision, body, userId, opts) {
    const remarks = parseRemarks(body && body.remarks, { required: decision === "REJECTED" });
    const guard = decision === "APPROVED" ? parseGuard(body, { action: "order.approve", orderId, userId, opts }) : null;

    return inGuardedTransaction(guard, async (conn) => {
        // inventory.inTransaction() runs this function AGAIN after a deadlock / lock timeout. Everything that changes
        // while it runs therefore lives in locals: `decision` (what the caller asked for) must never be overwritten.
        let outcome = decision;
        const [rows] = await conn.query(`SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
        if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        const allowed = decision === "REJECTED" ? ["PENDING_APPROVAL"] : APPROVABLE;
        if (!allowed.includes(rows[0].approval_status)) {
            throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
        }
        if (guard) assertCurrentRound(rows[0], guard.expectedRound);
        let round = Number(rows[0].approval_round) || 0;

        if (decision === "APPROVED") {
            const plan = await computePlan(conn, orderId, { lock: true });
            const producible = await saveApprovalRequests(conn, orderId, plan, userId);
            round += 1;
            await issueApprovedMaterials(conn, orderId, producible, userId, round);
        }

        const [saved] = await conn.query(
            `UPDATE orders
             SET approval_status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW(),
                 inventory_issued_at = ${outcome === "REJECTED" ? "NULL" : "COALESCE(inventory_issued_at, NOW())"},
                 approval_round = ?
             WHERE id = ?`,
            [outcome, remarks, userId, round, orderId]
        );
        assertSaved(saved);
        return getOrder(orderId, conn);
    });
}

const approve = (orderId, body, userId, opts) => decide(orderId, "APPROVED", body, userId, opts);
const reject = (orderId, body, userId) => decide(orderId, "REJECTED", body, userId);

/* ------------------------------------------------------------------ planning + dispatch */

const toCents = (v) => Math.round(Number(v) * 100);

/*
    Loads what the planner needs for one order: its lines, each product's BOM and every component's on-hand stock.
    Reservations are not used. lock = true locks those inventory rows until the transaction ends (used by dispatch, so
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

    // Only an order that still waits for a decision is planned, so every ordered unit is open.
    const openItems = items.map((item) => ({ ...item, quantity: Number(item.quantity), ordered_total: Number(item.quantity), already_approved: 0 }));

    const [bomRows] = await conn.query(
        `SELECT pb.product_id, pb.component_id, pb.quantity_required, c.sku, c.name, c.unit
         FROM product_bom pb JOIN components c ON c.id = pb.component_id
         WHERE pb.product_id IN (?)
         ORDER BY pb.component_id, pb.product_id${lock ? " FOR UPDATE" : ""}`,
        [openItems.map((i) => i.product_id)]
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

    const componentIds = Object.keys(componentInfo).map(Number).sort((a, b) => a - b);
    const availableByComp = {};
    if (componentIds.length) {
        const [stock] = await conn.query(
            `SELECT component_id, quantity_on_hand FROM inventory WHERE component_id IN (?) ORDER BY component_id${lock ? " FOR UPDATE" : ""}`,
            [componentIds]
        );
        // No reservations: approval plans against current on-hand stock and immediately deducts it.
        for (const r of stock) availableByComp[r.component_id] = Number(r.quantity_on_hand);
    }

    const plan = planOrder({
        items: openItems.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
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
        // `ordered` = units of the order; ordered_total / already_approved are kept for older clients (always the same / 0)
        lines: plan.lines.map((l, index) => ({
            ...l,
            sku: byProduct.get(l.product_id).sku,
            name: byProduct.get(l.product_id).name,
            ordered_total: openItems[index].ordered_total,
            already_approved: openItems[index].already_approved,
        })),
    };
}

/* GET /order-approvals/:id/plan: only an order that still waits for a decision can be planned. */
async function getPlan(orderId, conn = db) {
    // The round is read BEFORE the plan on purpose: if another approval lands in between, the round we return is
    // already out of date and the dispatch that uses it is refused (STALE_ROUND) rather than applied to a newer plan.
    const [rows] = await conn.query(`SELECT approval_status, approval_round FROM orders WHERE id = ?`, [orderId]);
    if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
    if (!APPROVABLE.includes(rows[0].approval_status)) {
        throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
    }
    const plan = await computePlan(conn, orderId);
    return { ...plan, approval_round: Number(rows[0].approval_round) || 0 };
}

async function issueApprovedMaterials(conn, orderId, productionLines, userId, round = 1) {
    if (!productionLines.length) return;

    const [bomRows] = await conn.query(
        `SELECT pb.product_id, pb.component_id, pb.quantity_required
         FROM product_bom pb
         WHERE pb.product_id IN (?)
         ORDER BY pb.component_id, pb.product_id`,
        [productionLines.map((line) => line.product_id)]
    );
    const quantitiesByComponent = new Map();
    for (const row of bomRows) {
        const line = productionLines.find((item) => item.product_id === row.product_id);
        if (!line || row.quantity_required === null || Number(row.quantity_required) <= 0) continue;
        const cents = toCents(Number(row.quantity_required) * Number(line.can_make));
        quantitiesByComponent.set(row.component_id, (quantitiesByComponent.get(row.component_id) || 0) + cents);
    }

    for (const [componentId, cents] of [...quantitiesByComponent].sort(([a], [b]) => a - b)) {
        if (cents <= 0) continue;
        const quantity = (cents / 100).toFixed(2);
        const [updated] = await conn.query(
            `UPDATE inventory
             SET quantity_on_hand = quantity_on_hand - ?
             WHERE component_id = ? AND quantity_on_hand >= ?`,
            [quantity, componentId, quantity]
        );
        if (updated.affectedRows !== 1) {
            throw AppError.conflict("Stock changed while approving this order. Refresh the stock plan and try again.", "STALE_PLAN");
        }
        const [stock] = await conn.query(`SELECT quantity_on_hand FROM inventory WHERE component_id = ?`, [componentId]);
        const [result] = await conn.query(
            `INSERT INTO inventory_transactions
                (component_id, transaction_type, direction, quantity, balance_after, reason, reason_code, reference_type, reference_id, created_by, order_id, idempotency_key)
             VALUES (?, 'CONSUMED', 'OUT', ?, ?, ?, 'ISSUED_TO_PRODUCTION', 'ORDER_APPROVAL', ?, ?, ?, ?)`,
            [
                componentId,
                quantity,
                stock[0].quantity_on_hand,
                `Issued to production for order #${orderId}`,
                orderId,
                userId,
                orderId,
                `approval-${orderId}-${round}-${componentId}`,
            ]
        );
        if (!result.insertId) throw new Error(`Failed to record inventory issue for component ${componentId}`);
    }
}

async function saveApprovalRequests(conn, orderId, plan, userId, producible = plan.lines.filter((line) => line.can_make > 0)) {
    if (producible.length) {
        await conn.query(
            `INSERT INTO order_production_items (order_id, product_id, quantity, sent_by) VALUES ?`,
            [producible.map((line) => [orderId, line.product_id, line.can_make, userId])]
        );
    }
    if (plan.shortages.length) {
        await conn.query(
            `INSERT INTO order_purchase_items (order_id, component_id, quantity, sent_by) VALUES ?`,
            [plan.shortages.map((shortage) => [orderId, shortage.component_id, shortage.shortage, userId])]
        );
    }
    return producible;
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
    POST /order-approvals/:id/dispatch  { idempotency_key, expected_round, remarks?, production_items: [{ product_id, quantity }], purchase_items: [{ component_id, quantity }] }
    The two lists are what the admin saw on screen. The plan is calculated again under a lock; if stock changed in the
    meantime the lists no longer match and the whole request is refused with 409 STALE_PLAN (nothing is saved).
*/
async function dispatch(orderId, body, userId, opts) {
    const guard = parseGuard(body, { action: "order.dispatch", orderId, userId, opts });
    const remarks = parseRemarks(body && body.remarks, { required: false });
    const sentProduction = parseList(body && body.production_items, "product_id", "production_items");
    const sentPurchase = parseList(body && body.purchase_items, "component_id", "purchase_items");
    if (sentProduction.size === 0 && sentPurchase.size === 0) {
        throw new AppError(422, "There is nothing to send: no product can be made now and no component is short.", "VALIDATION");
    }

    return inGuardedTransaction(guard, async (conn) => {
        const [rows] = await conn.query(`SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
        if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (!APPROVABLE.includes(rows[0].approval_status)) {
            throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
        }
        assertCurrentRound(rows[0], guard.expectedRound);
        const plan = await computePlan(conn, orderId, { lock: true });
        const expectedPurchase = new Map(plan.shortages.map((s) => [s.component_id, toCents(s.shortage)]));

        const availableByProduct = new Map(plan.lines.map((line) => [line.product_id, line]));
        const selectedProduction = [];
        for (const [productId, quantityCents] of sentProduction) {
            const line = availableByProduct.get(productId);
            if (!line || quantityCents % 100 !== 0) {
                throw new AppError(422, "Selected production quantity must be a whole number within the available stock plan.", "VALIDATION", { field: "production_items" });
            }
            if (quantityCents > toCents(line.can_make)) {
                throw AppError.conflict(
                    "Stock changed while you were reviewing this order. The plan has been refreshed: check it and send again.",
                    "STALE_PLAN"
                );
            }
            selectedProduction.push({ ...line, can_make: quantityCents / 100 });
        }

        // no partial approval: what is sent must be exactly what the stock covers now (production) and what is short (purchase)
        const expectedProduction = new Map(plan.lines.filter((l) => toCents(l.can_make) > 0).map((l) => [l.product_id, toCents(l.can_make)]));
        if (!sameList(sentProduction, expectedProduction) || !sameList(sentPurchase, expectedPurchase)) {
            throw AppError.conflict(
                "Stock changed while you were reviewing this order. The plan has been refreshed: check it and send again.",
                "STALE_PLAN"
            );
        }

        const round = (Number(rows[0].approval_round) || 0) + 1;
        await saveApprovalRequests(conn, orderId, plan, userId, selectedProduction);
        await issueApprovedMaterials(conn, orderId, selectedProduction, userId, round);
        const [saved] = await conn.query(
            `UPDATE orders
             SET approval_status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW(),
                 inventory_issued_at = COALESCE(inventory_issued_at, NOW()), approval_round = ?
             WHERE id = ?`,
            ["APPROVED", remarks, userId, round, orderId]
        );
        assertSaved(saved);
        return getOrder(orderId, conn);
    });
}

module.exports = { APPROVAL_STATUSES, listOrders, getOrder, getOrdersByIds, approve, reject, getPlan, dispatch };
