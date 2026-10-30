const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../../store/inventory/inventory.service");
const approvals = require("../order-approvals/order-approval.service");
const notifications = require("../../core/notifications/notification.service");

/*
    Marketing Manager: prepares orders and sends them to the Operations Admin.
        create  -> DRAFT            (editable by marketing only, can still be deleted)
        send    -> PENDING_APPROVAL (lands in the Operations Admin's queue; approve / reject is in order-approvals)
        accept  -> QUANTITY_REVISED back to PENDING_APPROVAL: marketing agrees to the reduced quantity the admin proposed
                   (the held-back part is already a separate draft, see order-approvals revise())
    Marketing sees every order raised by a marketing manager, with the admin's decision and reason.
*/

const MAX_ITEMS = 30;
// whose orders are "Marketing orders": the Marketing Manager's, and the Super Admin's (the CEO can do Marketing's work)
const SALES_ROLES = ["MARKETING_MANAGER", "SUPER_ADMIN"];

async function listOrders(conn = db) {
    const [rows] = await conn.query(
        `SELECT o.id FROM orders o JOIN users u ON u.id = o.created_by
         WHERE u.role IN (?) ORDER BY o.id DESC LIMIT 300`,
        [SALES_ROLES]
    );
    return approvals.getOrdersByIds(rows.map((r) => r.id), conn);
}

/* The saved customers, for the New order picker. */
async function customerOptions() {
    const [rows] = await db.query(`SELECT id, name FROM customers ORDER BY name`);
    return rows;
}

/*
    The order's customer: { customer_id } a saved one, or { customer_name } typed by hand (saved the first time, found
    again by its name after that). Required: the CEO reads every order by its customer.
*/
async function resolveCustomer(conn, body, userId) {
    const id = Number(body && body.customer_id);
    if (Number.isInteger(id) && id > 0) {
        const [rows] = await conn.query(`SELECT id FROM customers WHERE id = ?`, [id]);
        if (!rows.length) throw new AppError(422, "The selected customer no longer exists", "VALIDATION", { field: "customer" });
        return id;
    }
    const name = typeof (body && body.customer_name) === "string" ? body.customer_name.trim().replace(/\s+/g, " ") : "";
    if (!name) throw new AppError(422, "Enter the customer this order is for", "VALIDATION", { field: "customer" });
    if (name.length > 150) throw new AppError(422, "Customer name can be at most 150 characters", "VALIDATION", { field: "customer" });
    await conn.query(`INSERT IGNORE INTO customers (name, created_by) VALUES (?, ?)`, [name, userId || null]);
    const [[row]] = await conn.query(`SELECT id FROM customers WHERE name = ?`, [name]);
    return row.id;
}

async function productOptions() {
    const [rows] = await db.query(`SELECT id, sku, name, selling_price FROM products WHERE is_active = TRUE ORDER BY name`);
    return rows;
}

function parseItems(body) {
    if (!Array.isArray(body && body.items) || body.items.length === 0) {
        throw new AppError(422, "Add at least one product to the order", "VALIDATION");
    }
    if (body.items.length > MAX_ITEMS) {
        throw new AppError(422, `One order can hold at most ${MAX_ITEMS} products`, "VALIDATION");
    }
    const seen = new Set();
    return body.items.map((raw, line) => {
        const productId = Number(raw && raw.productId);
        const quantity = Number(raw && raw.quantity);
        if (!Number.isInteger(productId) || productId <= 0) {
            throw new AppError(422, "Select a product", "VALIDATION", { line, field: "product" });
        }
        if (seen.has(productId)) {
            throw new AppError(422, "This product appears more than once in the order", "VALIDATION", { line, field: "product" });
        }
        seen.add(productId);
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000000) {
            throw new AppError(422, "Quantity must be a whole number greater than 0", "VALIDATION", { line, field: "quantity" });
        }
        return { productId, quantity, ...parseRate(raw, line) };
    });
}

/*
    The rate agreed with the customer (rate lock), optional: { rate, rate_note }. Empty = nothing agreed, the bill
    uses the price list. A rate below the price list needs the reason (checked in createDraft, where the price is known).
*/
function parseRate(raw, line) {
    const value = raw && raw.rate;
    if (value === undefined || value === null || value === "") return { rate: null, note: null };
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 10000000 || Math.round(rate * 100) !== rate * 100) {
        throw new AppError(422, "Rate must be 0 or more, with at most 2 decimals", "VALIDATION", { line, field: "rate" });
    }
    const note = typeof raw.rate_note === "string" ? raw.rate_note.trim().replace(/\s+/g, " ") : "";
    if (note.length > 255) throw new AppError(422, "The reason can be at most 255 characters", "VALIDATION", { line, field: "rate_note" });
    return { rate, note: note || null };
}

