const webpush = require("web-push");
const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../shared/AppError");

/*
    Web Push: the same notification that rings the bell also pops up on the phone / desktop, even when the app is
    closed. Free (VAPID keys in .env, no account). Each browser that turned it on is one row in push_subscriptions,
    per role, because a browser can be logged in as several roles.

    sendToRole() is called by notification.service AFTER the change committed, and never throws: a push that fails
    must not undo or slow down the real work. Subscriptions the push service no longer knows (404 / 410) are removed.
    Push stays off when the keys are missing (and under tests).
*/
const enabled = Boolean(env.push.publicKey && env.push.privateKey) && env.nodeEnv !== "test";
if (enabled) webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);

const TTL_SECONDS = 24 * 60 * 60; // a phone that is off for a day still gets it when it comes back

function config() {
    return { enabled, publicKey: enabled ? env.push.publicKey : null };
}

/* What the browser's PushManager.subscribe() returned: { endpoint, keys: { p256dh, auth } } */
function parseSubscription(body) {
    const b = body || {};
    const sub = b.subscription || b;
    const endpoint = typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
    const keys = sub.keys || {};
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 600) {
        throw new AppError(422, "Invalid push subscription", "VALIDATION", { field: "endpoint" });
    }
    if (typeof keys.p256dh !== "string" || !keys.p256dh || keys.p256dh.length > 255 ||
        typeof keys.auth !== "string" || !keys.auth || keys.auth.length > 100) {
        throw new AppError(422, "Invalid push subscription", "VALIDATION", { field: "keys" });
    }
    return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

async function subscribe(user, body) {
    if (!enabled) throw new AppError(503, "Push notifications are not set up on the server", "PUSH_DISABLED");
    const s = parseSubscription(body);
    // the same browser + role again (e.g. another user logged in on it): it now belongs to this user
    await db.query(
        `INSERT INTO push_subscriptions (user_id, role, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
        [user.id, user.role, s.endpoint, s.p256dh, s.auth]
    );
    return { subscribed: true };
}

async function unsubscribe(user, body) {
    const endpoint = typeof (body && body.endpoint) === "string" ? body.endpoint.trim() : "";
    if (!endpoint) throw new AppError(422, "endpoint is required", "VALIDATION", { field: "endpoint" });
    await db.query(`DELETE FROM push_subscriptions WHERE endpoint = ? AND role = ?`, [endpoint, user.role]);
    return { subscribed: false };
}

/* Is this browser (endpoint) subscribed for the current role? */
async function status(user, endpoint) {
    if (!enabled || !endpoint) return { enabled, subscribed: false };
    const [rows] = await db.query(`SELECT id FROM push_subscriptions WHERE endpoint = ? AND role = ? LIMIT 1`, [endpoint, user.role]);
    return { enabled, subscribed: rows.length > 0 };
}

/*
    Push one notification to every browser of a role (active users only), except the user who caused it.
    message = { id, type, title, body, link, severity }
*/
async function sendToRole(role, message, { exceptUserId = null } = {}) {
    if (!enabled) return;
    try {
        const [subs] = await db.query(
            `SELECT s.id, s.endpoint, s.p256dh, s.auth
               FROM push_subscriptions s
               JOIN users u ON u.id = s.user_id
              WHERE s.role = ? AND u.role = ? AND u.is_active = 1 AND (? IS NULL OR s.user_id <> ?)`,
            [role, role, exceptUserId, exceptUserId]
        );
        if (subs.length === 0) return;

        const payload = JSON.stringify({ ...message, role });
        await Promise.allSettled(
            subs.map((s) =>
                webpush
                    .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: TTL_SECONDS })
                    .catch(async (error) => {
                        if (error.statusCode === 404 || error.statusCode === 410) {
                            await db.query(`DELETE FROM push_subscriptions WHERE id = ?`, [s.id]);
                        } else {
                            console.error("push failed:", error.statusCode || "", error.message);
                        }
                    })
            )
        );
    } catch (error) {
        console.error("push failed:", error.message);
    }
}

module.exports = { config, subscribe, unsubscribe, status, sendToRole };
