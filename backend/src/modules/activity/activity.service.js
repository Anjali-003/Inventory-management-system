const db = require("../../config/db");
const hub = require("../../realtime/hub");
const { describe } = require("./activity.describe");

/* Insert one row and return it in the shape the frontend feed uses. */
async function record({ userId, userName, resource, resourceId = null, action, summary }) {
    const createdAt = new Date(); // set from Node so insert and read use the same timezone
    const [result] = await db.query(
        `INSERT INTO activity_log (user_id, action, resource, resource_id, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, action, resource, resourceId, summary, createdAt]
    );
    return {
        id: result.insertId,
        user_id: userId,
        user_name: userName,
        action,
        resource,
        resource_id: resourceId,
        summary,
        created_at: createdAt.toISOString()
    };
}

/*
    Record + tell every open browser (SSE). A failing log write must never fail the user's request,
    so errors are only printed; the "something changed" event is still sent.
*/
async function log(entry) {
    let activity = null;
    try {
        activity = await record(entry);
    } catch (error) {
        console.error("activity log failed:", error.message);
    }
    hub.broadcast({ resource: entry.resource, actorId: entry.userId, at: Date.now(), activity });
    return activity;
}

const ROLE_ACTIVITY_RESOURCES = {
    // Production Admin must not see HR, purchasing, marketing or other department activity.
    PRODUCTION_ADMIN: ["production", "quality-control", "qc-failed", "finished-goods", "repairs"],
};

async function list({ limit = 30, role } = {}) {
    const n = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const resources = ROLE_ACTIVITY_RESOURCES[String(role || "").toUpperCase()];
    const filter = resources ? "WHERE a.resource IN (?)" : "";
    const params = resources ? [resources, n] : [n];
    const [rows] = await db.query(
        `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.resource, a.resource_id, a.summary, a.created_at
         FROM activity_log a
         JOIN users u ON u.id = a.user_id
         ${filter}
         ORDER BY a.id DESC
         LIMIT ?`,
        params
    );
    return rows;
}

module.exports = { record, log, list, describe };
