const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const approvals = require("../order-approvals/order-approval.service");

/*
    Marketing Manager: prepares orders and sends them to the Operations Admin.
        create  -> DRAFT            (editable by marketing only, can still be deleted)
        send    -> PENDING_APPROVAL (lands in the Operations Admin's queue; approve / reject is in order-approvals)
    Marketing sees every order raised by a marketing manager, with the admin's decision and reason.
*/

const MAX_ITEMS = 30;

async function listOrders(conn = db) {
    const [rows] = await conn.query(
        `SELECT o.id FROM orders o JOIN users u ON u.id = o.created_by
         WHERE u.role = 'MARKETING_MANAGER' ORDER BY o.id DESC LIMIT 300`
    );
    return approvals.getOrdersByIds(rows.map((r) => r.id), conn);
}

async function productOptions() {
    const [rows] = await db.query(`SELECT id, sku, name FROM products WHERE is_active = TRUE ORDER BY name`);
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
        return { productId, quantity };
    });
}

async function createDraft(body, userId) {
    const items = parseItems(body || {});
    const rawDate = body && (body.estimated_delivery_date || body.estimatedDeliveryDate);
    const deliveryDate = (typeof rawDate === "string" && rawDate.trim().length > 0) ? rawDate.trim() : null;

    return inventory.inTransaction(async (conn) => {
        const [found] = await conn.query(`SELECT id FROM products WHERE id IN (?) AND is_active = TRUE`, [items.map((i) => i.productId)]);
        const have = new Set(found.map((r) => r.id));
        items.forEach((it, line) => {
            if (!have.has(it.productId)) throw new AppError(404, "Product not found", "NOT_FOUND", { line, field: "product" });
        });

        const [res] = await conn.query(
            `INSERT INTO orders (order_number, status, approval_status, estimated_delivery_date, created_by) VALUES (?, 'PENDING', 'DRAFT', ?, ?)`,
            [`TEMP-${Date.now()}-${userId}`, deliveryDate, userId]
        );
        const id = res.insertId;
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const number = `ORD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}-${String(id).padStart(3, "0")}`;
        await conn.query(`UPDATE orders SET order_number = ? WHERE id = ?`, [number, id]);

        for (const it of items) {
            await conn.query(`INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)`, [id, it.productId, it.quantity]);
        }
        return approvals.getOrder(id, conn);
    });
}

/* Locks the order and checks that a marketing manager made it and it is still a draft. */
async function lockDraft(conn, orderId) {
    const [rows] = await conn.query(
        `SELECT o.id, o.approval_status, u.role AS creator_role
         FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ? FOR UPDATE`,
        [orderId]
    );
    if (rows.length === 0 || rows[0].creator_role !== "MARKETING_MANAGER") throw AppError.notFound("Order not found", "NOT_FOUND");
    if (rows[0].approval_status !== "DRAFT") {
        throw AppError.conflict("This order has already been sent. Refresh the page.", "NOT_DRAFT");
    }
}

async function send(orderId) {
    return inventory.inTransaction(async (conn) => {
        await lockDraft(conn, orderId);
        await conn.query(`UPDATE orders SET approval_status = 'PENDING_APPROVAL', sent_to_admin_at = NOW() WHERE id = ?`, [orderId]);
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

module.exports = { listOrders, productOptions, createDraft, send, removeDraft };
