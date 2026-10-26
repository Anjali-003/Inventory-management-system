const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/*
    Product inventory: finished products the Store holds (Fans: +100 received, -60 given out -> 40 left).
    Stock changes ONLY through the finished-goods steps (Store receives / gives out), never by hand:
    post() is called inside their transaction and writes the balance and one ledger row per product.
*/

/* lines: [{ productId, quantity }]  direction: "IN" | "OUT" */
async function post(conn, lines, { direction, reason, finishedGoodsId = null, orderId = null, userId = null }) {
    const ids = [...new Set(lines.map((l) => l.productId))].sort((a, b) => a - b);
    if (!ids.length) throw new AppError(409, "This order has no products", "NO_PRODUCTS");

    for (const id of ids) {
        await conn.query(
            `INSERT INTO product_stock (product_id, quantity_on_hand) VALUES (?, 0)
             ON DUPLICATE KEY UPDATE product_id = product_id`,
            [id]
        );
    }
    // lock in id order so two stock changes never deadlock
    const [rows] = await conn.query(
        `SELECT ps.product_id, ps.quantity_on_hand, p.name
         FROM product_stock ps JOIN products p ON p.id = ps.product_id
         WHERE ps.product_id IN (?) ORDER BY ps.product_id FOR UPDATE`,
        [ids]
    );
    const stock = new Map(rows.map((r) => [r.product_id, r]));

    for (const line of lines) {
        const row = stock.get(line.productId);
        const before = Number(row.quantity_on_hand);
        const after = direction === "IN" ? before + line.quantity : before - line.quantity;
        if (after < 0) {
            throw new AppError(409, `Not enough ${row.name} in the Store: ${before} on hand, ${line.quantity} needed`, "INSUFFICIENT_STOCK");
        }
        await conn.query(`UPDATE product_stock SET quantity_on_hand = ? WHERE product_id = ?`, [after, line.productId]);
        await conn.query(
            `INSERT INTO product_stock_transactions
                (product_id, direction, quantity, balance_after, finished_goods_id, order_id, reason, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [line.productId, direction, line.quantity, after, finishedGoodsId, orderId, reason, userId]
        );
        row.quantity_on_hand = after;
    }
}

/* every active product with what the Store holds now and how much came in / went out */
async function listStock() {
    const [rows] = await db.query(
        `SELECT p.id AS product_id, p.sku, p.name,
                COALESCE(ps.quantity_on_hand, 0) AS on_hand,
                COALESCE(t.total_in, 0) AS total_in,
                COALESCE(t.total_out, 0) AS total_out,
                t.last_movement_at
         FROM products p
         LEFT JOIN product_stock ps ON ps.product_id = p.id
         LEFT JOIN (
             SELECT product_id,
                    SUM(CASE WHEN direction = 'IN' THEN quantity ELSE 0 END) AS total_in,
                    SUM(CASE WHEN direction = 'OUT' THEN quantity ELSE 0 END) AS total_out,
                    MAX(created_at) AS last_movement_at
             FROM product_stock_transactions GROUP BY product_id
         ) t ON t.product_id = p.id
         WHERE p.is_active = 1 OR ps.quantity_on_hand > 0
         ORDER BY p.name`
    );
    return rows.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        onHand: Number(r.on_hand),
        totalIn: Number(r.total_in),
        totalOut: Number(r.total_out),
        lastMovementAt: r.last_movement_at,
    }));
}

/* latest movements, optionally of one product */
async function listMovements({ productId = null, limit = 200 } = {}) {
    const [rows] = await db.query(
        `SELECT t.id, t.product_id, p.sku, p.name, t.direction, t.quantity, t.balance_after, t.reason,
                t.created_at, t.order_id, o.order_number, u.name AS created_by_name
         FROM product_stock_transactions t
         JOIN products p ON p.id = t.product_id
         LEFT JOIN orders o ON o.id = t.order_id
         LEFT JOIN users u ON u.id = t.created_by
         ${productId ? "WHERE t.product_id = ?" : ""}
         ORDER BY t.id DESC LIMIT ?`,
        productId ? [productId, limit] : [limit]
    );
    return rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        direction: r.direction,
        quantity: Number(r.quantity),
        balanceAfter: Number(r.balance_after),
        reason: r.reason,
        orderId: r.order_id,
        orderNumber: r.order_number,
        createdAt: r.created_at,
        createdByName: r.created_by_name,
    }));
}

module.exports = { post, listStock, listMovements };
