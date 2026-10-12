const hub = require("../realtime/hub");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/*
    app.use("/api/orders", authMiddleware, broadcastChanges("orders"), orderRoutes)

    After any successful write on that route group, tell every open browser that "orders" changed.
    Services/controllers don't need to know anything about realtime.
*/
function broadcastChanges(resource) {
    return (req, res, next) => {
        if (WRITE_METHODS.has(req.method)) {
            res.on("finish", () => {
                if (res.statusCode < 400) {
                    hub.broadcast({ resource, actorId: req.user && req.user.userId, at: Date.now() });
                }
            });
        }
        next();
    };
}

module.exports = broadcastChanges;
