const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../../store/inventory/inventory.service");
const notifications = require("../../core/notifications/notification.service");
const idem = require("../../shared/idempotency");
const { planOrder } = require("./order-planner");

/*
    Order approval.  Every new order starts as PENDING_APPROVAL.
        Operations Admin:  approve  -> APPROVED   (the order now shows in the Purchase Manager's "Approved orders" list)
                           reject   -> REJECTED   (remarks are required)
    A decision is final: only PENDING_APPROVAL orders can be decided (row is locked, so a double click or two
    admins deciding at once can never decide the same order twice).

    Three separate steps, each one button for the Operations Admin:
      1. approve()          The decision only: the order becomes APPROVED and the Marketing Manager is told. No stock
                            moves and no list is sent.
      2. sendToPurchase()   On an APPROVED order: the components that are short for the units not in Production yet go
                            to the Purchase Manager. Once per order.
      3. sendToProduction() On an APPROVED order: what the stock can build NOW of the units not in Production yet goes
                            to the Production Manager, and its stock is deducted at that moment (stock ledger). Again
                            whenever more parts come in, until every unit is in Production. Store hands the deducted
                            materials over later (never more than was sent, see material-request.service.js) and does
                            not deduct again.
    Rejecting is only possible while the order is PENDING_APPROVAL.

    Each purchase line (purchase_request.items[]) carries request_item_id (the id the Purchase Manager sends back to place the
    order) and purchase_order_id / po_number / po_status: null while the line is still "to order".

    The same READ side feeds both screens (Operations Admin = all, Purchase Manager = APPROVED only), so the
    numbers always match.

    No double deductions.  sendToProduction() moves stock, so each request must be applied at most once. Three
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

    Quantity revision (revise): while an order waits, the admin can say "we will make only this much for now".
        PENDING_APPROVAL --revise--> QUANTITY_REVISED --Marketing accepts (marketing-orders)--> PENDING_APPROVAL
    The order keeps only the quantities the admin will make; the rest is dropped (no draft is made for it: if the
    customer still wants it, Marketing places a new order). orders.revision keeps requested / approved / held per
    product. An order can be revised once; it moves no stock.
*/

const APPROVAL_STATUSES = ["PENDING_APPROVAL", "QUANTITY_REVISED", "APPROVED", "REJECTED", "CANCELLED"]; // DRAFT is marketing-only: never listed here
const MAX_REMARKS = 500;
const APPROVABLE = ["PENDING_APPROVAL"]; // statuses an order can be approved from
// the stock check (GET .../plan) is shown while the order waits, and on an APPROVED order for the units not in Production yet
const plannable = (status) => APPROVABLE.includes(status) || status === "APPROVED";

const ORDER_SELECT = `
    SELECT
        o.id,
        o.order_number,
        o.customer_id,
        cust.name AS customer_name,
        o.status,
        o.approval_status,
        o.approval_round,
        o.approval_remarks,
        o.parent_order_id,
        pa.order_number AS parent_order_number,
        o.revision,
        ru.name AS revised_by_name,
        DATE_FORMAT(o.revised_at, '%Y-%m-%d %H:%i:%s') AS revised_at,
        mu.name AS revision_accepted_by_name,
        DATE_FORMAT(o.revision_accepted_at, '%Y-%m-%d %H:%i:%s') AS revision_accepted_at,
        cu.name AS created_by_name,
        cu.role AS created_by_role,
        DATE_FORMAT(o.sent_to_admin_at, '%Y-%m-%d %H:%i:%s') AS sent_to_admin_at,
        DATE_FORMAT(o.required_by_date, '%Y-%m-%d') AS required_by_date,
        DATE_FORMAT(o.estimated_delivery_date, '%Y-%m-%d') AS estimated_delivery_date,
        au.name AS approved_by_name,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(o.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
    FROM orders o
    LEFT JOIN users cu ON cu.id = o.created_by
    LEFT JOIN users au ON au.id = o.approved_by
    LEFT JOIN users ru ON ru.id = o.revised_by
    LEFT JOIN users mu ON mu.id = o.revision_accepted_by
    LEFT JOIN orders pa ON pa.id = o.parent_order_id
    LEFT JOIN customers cust ON cust.id = o.customer_id
`;

