/*
    In-memory SSE hub. Every logged-in browser keeps one open GET /api/events stream here.
    broadcast() pushes a small "something changed" event to all of them; the frontend then
    refetches only what it is currently showing.

    NOTE: this lives in ONE Node process. If you ever run several backend instances,
    replace broadcast() with Redis pub/sub (each instance forwards to its own clients).
*/
const clients = new Set(); // { res, userId }

function addClient(res, userId) {
    const client = { res, userId };
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
    for (const c of clients) send(c, "change", data);
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

module.exports = { addClient, broadcast, disconnectUser };