/*
    The date the customer wants the order by (required). Saved twice: required_by_date keeps the customer's date,
    estimated_delivery_date starts the same and is the one the Operations Admin can move later.
    (estimated_delivery_date is still read for older callers.)
*/
function parseRequiredBy(body) {
    const raw = body && (body.required_by_date || body.estimated_delivery_date || body.estimatedDeliveryDate);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) throw new AppError(422, "Enter the date the customer wants this order by", "VALIDATION", { field: "required_by_date" });
    const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").map(Number) : [];
    const parsed = new Date(y, m - 1, d);
    // "2026-02-30" rolls over to March, so it is not a real date
    if (!y || parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
        throw new AppError(422, "Enter a valid date", "VALIDATION", { field: "required_by_date" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) throw new AppError(422, "The customer's date cannot be in the past", "VALIDATION", { field: "required_by_date" });
    return value;
}

async function createDraft(body, userId) {
    const items = parseItems(body || {});
    const requiredBy = parseRequiredBy(body);

    return inventory.inTransaction(async (conn) => {
        const [found] = await conn.query(`SELECT id, name, selling_price FROM products WHERE id IN (?) AND is_active = TRUE`, [items.map((i) => i.productId)]);
        const product = new Map(found.map((r) => [r.id, r]));
        items.forEach((it, line) => {
            const p = product.get(it.productId);
            if (!p) throw new AppError(404, "Product not found", "NOT_FOUND", { line, field: "product" });
            // an agreed rate below the price list is a discount: it needs its reason, as on the bill
            const below = it.rate !== null && p.selling_price !== null && it.rate < Number(p.selling_price);
            if (below && (!it.note || it.note.length < 3)) {
                throw new AppError(422, `${p.name}: the rate is below the price list (₹${Number(p.selling_price)}). Write the reason for the discount.`, "DISCOUNT_REASON_REQUIRED", { line, field: "rate_note" });
            }
            if (!below) it.note = null;
        });

        const customerId = await resolveCustomer(conn, body, userId);
        const [res] = await conn.query(
            `INSERT INTO orders (order_number, customer_id, status, approval_status, required_by_date, estimated_delivery_date, created_by) VALUES (?, ?, 'PENDING', 'DRAFT', ?, ?, ?)`,
            [`TEMP-${Date.now()}-${userId}`, customerId, requiredBy, requiredBy, userId]
        );
        const id = res.insertId;
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const number = `ORD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}-${String(id).padStart(3, "0")}`;
        await conn.query(`UPDATE orders SET order_number = ? WHERE id = ?`, [number, id]);

        for (const it of items) {
            await conn.query(
                `INSERT INTO order_items (order_id, product_id, quantity, agreed_rate, agreed_note) VALUES (?, ?, ?, ?, ?)`,
                [id, it.productId, it.quantity, it.rate, it.note]
            );
        }
        return approvals.getOrder(id, conn);
    });
}

/* Locks the order and checks that a marketing manager made it and it is still a draft. */
async function lockDraft(conn, orderId) {
    const [rows] = await conn.query(
        `SELECT o.id, o.order_number, o.approval_status, u.role AS creator_role
         FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ? FOR UPDATE`,
        [orderId]
    );
    if (rows.length === 0 || !SALES_ROLES.includes(rows[0].creator_role)) throw AppError.notFound("Order not found", "NOT_FOUND");
    if (rows[0].approval_status !== "DRAFT") {
        throw AppError.conflict("This order has already been sent. Refresh the page.", "NOT_DRAFT");
    }
    return rows[0];
}

async function send(orderId, userId = null) {
    return inventory.inTransaction(async (conn) => {
        const order = await lockDraft(conn, orderId);
        await conn.query(`UPDATE orders SET approval_status = 'PENDING_APPROVAL', sent_to_admin_at = NOW() WHERE id = ?`, [orderId]);
        await approvals.logEvent(conn, orderId, "SENT", userId, { quantity: await approvals.unitsOf(conn, orderId) });
        await notifications.notify(conn, {
            role: "OPERATIONS_ADMIN",
            type: "ORDER_SENT",
            title: `New order ${order.order_number} from Marketing`,
            body: "Check the stock and approve, revise or reject it.",
            severity: "action",
            link: `/order-approvals?order=${orderId}`,
            orderId,
            payload: { order_number: order.order_number },
            userId,
        });
        return approvals.getOrder(orderId, conn);
    });
}

async function removeDraft(orderId) {
    return inventory.inTransaction(async (conn) => {
        await lockDraft(conn, orderId);
        await conn.query(`DELETE FROM orders WHERE id = ?`, [orderId]); // order_items cascade
        return { id: orderId, deleted: true };
    });
}

/* The Marketing Manager agrees to the reduced quantity: the order goes back to the admin's queue, marked as accepted. */
async function acceptRevision(orderId, userId) {
    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT o.id, o.order_number, o.approval_status, u.role AS creator_role
             FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        if (rows.length === 0 || !SALES_ROLES.includes(rows[0].creator_role)) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (rows[0].approval_status !== "QUANTITY_REVISED") {
            throw AppError.conflict("This order is not waiting for your answer on a revised quantity. Refresh the page.", "NOT_REVISED");
        }
        await conn.query(
            `UPDATE orders SET approval_status = 'PENDING_APPROVAL', revision_accepted_by = ?, revision_accepted_at = NOW() WHERE id = ?`,
            [userId, orderId]
        );
        await approvals.logEvent(conn, orderId, "REVISION_ACCEPTED", userId, { quantity: await approvals.unitsOf(conn, orderId) });
        await notifications.notify(conn, {
            role: "OPERATIONS_ADMIN",
            type: "REVISION_ACCEPTED",
            title: `Revised quantity accepted for order ${rows[0].order_number}`,
            body: "Marketing agreed to the reduced quantity. The order is back in your queue.",
            severity: "success",
            link: `/order-approvals?order=${orderId}`,
            orderId,
            payload: { order_number: rows[0].order_number },
            userId,
        });
        return approvals.getOrder(orderId, conn);
    });
}

