const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const notifications = require("../../core/notifications/notification.service");
const { inTransaction, postIssueLine, parseQty, fromCents } = require("../inventory/inventory.service");

/*
    Extra material: a piece got damaged during production (or a QC-failed batch needs new parts), so the worker
    needs MORE components than the order's plan. Production asks with a valid reason; Store issues it (a real
    stock-out in the component ledger, tied to the order) or rejects it with a note.
*/
const REASONS = {
    DAMAGED: "Piece damaged during production",
    PRODUCTION_WASTAGE: "Material wasted during production",
    REWORK: "Rework after a QC fail",
};

function cleanText(raw, max = 255) {
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (text.length > max) throw new AppError(422, `Text must be ${max} characters or fewer`, "VALIDATION");
    return text;
}

const SELECT = `
    SELECT r.id, r.order_id, o.order_number, r.component_id, c.sku, c.name AS component_name, c.unit,
           r.quantity, r.reason_code, r.reason, r.status, r.requested_at, r.decided_at, r.decision_note,
           COALESCE(i.quantity_on_hand, 0) AS on_hand,
           ru.name AS requested_by_name, du.name AS decided_by_name
    FROM extra_material_requests r
    JOIN orders o ON o.id = r.order_id
    JOIN components c ON c.id = r.component_id
    LEFT JOIN inventory i ON i.component_id = r.component_id
    LEFT JOIN users ru ON ru.id = r.requested_by
    LEFT JOIN users du ON du.id = r.decided_by
`;

const mapRow = (r) => ({
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    componentId: r.component_id,
    sku: r.sku,
    componentName: r.component_name,
    unit: r.unit,
    quantity: Number(r.quantity),
    onHand: Number(r.on_hand),
    reasonCode: r.reason_code,
    reasonLabel: REASONS[r.reason_code] || r.reason_code,
    reason: r.reason,
    status: r.status,
    requestedAt: r.requested_at,
    requestedByName: r.requested_by_name,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name,
    decisionNote: r.decision_note,
});

async function list() {
    const [rows] = await db.query(`${SELECT} ORDER BY r.status = 'PENDING' DESC, r.id DESC LIMIT 300`);
    return rows.map(mapRow);
}

/* orders that are in production, each with the components of its products' BOM (what the form offers) */
async function options() {
    const [rows] = await db.query(
        `SELECT DISTINCT o.id AS order_id, o.order_number, p.name AS product_name,
                c.id AS component_id, c.sku, c.name AS component_name, c.unit
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         JOIN product_bom pb ON pb.product_id = oi.product_id
         JOIN components c ON c.id = pb.component_id
         WHERE o.status IN ('IN_PRODUCTION', 'TESTING')
         ORDER BY o.id DESC, p.name, c.name`
    );
    const orders = new Map();
    for (const r of rows) {
        if (!orders.has(r.order_id)) orders.set(r.order_id, { orderId: r.order_id, orderNumber: r.order_number, components: [] });
        orders.get(r.order_id).components.push({
            componentId: r.component_id, sku: r.sku, name: r.component_name, unit: r.unit, productName: r.product_name,
        });
    }
    return [...orders.values()];
}

async function create(body, userId) {
    const orderId = Number(body.order_id);
    const componentId = Number(body.component_id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new AppError(422, "Select the order", "VALIDATION");
    if (!Number.isInteger(componentId) || componentId <= 0) throw new AppError(422, "Select the component", "VALIDATION");
    const cents = parseQty(body.quantity, "Quantity");
    const reasonCode = String(body.reason_code || "").toUpperCase();
    if (!REASONS[reasonCode]) throw new AppError(422, "Select why the extra material is needed", "VALIDATION");
    const reason = cleanText(body.reason);
    if (reason.length < 5) throw new AppError(422, "Explain what happened (at least 5 characters)", "VALIDATION");

    return inTransaction(async (conn) => {
        const [orders] = await conn.query(`SELECT id, order_number, status FROM orders WHERE id = ?`, [orderId]);
        if (!orders.length) throw new AppError(422, "Order not found", "VALIDATION");
        if (!["IN_PRODUCTION", "TESTING"].includes(orders[0].status)) {
            throw new AppError(409, "Extra material can be asked only while the order is in production", "WRONG_STATUS");
        }
        const [components] = await conn.query(`SELECT id, name, unit FROM components WHERE id = ?`, [componentId]);
        if (!components.length) throw new AppError(422, "Component not found", "VALIDATION");

        const [result] = await conn.query(
            `INSERT INTO extra_material_requests (order_id, component_id, quantity, reason_code, reason, requested_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, componentId, fromCents(cents), reasonCode, reason, userId]
        );
        await notifications.notify(conn, {
            role: "STORE_MANAGER",
            type: "EXTRA_MATERIAL_REQUESTED",
            title: `Extra material needed for order ${orders[0].order_number}`,
            body: `${components[0].name} × ${fromCents(cents)} ${components[0].unit}. Reason: ${reason}`,
            severity: "action",
            link: "/store-material-requests?tab=extra",
            orderId,
            payload: { request_id: result.insertId, order_number: orders[0].order_number },
            userId,
        });
        return { id: result.insertId };
    });
}

/* decision: "issue" | "reject" */
async function decide(id, decision, body, userId) {
    const note = cleanText(body.note);
    if (decision === "reject" && note.length < 3) throw new AppError(422, "Write why the request is rejected", "VALIDATION");

    return inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id FROM extra_material_requests WHERE id = ? FOR UPDATE`, [id]);
        if (!rows.length) throw new AppError(404, "Extra material request not found");
        const [[req]] = await conn.query(`${SELECT} WHERE r.id = ?`, [id]);
        if (req.status !== "PENDING") throw new AppError(409, `This request is already ${req.status.toLowerCase()}`, "WRONG_STATUS");

        let movementId = null;
        if (decision === "issue") {
            movementId = await postIssueLine(conn, {
                componentId: req.component_id,
                cents: Math.round(Number(req.quantity) * 100),
                reason: `Extra material: ${req.reason}`,
                reasonCode: req.reason_code,
                orderId: req.order_id,
                referenceNo: `EXTRA-${req.id}`,
                userId,
            });
        }
        const status = decision === "issue" ? "ISSUED" : "REJECTED";
        await conn.query(
            `UPDATE extra_material_requests
             SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_note = ?, inventory_transaction_id = ?
             WHERE id = ?`,
            [status, userId, note || null, movementId, id]
        );
        await notifications.notify(conn, {
            role: "PRODUCTION_MANAGER",
            type: `EXTRA_MATERIAL_${status}`,
            title: status === "ISSUED"
                ? `Extra ${req.component_name} issued for order ${req.order_number}`
                : `Extra ${req.component_name} for order ${req.order_number} was rejected`,
            body: status === "ISSUED" ? `${Number(req.quantity)} ${req.unit} handed over by Store.` : `Store: ${note}`,
            severity: status === "ISSUED" ? "success" : "warning",
            link: "/production",
            orderId: req.order_id,
            payload: { request_id: id, order_number: req.order_number },
            userId,
        });
        return { id, status };
    });
}

module.exports = { list, options, create, decide, REASONS };
