const express = require("express");
const controller = require("./marketing-order.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("marketingOrders") is applied in routes/index.js: GET = view, POST/DELETE = edit (Marketing Manager)
const router = express.Router();

router.get("/", controller.list);
router.get("/products", controller.products); // above "/:id"
router.get("/customers", controller.customers); // the saved customers, for the New order picker
router.post("/", resolveUser, controller.create); // save as draft
router.post("/:id/send", resolveUser, controller.send); // send to the Operations Admin
router.post("/:id/accept-revision", resolveUser, controller.acceptRevision); // agree to the admin's reduced quantity
router.post("/:id/decline-revision", resolveUser, controller.declineRevision); // do not agree: the order is cancelled
router.delete("/:id", resolveUser, controller.remove); // drafts only

module.exports = router;
