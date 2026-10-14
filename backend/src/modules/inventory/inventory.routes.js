const express = require("express");
const controller = require("./inventory.controller");
const resolveUser = require("../../middleware/resolveUser");
const { permit } = require("../../middleware/permissions");

// stock screens and the history screen are separate modules (a role can have one without the other)
const stock = permit("inventory");
const history = permit("inventoryHistory");

const router = express.Router();

// READ -------------------------------------------------------------------
router.get("/", stock, controller.list);
router.get("/ledger", stock, controller.ledger);

router.get("/components", stock, controller.componentOptions);
router.get("/components/next-sku", stock, controller.nextComponentSku);

// These must stay above "/:id" so "history" is not read as an inventory id.
router.get("/history", history, controller.monthlyHistory);
router.get("/history/daily", history, controller.dailyHistory);
router.get("/history/products", history, controller.productsUsage);
router.get("/history/balance", history, controller.balanceSheet);

router.get("/:id", stock, controller.getItem);

// WRITE (resolveUser puts the verified user on req.user) ------------------
router.post("/stock-in", stock, resolveUser, controller.stockIn);
router.post("/stock-in/batch", stock, resolveUser, controller.stockInBatch);
router.post("/:id/stock-out", stock, resolveUser, controller.stockOut);
router.put("/:id", stock, resolveUser, controller.updateItem);
router.delete("/:id", stock, resolveUser, controller.archiveItem);

module.exports = router;
