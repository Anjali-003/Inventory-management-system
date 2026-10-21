const express = require("express");
const controller = require("./notification.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("notifications") is applied in routes/index.js: GET = view, POST = edit (Store Manager)
const router = express.Router();

router.get("/", controller.list);
router.post("/:id/done", resolveUser, controller.markDone);

module.exports = router;
