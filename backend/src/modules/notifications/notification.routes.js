const express = require("express");
const controller = require("./notification.controller");
const resolveUser = require("../../middleware/resolveUser");

// Any logged-in role: each one only ever sees and changes its own role's inbox (see notification.service.js)
const router = express.Router();

router.get("/", controller.list);
router.post("/read-all", resolveUser, controller.markAllRead);
router.post("/:id/read", resolveUser, controller.markRead);
router.post("/:id/done", resolveUser, controller.markDone);

module.exports = router;
