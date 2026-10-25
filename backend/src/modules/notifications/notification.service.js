const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const hub = require("../../realtime/hub");

/*
    Notifications: one inbox per ROLE (the bell in the header + the role's dashboard panels).

    notify(conn, {...}) is the ONLY way to create one. It is called INSIDE the transaction of the change that
    caused it, so the row exists only if that change committed, and the live push to the role's open tabs is
    queued with conn.afterCommit(): nobody is told about something that was rolled back. The same push also goes to
    the role's phones / desktops that turned on push notifications (push.service.js), so it reaches them even when
    the app is closed.

    Two kinds:
      * information (requires_action = 0): each user reads it on their own (notification_reads).
      * task        (requires_action = 1): e.g. "issue these components". One user of the role marks it done
                    and it is closed for everyone; it then stays as history.
*/

const SEVERITIES = new Set(["info", "success", "warning", "action"]);
const ISSUE_TYPE = "ISSUE_COMPONENTS";

const asObject = (value) => (typeof value === "string" ? JSON.parse(value) : value || {});
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function notify(conn, { role, type, title, body = null, severity = "info", link = null, orderId = null, payload = {}, requiresAction = false, userId = null }) {
    if (!SEVERITIES.has(severity)) throw new Error(`notify: unknown severity "${severity}"`);

    const [result] = await conn.query(
        `INSERT INTO notifications (role, type, title, body, severity, link, requires_action, order_id, payload, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, type, title, body, severity, link, requiresAction ? 1 : 0, orderId, JSON.stringify(payload), userId]
    );

    const push = () => {
        hub.notifyRole(role, { type, notificationId: result.insertId, title, body, severity, link });
        // phone / desktop (never throws; loaded here so the services that only save notifications never load web-push)
        require("../push/push.service").sendToRole(role, { id: result.insertId, type, title, body, severity, link }, { exceptUserId: userId });
    };
    // outside a transaction (plain db pool) the row is already committed
    if (conn.afterCommit) conn.afterCommit(push);
    else push();
    return result.insertId;
}

/*
    For services that run their own beginTransaction()/commit() (production, quality control, finished goods):
    call it AFTER commit(). It never throws: the work is already saved, a failed notification must not undo it.
*/
async function notifyCommitted(entry) {
    try {
        return await notify(db, entry);
    } catch (error) {
        console.error("notification failed:", error.message);
        return null;
    }
}

/* Store Manager task: hand these components to production (stock was already deducted by the approval). */
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

    return notify(conn, {
        role: "STORE_MANAGER",
        type: ISSUE_TYPE,
        title: `Issue components for order ${orderNumber}`,
        body: `${plural(items.length, "component")} to hand over to production`,
        severity: "action",
        link: "/dashboard",
        requiresAction: true,
        orderId,
        payload: { order_number: orderNumber, round, items },
        userId,
    });
}

function shape(row) {
    return {
        ...asObject(row.payload),
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body || null,
        severity: row.severity || "info",
        link: row.link || null,
        requires_action: !!row.requires_action,
        order_id: row.order_id,
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
        read: !!row.read_at || !!row.done_at,
        done: !!row.done_at,
        done_by_name: row.done_by_name || null,
        done_at: row.done_at
    };
}

/* A notification is unread for a user until they open it, or until a task is closed by anyone of the role. */
const UNREAD = `r.read_at IS NULL AND n.done_at IS NULL`;

/* Open tasks first, then everything else newest first. */
async function list(role, userId) {
    const [rows] = await db.query(
        `SELECT n.*, cu.name AS created_by_name, du.name AS done_by_name, r.read_at
           FROM notifications n
           LEFT JOIN users cu ON cu.id = n.created_by
           LEFT JOIN users du ON du.id = n.done_by
           LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
          WHERE n.role = ?
          ORDER BY (n.requires_action = 1 AND n.done_at IS NULL) DESC, n.id DESC
          LIMIT 100`,
        [userId, role]
    );
    const [[{ unread }]] = await db.query(
        `SELECT COUNT(*) AS unread
           FROM notifications n
           LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
          WHERE n.role = ? AND ${UNREAD}`,
        [userId, role]
    );
    return { items: rows.map(shape), unread: Number(unread) };
}

/* the user's other open tabs refresh their bell (read state is per user, other users are not affected) */
const refreshUser = (userId) => hub.notifyUser(userId, { type: "NOTIFICATIONS_CHANGED" });

async function markRead(id, role, userId) {
    const [result] = await db.query(
        `INSERT IGNORE INTO notification_reads (notification_id, user_id) SELECT id, ? FROM notifications WHERE id = ? AND role = ?`,
        [userId, id, role]
    );
    if (result.affectedRows === 0) {
        const [rows] = await db.query(`SELECT id FROM notifications WHERE id = ? AND role = ?`, [id, role]);
        if (rows.length === 0) throw AppError.notFound("Notification not found", "NOT_FOUND");
        return { id, read: true }; // already read
    }
    refreshUser(userId);
    return { id, read: true };
}

async function markAllRead(role, userId) {
    const [result] = await db.query(
        `INSERT IGNORE INTO notification_reads (notification_id, user_id)
         SELECT n.id, ? FROM notifications n
           LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
          WHERE n.role = ? AND ${UNREAD}`,
        [userId, userId, role]
    );
    if (result.affectedRows > 0) refreshUser(userId);
    return { marked: result.affectedRows };
}

/* Close a task for the whole role. */
async function markDone(id, role, userId) {
    const [result] = await db.query(
        `UPDATE notifications SET done_by = ?, done_at = NOW() WHERE id = ? AND role = ? AND requires_action = 1 AND done_at IS NULL`,
        [userId, id, role]
    );
    if (result.affectedRows !== 1) {
        const [rows] = await db.query(`SELECT id, requires_action, done_by FROM notifications WHERE id = ? AND role = ?`, [id, role]);
        if (rows.length === 0) throw AppError.notFound("Notification not found", "NOT_FOUND");
        if (!rows[0].requires_action) throw AppError.conflict("This notification has nothing to complete. Mark it as read instead.", "NOT_A_TASK");
        throw AppError.conflict("Someone else has already completed this task.", "ALREADY_DONE");
    }
    // the update is already committed (single statement): refresh every open tab of this role
    hub.notifyRole(role, { type: "NOTIFICATIONS_CHANGED" });
    const [rows] = await db.query(
        `SELECT n.*, du.name AS done_by_name FROM notifications n LEFT JOIN users du ON du.id = n.done_by WHERE n.id = ?`,
        [id]
    );
    return shape(rows[0]);
}

module.exports = { notify, notifyCommitted, createIssueRequest, list, markRead, markAllRead, markDone };