const asObject = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? null);
// "2026-11-30" -> "30 Nov 2026" (for notification text)
const fmtDate = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* Attaches the product lines (one query for all orders) and totals. */
async function withItems(conn, orders) {
    if (orders.length === 0) return [];

    const [items] = await conn.query(
        `SELECT oi.order_id, oi.product_id, p.sku, p.name, oi.quantity, p.selling_price, oi.agreed_rate, oi.agreed_note
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (?)
         ORDER BY oi.id`,
        [orders.map((o) => o.id)]
    );

    const byOrder = new Map();
    for (const it of items) {
        if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
        // price = the rate agreed on the order (rate lock), else the product's price list today; null when neither
        // list_price = the price list, to show an agreed discount against it
        const { selling_price, agreed_rate, ...line } = it;
        const listPrice = selling_price == null ? null : Number(selling_price);
        const agreed = agreed_rate == null ? null : Number(agreed_rate);
        byOrder.get(it.order_id).push({ ...line, quantity: Number(it.quantity), price: agreed ?? listPrice, list_price: listPrice, agreed_rate: agreed });
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

    // the order's story, oldest first (order_events)
    const [eventRows] = await conn.query(
        `SELECT e.order_id, e.kind, e.quantity, e.detail, DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS at,
                u.name AS by_name, u.role AS by_role
         FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.order_id IN (?) ORDER BY e.id`,
        [ids]
    );
    // units already given to the customer (finished goods handed out by the Store)
    const [deliveredRows] = await conn.query(
        `SELECT order_id, SUM(quantity) AS units FROM finished_goods
         WHERE order_id IN (?) AND status = 'DELIVERED' GROUP BY order_id`,
        [ids]
    );
    const deliveredOf = new Map(deliveredRows.map((r) => [r.order_id, Number(r.units)]));

    const eventsOf = new Map();
    for (const { order_id, detail, quantity, ...e } of eventRows) {
        if (!eventsOf.has(order_id)) eventsOf.set(order_id, []);
        eventsOf.get(order_id).push({ ...e, quantity: quantity === null ? null : Number(quantity), detail: asObject(detail) });
    }

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
        const approvedUnits = (production.get(o.id)?.items || []).reduce((s, i) => s + i.quantity, 0);
        const orderedUnits = lines.reduce((s, l) => s + l.quantity, 0);
        return {
            ...o,
            // units of an APPROVED order not sent to Production yet (their parts are short): sent once the parts are in
            left_to_send: o.approval_status === "APPROVED" ? Math.max(0, orderedUnits - approvedUnits) : 0,
            // units given out to the customer so far (all ordered units given out = the order is delivered)
            delivered_units: deliveredOf.get(o.id) || 0,
            // { remarks, items: [{ product_id, sku, name, requested, approved, held }] } or null
            // (orders revised before 2026-10-28 also carry held_order_id / held_order_number: the draft made back then)
            revision: asObject(o.revision),
            items: lines,
            // value = units x agreed rate (else price list: an estimate, the bill sets the real rate); unpriced = no price yet
            totals: {
                lines: lines.length,
                quantity: lines.reduce((s, l) => s + l.quantity, 0),
                value: Math.round(lines.reduce((s, l) => s + (l.price === null ? 0 : l.quantity * l.price), 0) * 100) / 100,
                unpriced: lines.filter((l) => l.price === null).length,
            },
            // what the Operations Admin sent on approval; null when nothing was sent
            production_request: production.get(o.id) || null,
            purchase_request: purchase.get(o.id) || null,
            // the story between Marketing and the Operations Admin, step by step (see logEvent)
            events: eventsOf.get(o.id) || [],
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

function parseRemarks(raw, { required, missing = "Please write the reason for rejecting this order (at least 3 characters)" }) {
    const remarks = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (required && remarks.length < 3) {
        throw new AppError(422, missing, "VALIDATION", { field: "remarks" });
    }
    if (remarks.length > MAX_REMARKS) {
        throw new AppError(422, `Remarks must be ${MAX_REMARKS} characters or fewer`, "VALIDATION", { field: "remarks" });
    }
    return remarks || null;
}

/*
    The duplicate-deduction guard for approve and sendToProduction (the one that moves stock).
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

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/*
    One step of the order's story (order_events): who did it, how many units it was about, and the details the
    Timeline shows. Written inside the step's own transaction, so a step that fails leaves no line behind.
*/
async function logEvent(conn, orderId, kind, userId, { quantity = null, detail = null } = {}) {
    await conn.query(
        `INSERT INTO order_events (order_id, kind, actor_id, quantity, detail) VALUES (?, ?, ?, ?, ?)`,
        [orderId, kind, userId || null, quantity === null ? null : Math.round(quantity), detail === null ? null : JSON.stringify(detail)]
    );
}

/* Units of the order as it stands. */
async function unitsOf(conn, orderId) {
    const [[row]] = await conn.query(`SELECT COALESCE(SUM(quantity), 0) AS n FROM order_items WHERE order_id = ?`, [orderId]);
    return Number(row.n);
}

/* The decision (approved / rejected): only Marketing hears it. Saved inside the decision's transaction. */
async function notifyDecision(conn, orderId, { approved, remarks, userId }) {
    const [rows] = await conn.query(
        `SELECT o.order_number, u.role AS creator_role FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?`,
        [orderId]
    );
    // a customer order (made by Marketing, or by the Super Admin doing Marketing's work)
    if (!rows[0] || !["MARKETING_MANAGER", "SUPER_ADMIN"].includes(rows[0].creator_role)) return;
    const number = rows[0].order_number || `#${orderId}`;
    const common = { orderId, userId, payload: { order_number: number }, link: `/marketing-orders?order=${orderId}`, role: "MARKETING_MANAGER" };
    await notifications.notify(conn, approved
        ? { ...common, type: "ORDER_APPROVED", severity: "success", title: `Order ${number} approved`, body: remarks || "The Operations Admin approved your order." }
        : { ...common, type: "ORDER_REJECTED", severity: "warning", title: `Order ${number} rejected`, body: remarks || "The Operations Admin rejected your order." });
}

async function orderNumberOf(conn, orderId) {
    const [rows] = await conn.query(`SELECT order_number FROM orders WHERE id = ?`, [orderId]);
    return (rows[0] && rows[0].order_number) || `#${orderId}`;
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

        // the decision only: no stock moves and no list goes out (sendToPurchase / sendToProduction do that)
        const [saved] = await conn.query(
            `UPDATE orders SET approval_status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
            [outcome, remarks, userId, orderId]
        );
        assertSaved(saved);
        await logEvent(conn, orderId, outcome, userId, { quantity: await unitsOf(conn, orderId), detail: remarks ? { remarks } : null });
        await notifyDecision(conn, orderId, { approved: outcome === "APPROVED", remarks, userId });
        return getOrder(orderId, conn);
    });
}

const approve = (orderId, body, userId, opts) => decide(orderId, "APPROVED", body, userId, opts);
const reject = (orderId, body, userId) => decide(orderId, "REJECTED", body, userId);

/* ------------------------------------------------------------------ planning + sending to Production / Purchase */

const toCents = (v) => Math.round(Number(v) * 100);

/*
    Loads what the planner needs for one order: its lines, each product's BOM and every component's on-hand stock.
    Reservations are not used. lock = true locks those inventory rows until the transaction ends (used by the sends, so
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

    // open units = ordered - already approved (0 for an order that still waits; the rest for an APPROVED order)
    const [approvedRows] = await conn.query(
        `SELECT product_id, SUM(quantity) AS quantity FROM order_production_items WHERE order_id = ? GROUP BY product_id`,
        [orderId]
    );
    const approvedOf = new Map(approvedRows.map((r) => [r.product_id, Number(r.quantity)]));
    const openItems = items
        .map((item) => {
            const ordered = Number(item.quantity);
            const already = Math.min(ordered, approvedOf.get(item.product_id) || 0);
            return { ...item, quantity: ordered - already, ordered_total: ordered, already_approved: already };
        })
        .filter((item) => item.quantity > 0);
    if (openItems.length === 0) throw AppError.conflict("Every unit of this order has already been sent to Production.", "NOTHING_LEFT");

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
        // `ordered` = units still to approve; ordered_total = units of the order; already_approved = sent to Production before
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
    // already out of date and the send that uses it is refused (STALE_ROUND) rather than applied to a newer plan.
    const [rows] = await conn.query(`SELECT approval_status, approval_round FROM orders WHERE id = ?`, [orderId]);
    if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
    if (!plannable(rows[0].approval_status)) {
        throw AppError.conflict("This order has already been decided. Refresh the page.", "ALREADY_DECIDED");
    }
    const plan = await computePlan(conn, orderId);
    const [[sent]] = await conn.query(`SELECT COUNT(*) AS n FROM order_purchase_items WHERE order_id = ?`, [orderId]);
    // purchase_sent: the component list already went to Purchase (it is sent once per order)
    return { ...plan, approval_round: Number(rows[0].approval_round) || 0, purchase_sent: Number(sent.n) > 0 };
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

/* one row per order + product: a later send adds to it */
async function saveProductionLines(conn, orderId, lines, userId) {
    await conn.query(
        `INSERT INTO order_production_items (order_id, product_id, quantity, sent_by) VALUES ?
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [lines.map((line) => [orderId, line.product_id, line.can_make, userId])]
    );
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

const STALE = () => AppError.conflict(
    "Stock changed while you were reviewing this order. The stock check has been refreshed: check it and send again.",
    "STALE_PLAN"
);

/* Locks an APPROVED order (the two sends only work on one) and returns its row. */
async function lockApproved(conn, orderId) {
    const [rows] = await conn.query(`SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
    if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
    if (rows[0].approval_status !== "APPROVED") {
        throw AppError.conflict("Approve the order first. Lists can only be sent for an approved order.", "NOT_APPROVED");
    }
    return rows[0];
}

/*
    POST /order-approvals/:id/send-to-production  { idempotency_key, expected_round, production_items: [{ product_id, quantity }] }
    production_items = what the admin saw on screen: everything the stock can build now of the units not in Production
    yet. The plan is worked out again under a lock; if stock changed meanwhile the list no longer matches and nothing
    is saved (409 STALE_PLAN). The stock of those units is deducted now. Can be sent again when more parts come in.
*/
async function sendToProduction(orderId, body, userId, opts) {
    const guard = parseGuard(body, { action: "order.send-to-production", orderId, userId, opts });
    const sent = parseList(body && body.production_items, "product_id", "production_items");
    if (sent.size === 0) throw new AppError(422, "Nothing can be built from the current stock yet: wait until the parts are in.", "NOTHING_TO_BUILD");

    return inGuardedTransaction(guard, async (conn) => {
        const row = await lockApproved(conn, orderId);
        assertCurrentRound(row, guard.expectedRound);
        const plan = await computePlan(conn, orderId, { lock: true });
        const expected = new Map(plan.lines.filter((l) => toCents(l.can_make) > 0).map((l) => [l.product_id, toCents(l.can_make)]));
        if (expected.size === 0) throw new AppError(422, "Nothing can be built from the current stock yet: wait until the parts are in.", "NOTHING_TO_BUILD");
        if (!sameList(sent, expected)) throw STALE();
        const lines = plan.lines.filter((l) => expected.has(l.product_id));

        const [[before]] = await conn.query(`SELECT COUNT(*) AS n FROM order_production_items WHERE order_id = ?`, [orderId]);
        const round = (Number(row.approval_round) || 0) + 1;
        await saveProductionLines(conn, orderId, lines, userId);
        await issueApprovedMaterials(conn, orderId, lines, userId, round);
        const [saved] = await conn.query(
            `UPDATE orders SET approval_round = ?, inventory_issued_at = COALESCE(inventory_issued_at, NOW()) WHERE id = ?`,
            [round, orderId]
        );
        assertSaved(saved);

        await logEvent(conn, orderId, "SENT_TO_PRODUCTION", userId, {
            quantity: lines.reduce((s, l) => s + Number(l.can_make), 0),
            detail: { lines: lines.map((l) => ({ name: l.name, quantity: Number(l.can_make) })) },
        });
        const number = await orderNumberOf(conn, orderId);
        const first = Number(before.n) === 0;
        await notifications.notify(conn, {
            orderId, userId, payload: { order_number: number },
            role: "PRODUCTION_MANAGER", type: "PRODUCTION_ASSIGNED", severity: "action", link: "/production",
            title: first ? `Order ${number} is ready for production` : `More of order ${number} can be built`,
            body: `${lines.map((l) => `${l.can_make} ${l.name || "units"}`).join(", ")} to build. Request the materials from the store.`.slice(0, 500),
        });
        return getOrder(orderId, conn);
    });
}

/*
    POST /order-approvals/:id/send-to-purchase  { purchase_items: [{ component_id, quantity }] }
    purchase_items = what the admin saw on screen: the components short for the units not in Production yet. Sent once
    per order; the plan is worked out again under a lock and a list that no longer matches is refused (409 STALE_PLAN).
    No stock moves.
*/
async function sendToPurchase(orderId, body, userId) {
    const sent = parseList(body && body.purchase_items, "component_id", "purchase_items");

    return inventory.inTransaction(async (conn) => {
        await lockApproved(conn, orderId);
        const [[already]] = await conn.query(`SELECT COUNT(*) AS n FROM order_purchase_items WHERE order_id = ?`, [orderId]);
        if (Number(already.n) > 0) throw AppError.conflict("The component list of this order was already sent to Purchase.", "ALREADY_SENT");
        const plan = await computePlan(conn, orderId, { lock: true });
        if (plan.shortages.length === 0) throw new AppError(422, "Nothing is short: every component is in stock.", "NOTHING_TO_BUY");
        if (!sameList(sent, new Map(plan.shortages.map((x) => [x.component_id, toCents(x.shortage)])))) throw STALE();

        await conn.query(
            `INSERT INTO order_purchase_items (order_id, component_id, quantity, sent_by) VALUES ?`,
            [plan.shortages.map((x) => [orderId, x.component_id, x.shortage, userId])]
        );
        // quantity = units the parts are for (the ones not in Production yet)
        await logEvent(conn, orderId, "SENT_TO_PURCHASE", userId, {
            quantity: plan.lines.reduce((s, l) => s + Number(l.ordered), 0),
            detail: { components: plan.shortages.length },
        });
        const number = await orderNumberOf(conn, orderId);
        await notifications.notify(conn, {
            orderId, userId, payload: { order_number: number },
            role: "PURCHASE_MANAGER", type: "PURCHASE_REQUIRED", severity: "action", link: `/approved-orders?order=${orderId}`,
            title: `${count(plan.shortages.length, "component")} to buy for order ${number}`,
            body: "The Operations Admin sent the list of components to buy. Raise the purchase from Approved Orders.",
        });
        return getOrder(orderId, conn);
    });
}

/* ------------------------------------------------------------------ quantity revision */

/* [{ product_id, quantity }] -> Map(product_id -> units the admin will make). Whole numbers, 0 allowed. */
function parseRevisedItems(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new AppError(422, "Enter the quantity you will make for each product", "VALIDATION", { field: "items" });
    }
    const out = new Map();
    for (const row of raw) {
        const id = Number(row && row.product_id);
        const qty = Number(row && row.quantity);
        if (!Number.isInteger(id) || id <= 0) throw new AppError(422, "items has an invalid product", "VALIDATION", { field: "items" });
        if (!Number.isInteger(qty) || qty < 0) {
            throw new AppError(422, "Quantity must be a whole number, 0 or more", "VALIDATION", { field: "items", product_id: id });
        }
        if (out.has(id)) throw new AppError(422, "items lists the same product twice", "VALIDATION", { field: "items" });
        out.set(id, qty);
    }
    return out;
}

/*
    POST /order-approvals/:id/revise  { items: [{ product_id, quantity }], remarks }
    quantity = what the admin promises to make (a product left out keeps its full quantity), anything up to what was
    ordered: the admin's own call, not tied to the stock on the shelf. What the stock cannot cover is bought after
    approval. Splits the order: the original keeps those quantities and goes to QUANTITY_REVISED (waits for Marketing),
    the rest becomes a new marketing DRAFT.
*/
async function revise(orderId, body, userId) {
    const remarks = parseRemarks(body && body.remarks, { required: true, missing: "Tell the Marketing Manager why the quantity is reduced (at least 3 characters)" });
    const wanted = parseRevisedItems(body && body.items);

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT o.id, o.order_number, o.approval_status, o.revision, o.created_by, o.estimated_delivery_date, o.customer_id, u.role AS creator_role
             FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        if (rows.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        const order = rows[0];
        if (order.approval_status !== "PENDING_APPROVAL") {
            throw AppError.conflict("This order is no longer waiting for your decision. Refresh the page.", "ALREADY_DECIDED");
        }
        if (order.revision) throw AppError.conflict("The quantity of this order was already revised once.", "ALREADY_REVISED");
        if (!["MARKETING_MANAGER", "SUPER_ADMIN"].includes(order.creator_role)) {
            throw new AppError(422, "Only orders raised by Marketing (or the Super Admin) can be revised: approve or reject this one.", "NOT_MARKETING_ORDER");
        }

        const [lines] = await conn.query(
            `SELECT oi.id, oi.product_id, p.sku, p.name, oi.quantity
             FROM order_items oi JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ? ORDER BY oi.id FOR UPDATE`,
            [orderId]
        );
        const known = new Set(lines.map((l) => l.product_id));
        for (const id of wanted.keys()) {
            if (!known.has(id)) throw new AppError(422, "A product in the list is not part of this order", "VALIDATION", { field: "items", product_id: id });
        }

        const items = lines.map((l) => {
            const requested = Number(l.quantity);
            const approved = wanted.has(l.product_id) ? wanted.get(l.product_id) : requested;
            if (approved > requested) {
                throw new AppError(422, `${l.name}: you can make at most the ${requested} units that were ordered`, "VALIDATION", { field: "items", product_id: l.product_id });
            }
            return { line_id: l.id, product_id: l.product_id, sku: l.sku, name: l.name, requested, approved, held: requested - approved };
        });
        if (items.every((i) => i.held === 0)) {
            throw new AppError(422, "Nothing was reduced. To make the full order, use Check stock & send.", "VALIDATION", { field: "items" });
        }
        if (items.every((i) => i.approved === 0)) {
            throw new AppError(422, "You would make nothing of this order: reject it instead.", "VALIDATION", { field: "items" });
        }

        // 1) the original keeps what will be made
        for (const i of items) {
            if (i.approved === 0) await conn.query(`DELETE FROM order_items WHERE id = ?`, [i.line_id]);
            else if (i.held > 0) await conn.query(`UPDATE order_items SET quantity = ? WHERE id = ?`, [i.approved, i.line_id]);
        }

        // 2) the units not made are dropped: no draft is made for them. If the customer still wants them, Marketing
        //    places a new order itself.
        const requestedUnits = items.reduce((s, i) => s + i.requested, 0);
        const approvedUnits = items.reduce((s, i) => s + i.approved, 0);

        // 3) the order now waits for Marketing to agree
        const revision = { remarks, items: items.map(({ line_id, ...i }) => i) };
        const [saved] = await conn.query(
            `UPDATE orders SET approval_status = 'QUANTITY_REVISED', revision = ?, revised_by = ?, revised_at = NOW() WHERE id = ?`,
            [JSON.stringify(revision), userId, orderId]
        );
        assertSaved(saved);
        await logEvent(conn, orderId, "REVISED", userId, {
            quantity: approvedUnits,
            detail: { requested: requestedUnits, remarks },
        });

        await notifications.notify(conn, {
            role: "MARKETING_MANAGER",
            type: "QUANTITY_REVISED",
            title: `Quantity reduced on order ${order.order_number}`,
            body: `The Operations Admin can make ${approvedUnits} of the ${requestedUnits} units. Accept or decline. If the customer still needs the rest, place a new order.`,
            severity: "action",
            link: `/marketing-orders?order=${orderId}`,
            orderId,
            payload: { order_number: order.order_number, remarks },
            userId,
        });
        return getOrder(orderId, conn);
    });
}

async function updateDeliveryDate(orderId, body, user) {
    const newDate = (body && (body.estimated_delivery_date || body.estimatedDeliveryDate)) || null;
    const reason = (body && body.reason) || null;
    if (!newDate) {
        throw new AppError(422, "Estimated delivery date is required", "VALIDATION");
    }

    return inventory.inTransaction(async (conn) => {
        const [orders] = await conn.query(
            `SELECT id, order_number, approval_status, DATE_FORMAT(estimated_delivery_date, '%Y-%m-%d') AS old_date,
                    DATE_FORMAT(required_by_date, '%Y-%m-%d') AS required_by
             FROM orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );
        if (orders.length === 0) throw AppError.notFound("Order not found", "NOT_FOUND");
        const order = orders[0];
        const oldDate = order.old_date;

        await conn.query(`UPDATE orders SET estimated_delivery_date = ? WHERE id = ?`, [newDate, orderId]);

        if (oldDate !== newDate) {
            await notifications.notify(conn, {
                role: "MARKETING_MANAGER",
                type: "DELIVERY_DATE_CHANGED",
                title: `Delivery date changed for order ${order.order_number}`,
                // the customer's own date, when the new one misses it: that is the call Marketing has to make
                body: `${oldDate ? `${fmtDate(oldDate)} → ` : "Set to "}${fmtDate(newDate)}${order.required_by && newDate > order.required_by ? ` · customer wants it by ${fmtDate(order.required_by)}` : ""}${reason ? ` · ${reason}` : ""}`,
                severity: "warning",
                link: `/marketing-orders?order=${orderId}`,
                orderId,
                payload: { order_number: order.order_number, old_date: oldDate || null, new_date: newDate, reason },
                userId: user.id
            });
        }

        return getOrder(orderId, conn);
    });
}

/*
    Cancel an APPROVED order (Operations Admin / Super Admin, reason required) while it has NOT been sent on: nothing
    went to Production (no stock taken) and no list went to Purchase. So there is nothing to give back and only
    Marketing is told. Once it was sent on, cancel is refused (ALREADY_SENT_ON): the units it makes become product stock.
    (Orders cancelled before 2026-10-28 could be cancelled later; their stock came back as RETURNED_FROM_ORDER rows,
    which Inventory History still counts.)
*/
async function cancel(orderId, body, userId) {
    const remarks = parseRemarks(body && body.remarks, {
        required: true,
        missing: "Please write why this order is cancelled (at least 3 characters)",
    });

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT id, order_number, status, approval_status FROM orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );
        if (!rows.length) throw AppError.notFound("Order not found", "NOT_FOUND");
        const order = rows[0];
        if (order.approval_status !== "APPROVED") {
            throw AppError.conflict("Only an approved order can be cancelled (a waiting order is rejected instead).", "NOT_APPROVED");
        }
        // only while it has not been sent on: nothing has left the shelf, nobody else has work for it yet. Once it went
        // to Production or Purchase, stock and parts are moving and are not pulled back (the units it makes are stock).
        const [[sentOn]] = await conn.query(
            `SELECT (SELECT COUNT(*) FROM order_production_items WHERE order_id = ?) + (SELECT COUNT(*) FROM order_purchase_items WHERE order_id = ?) AS n`,
            [orderId, orderId]
        );
        if (Number(sentOn.n) > 0) {
            throw AppError.conflict("This order was already sent to Production or Purchase, so it can no longer be cancelled.", "ALREADY_SENT_ON");
        }

        assertSaved((await conn.query(
            `UPDATE orders
             SET approval_status = 'CANCELLED', status = 'CANCELLED', approval_remarks = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND approval_status = 'APPROVED'`,
            [remarks, orderId]
        ))[0]);

        await notifications.notify(conn, {
            orderId, userId, payload: { order_number: order.order_number },
            role: "MARKETING_MANAGER", type: "ORDER_CANCELLED", severity: "warning",
            link: `/marketing-orders?order=${orderId}`, title: `Order ${order.order_number} cancelled`, body: `Reason: ${remarks}`,
        });

        return { id: orderId, approval_status: "CANCELLED" };
    });
}

module.exports = {
    logEvent, unitsOf, updateDeliveryDate, APPROVAL_STATUSES, listOrders, getOrder, getOrdersByIds, approve, reject, cancel, getPlan,
    sendToProduction, sendToPurchase, revise };
