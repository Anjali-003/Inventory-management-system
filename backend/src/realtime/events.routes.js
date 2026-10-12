const express = require("express");
const hub = require("./hub");

const router = express.Router();

/* GET /api/events  (mounted behind authMiddleware) */
router.get("/", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no" // nginx: don't buffer the stream
    });
    res.flushHeaders();
    res.write("retry: 3000\n\n");

    const remove = hub.addClient(res, req.user.userId);
    req.on("close", remove);
});

module.exports = router;
