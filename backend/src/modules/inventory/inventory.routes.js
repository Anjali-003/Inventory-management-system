const express = require("express");
const controller = require("./inventory.controller");
const resolveUser = require("../../middleware/resolveUser");

const router = express.Router();

// READ -------------------------------------------------------------------
router.get("/", controller.list);
router.get("/ledger", controller.ledger);

router.get("/components", controller.componentOptions);
router.get("/components/next-sku", controller.nextComponentSku);

// These must stay above "/:id" so "history" is not read as an inventory id.
router.get("/history", controller.monthlyHistory);
router.get("/history/daily", controller.dailyHistory);
router.get("/history/products", controller.productsUsage);
router.get("/history/balance", controller.balanceSheet);

router.get("/:id", controller.getItem);

// WRITE (resolveUser puts the verified user on req.user) ------------------
router.post("/stock-in", resolveUser, controller.stockIn);
router.post("/stock-in/batch", resolveUser, controller.stockInBatch);
router.post("/:id/stock-out", resolveUser, controller.stockOut);
router.put("/:id", resolveUser, controller.updateItem);
router.delete("/:id", resolveUser, controller.archiveItem);

module.exports = router;
