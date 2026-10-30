const express = require("express");
const controller = require("./push.controller");
const resolveUser = require("../../middleware/resolveUser");

// Any logged-in role: a browser turns phone / desktop notifications on or off for the role it is logged in as
const router = express.Router();

router.get("/config", controller.config);
router.get("/status", controller.status);
router.post("/subscribe", resolveUser, controller.subscribe);
router.post("/unsubscribe", resolveUser, controller.unsubscribe);

module.exports = router;
