const express = require("express");
const controller = require("./order-approval.controller");

// Read-only list for the Purchase Manager. permit("approvedOrders") is applied in routes/index.js.
const router = express.Router();

router.get("/", controller.listApproved);

module.exports = router;
