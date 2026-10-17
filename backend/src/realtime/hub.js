/*
    In-memory SSE hub. Every logged-in browser keeps one open GET /api/events stream here.
    broadcast() pushes a small "something changed" event to all of them; the frontend then
    refetches only what it is currently showing.

    NOTE: this lives in ONE Node process. If you ever run several backend instances,
    replace broadcast() with Redis pub/sub (each instance forwards to its own clients).
*/
const { eventAccess } = require("../middleware/permissions");

const clients = new Set(); // { res, userId, role }

function addClient(res, userId, role) {
    const client = { res, userId, role };
    clients.add(client);
    return () => clients.delete(client);
}

function send(client, event, data) {
    try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
        clients.delete(client);
    }
}

function broadcast(data) {
    for (const c of clients) {
        // each role only hears about what it may open (see middleware/permissions.js)
        const access = eventAccess(c.role, data.resource);
        if (access === "full") send(c, "change", data);
        else if (access === "refresh") send(c, "change", { ...data, activity: null });
    }
}

/*
    Targeted notification: only the open tabs of ONE role hear it (e.g. "STORE_MANAGER").
    Call it from conn.afterCommit(...) so nobody is told about something that was rolled back.
*/
function notifyRole(role, data) {
    for (const c of clients) {
        if (c.role === role) send(c, "notify", { ...data, at: Date.now() });
    }
}

/* Used when a super admin is deactivated: tell their open tabs to log out, then close. */
function disconnectUser(userId) {
    for (const c of [...clients]) {
        if (c.userId !== userId) continue;
        send(c, "logout", {});
        c.res.end();
        clients.delete(c);
    }
}

setInterval(() => {
    for (const c of clients) {
        try { c.res.write(": ping\n\n"); } catch { clients.delete(c); }
    }
}, 25000).unref();

module.exports = { addClient, broadcast, notifyRole, disconnectUser };
