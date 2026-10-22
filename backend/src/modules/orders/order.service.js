const db = require("../../config/db");

/*
=========================================================
ORDER STATUSES
=========================================================

Main workflow:

PENDING
    ↓
IN_PRODUCTION
    ↓
TESTING
    ↓
PACKAGING
    ↓
DISPATCHED
    ↓
COMPLETED
=========================================================
*/

const ORDER_STATUSES = [
    "PENDING",
    "IN_PRODUCTION",
    "TESTING",
    "PACKAGING",
    "DISPATCHED",
    "COMPLETED"
];


/* GET ALL ORDERS */
async function listOrders() {
    const [rows] = await db.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.status,
            o.approval_status,
            DATE_FORMAT(o.estimated_delivery_date, '%Y-%m-%d') AS estimated_delivery_date,
            o.created_at,
            o.created_by,
            cu.name AS created_by_name,
            oi.product_id,
            p.name AS product_name,
            oi.quantity,
            COALESCE(ap.quantity, 0) AS approved_quantity,
            COALESCE(po.quantity_to_produce, 0) AS quantity_to_produce,
            COALESCE(po.quantity_completed, 0) AS quantity_completed,
            GREATEST(
                0,
                (CASE WHEN o.inventory_issued_at IS NOT NULL THEN COALESCE(ap.quantity, 0) ELSE oi.quantity END)
                    - COALESCE(po.quantity_to_produce, 0)
            ) AS remaining_to_start
        FROM orders o
        JOIN order_items oi
            ON o.id = oi.order_id
        JOIN products p
            ON oi.product_id = p.id
        LEFT JOIN production_orders po
            ON po.order_id = o.id AND po.product_id = oi.product_id
        LEFT JOIN (
            SELECT order_id, product_id, SUM(quantity) AS quantity
            FROM order_production_items GROUP BY order_id, product_id
        ) ap
            ON ap.order_id = o.id AND ap.product_id = oi.product_id
        LEFT JOIN users cu
            ON cu.id = o.created_by
        ORDER BY o.id DESC
        `
    );

    return rows;
}


/*
    Production may only start for an order the Operations Admin approved (see order-approvals module).
    Returns the approval status, or null when the order does not exist.
*/
async function getApprovalStatus(orderId) {
    const [rows] = await db.query("SELECT approval_status FROM orders WHERE id = ?", [orderId]);
    return rows.length ? rows[0].approval_status : null;
}


/* GET SINGLE ORDER (null when it does not exist) */
async function getOrderById(orderId) {
    const [rows] = await db.query(
        `
        SELECT
            o.id AS order_id,
            o.order_number,
            o.status,
            o.created_at,
            o.created_by,
            cu.name AS created_by_name,

            oi.product_id,

            p.sku AS product_sku,
            p.name AS product_name,

            oi.quantity

        FROM orders o

        LEFT JOIN users cu
            ON cu.id = o.created_by

        JOIN order_items oi
            ON o.id = oi.order_id

        JOIN products p
            ON oi.product_id = p.id

        WHERE o.id = ?
        `,
        [orderId]
    );

    if (rows.length === 0) {
        return null;
    }

    return {
        orderId: rows[0].order_id,
        orderNumber: rows[0].order_number,
        status: rows[0].status,
        createdAt: rows[0].created_at,
        createdBy: rows[0].created_by,
        createdByName: rows[0].created_by_name,
        items: rows.map((row) => ({
            productId: row.product_id,
            productSku: row.product_sku,
            productName: row.product_name,
            quantity: row.quantity
        }))
    };
}


/*
    UPDATE ORDER STATUS

    Returns { orderNumber, previousStatus }, or null when the order does not exist.
    The caller has already checked that `status` is one of ORDER_STATUSES.

    This is mainly here so the Production / Testing / Finished Goods workflows
    have a clean way to update the main order status.
*/
async function updateOrderStatus(orderId, status) {
    const [orderRows] = await db.query(
        `
        SELECT
            id,
            order_number,
            status
        FROM orders
        WHERE id = ?
        `,
        [orderId]
    );

    if (orderRows.length === 0) {
        return null;
    }

    await db.query(
        `
        UPDATE orders
        SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [status, orderId]
    );

    return {
        orderNumber: orderRows[0].order_number,
        previousStatus: orderRows[0].status
    };
}


/*
    Builds the final order number, e.g. ORD-20261003-16-001

        YYYYMMDD - hour (24h, 00 = midnight ... 23 = 11 PM) - order id padded to 3 digits
*/
function buildOrderNumber(orderId, now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const sequenceNumber = String(orderId).padStart(3, "0");

    return `ORD-${year}${month}${day}-${hour}-${sequenceNumber}`;
}


/* CREATE ORDER (order row + its items, in one transaction). userId = the super admin creating it. */
async function createOrder(items, userId = null) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        /*
            Temporary order number.
            We first insert the order because we need the
            MySQL-generated ID for the sequence number.
        */
        const temporaryOrderNumber = `TEMP-${Date.now()}`;

        const [orderResult] = await connection.query(
            `
            INSERT INTO orders
            (
                order_number,
                status,
                created_by
            )
            VALUES
            (
                ?,
                'PENDING',
                ?
            )
            `,
            [temporaryOrderNumber, userId]
        );

        const orderId = orderResult.insertId;
        const orderNumber = buildOrderNumber(orderId);

        await connection.query(
            `
            UPDATE orders
            SET
                order_number = ?
            WHERE id = ?
            `,
            [orderNumber, orderId]
        );

        for (const item of items) {
            await connection.query(
                `
                INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    quantity
                )
                VALUES
                (
                    ?,
                    ?,
                    ?
                )
                `,
                [orderId, item.productId, item.quantity]
            );
        }

        await connection.commit();

        return { orderId, orderNumber, status: "PENDING" };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    ORDER_STATUSES,
    listOrders,
    getApprovalStatus,
    getOrderById,
    updateOrderStatus,
    createOrder
};
