const express = require("express");
const controller = require("./order-approval.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("orderApprovals") is applied in routes/index.js: GET = view, POST = edit (Operations Admin)
const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.get("/:id/plan", controller.plan);
router.post("/:id/approve", resolveUser, controller.approve);
router.post("/:id/reject", resolveUser, controller.reject);
router.post("/:id/dispatch", resolveUser, controller.dispatch);
router.patch("/:id/delivery-date", resolveUser, controller.updateDeliveryDate);

module.exports = router;
