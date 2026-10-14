const activity = require("../modules/activity/activity.service");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/*
    router.use("/orders", authMiddleware, broadcastChanges("orders"), orderRoutes)

    After any successful write on that route group:
      1. a row is added to activity_log (who, what, when), and
      2. every open browser gets { resource, activity } over the live stream.
    Services/controllers don't need to know anything about activity or realtime.

    `resource` is the module name ("orders", "quality-control" ...): it is what the activity feed
    and the live-refresh tags are keyed on, so it never depends on the URL prefix.
*/
function broadcastChanges(resource) {
    return (req, res, next) => {
        if (WRITE_METHODS.has(req.method)) {
            const subPath = req.path; // path below the module mount point, captured while it is still available
            res.on("finish", () => {
                if (res.statusCode >= 400 || !req.user) return;
                activity.log({
                    userId: req.user.userId,
                    userName: req.user.name,
                    ...activity.describe(req.method, resource, subPath)
                });
            });
        }
        next();
    };
}

module.exports = broadcastChanges;