/*
    The Marketing Manager does not agree to the reduced quantity: the order is cancelled, together with the held-back
    draft the revision split off (if it was not sent yet), and the Operations Admin is told. Nothing was approved, so
    no stock moves.
*/
async function declineRevision(orderId, userId) {
    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT o.id, o.order_number, o.approval_status, u.role AS creator_role
             FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        // the same orders accept-revision answers: Marketing's, and the Super Admin's own (the CEO doing Marketing's work)
        if (rows.length === 0 || !SALES_ROLES.includes(rows[0].creator_role)) throw AppError.notFound("Order not found", "NOT_FOUND");
        if (rows[0].approval_status !== "QUANTITY_REVISED") {
            throw AppError.conflict("This order is not waiting for your answer on a revised quantity. Refresh the page.", "NOT_REVISED");
        }
        // who said no and when go into the revision, next to who revised it (shown on both timelines)
        await conn.query(
            `UPDATE orders
             SET approval_status = 'CANCELLED', approval_remarks = ?,
                 revision = JSON_SET(revision, '$.declined_at', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'),
                                     '$.declined_by_name', (SELECT name FROM users WHERE id = ?))
             WHERE id = ?`,
            ["Marketing did not accept the revised quantity", userId, orderId]
        );
        // an order revised before 2026-10-28 also left a draft of the rest: it goes too (newer revisions make none)
        await conn.query(`DELETE FROM orders WHERE parent_order_id = ? AND approval_status = 'DRAFT'`, [orderId]); // order_items cascade
        await approvals.logEvent(conn, orderId, "REVISION_DECLINED", userId, { quantity: await approvals.unitsOf(conn, orderId) });
        await notifications.notify(conn, {
            role: "OPERATIONS_ADMIN",
            type: "REVISION_DECLINED",
            title: `Order ${rows[0].order_number} cancelled`,
            body: "Marketing did not accept the reduced quantity, so the order was cancelled.",
            severity: "warning",
            link: `/order-approvals?order=${orderId}`,
            orderId,
            payload: { order_number: rows[0].order_number },
            userId,
        });
        return approvals.getOrder(orderId, conn);
    });
}

module.exports = { listOrders, productOptions, customerOptions, createDraft, send, removeDraft, acceptRevision, declineRevision };
