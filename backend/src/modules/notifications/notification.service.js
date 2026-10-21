const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const hub = require("../../realtime/hub");

const ISSUE_TYPE = "ISSUE_COMPONENTS";

/*
    Notifications for a role's dashboard.

    createIssueRequest(conn, ...) is called INSIDE the approval transaction: the row is saved together with the
    stock deduction (or not at all), and the live push to the Store Managers is queued with conn.afterCommit(),
    so it goes out only once the transaction has really committed.
*/

const asObject = (value) => (typeof value === "string" ? JSON.parse(value) : value);

async function createIssueRequest(conn, { orderId, round, lines, userId }) {
    if (!lines.length) return null;

    const ids = lines.map((l) => l.component_id);
    const [components] = await conn.query(`SELECT id, sku, name, unit FROM components WHERE id IN (?)`, [ids]);
    const byId = new Map(components.map((c) => [c.id, c]));
    const [orders] = await conn.query(`SELECT order_number FROM orders WHERE id = ?`, [orderId]);
    const orderNumber = (orders[0] && orders[0].order_number) || `#${orderId}`;

    const items = lines.map((l) => {
        const c = byId.get(l.component_id) || {};
        return { component_id: l.component_id, sku: c.sku || null, name: c.name || null, unit: c.unit || "pcs", quantity: l.quantity };
    });
    const title = `Issue components for order ${orderNumber}`;
    const payload = { order_number: orderNumber, round, items };

    const [result] = await conn.query(
        `INSERT INTO notifications (role, type, title, order_id, payload, created_by) VALUES ('STORE_MANAGER', ?, ?, ?, ?, ?)`,
        [ISSUE_TYPE, title, orderId, JSON.stringify(payload), userId]
    );

    // only after COMMIT: nobody is told to issue stock for an approval that was rolled back
    conn.afterCommit(() =>
        hub.notifyRole("STORE_MANAGER", {
            type: ISSUE_TYPE,
            notificationId: result.insertId,
            message: `${title}: ${items.length} component${items.length === 1 ? "" : "s"} to issue now`
        })
    );
    return result.insertId;
}

function shape(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        order_id: row.order_id,
        ...asObject(row.payload),
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
        done: !!row.done_at,
        done_by_name: row.done_by_name || null,
        done_at: row.done_at
    };
}

/* Open ones first (newest first), then the most recent finished ones. */
async function list(role) {
    const [rows] = await db.query(
        `SELECT n.*, cu.name AS created_by_name, du.name AS done_by_name
           FROM notifications n
           LEFT JOIN users cu ON cu.id = n.created_by
           LEFT JOIN users du ON du.id = n.done_by
          WHERE n.role = ?
          ORDER BY (n.done_at IS NOT NULL), n.id DESC
          LIMIT 100`,
        [role]
    );
    return rows.map(shape);
}

async function markDone(id, role, userId) {
    const [result] = await db.query(
        `UPDATE notifications SET done_by = ?, done_at = NOW() WHERE id = ? AND role = ? AND done_at IS NULL`,
        [userId, id, role]
    );
    if (result.affectedRows !== 1) {
        const [rows] = await db.query(`SELECT id FROM notifications WHERE id = ? AND role = ?`, [id, role]);
        if (rows.length === 0) throw AppError.notFound("Notification not found", "NOT_FOUND");
        throw AppError.conflict("Another store manager has already marked this as issued.", "ALREADY_DONE");
    }
    // the update is already committed (single statement): refresh every store manager's dashboard
    hub.notifyRole(role, { type: "NOTIFICATIONS_CHANGED" });
    const [rows] = await db.query(
        `SELECT n.*, du.name AS done_by_name FROM notifications n LEFT JOIN users du ON du.id = n.done_by WHERE n.id = ?`,
        [id]
    );
    return shape(rows[0]);
}

module.exports = { createIssueRequest, list, markDone };
