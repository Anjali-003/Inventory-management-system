const activity = require("../modules/activity/activity.service");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/*
    app.use("/api/orders", authMiddleware, broadcastChanges("orders"), orderRoutes)

    After any successful write on that route group:
      1. a row is added to activity_log (who, what, when), and
      2. every open browser gets { resource, activity } over the live stream.
    Services/controllers don't need to know anything about activity or realtime.
*/
function broadcastChanges() {
    return (req, res, next) => {
        if (WRITE_METHODS.has(req.method)) {
            res.on("finish", () => {
                if (res.statusCode >= 400 || !req.user) return;
                activity.log({
                    userId: req.user.userId,
                    userName: req.user.name,
                    ...activity.describe(req.method, req.originalUrl)
                });
            });
        }
        next();
    };
}

module.exports = broadcastChanges;
