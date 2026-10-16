const express = require("express");
const controller = require("./marketing-order.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("marketingOrders") is applied in routes/index.js: GET = view, POST/DELETE = edit (Marketing Manager)
const router = express.Router();

router.get("/", controller.list);
router.get("/products", controller.products); // above "/:id"
router.post("/", resolveUser, controller.create); // save as draft
router.post("/:id/send", resolveUser, controller.send); // send to the Operations Admin
router.delete("/:id", resolveUser, controller.remove); // drafts only

module.exports = router;
