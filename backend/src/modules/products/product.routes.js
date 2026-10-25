const express = require("express");
const controller = require("./product.controller");
const resolveUser = require("../../middleware/resolveUser");

const router = express.Router();

router.get("/", controller.list);

// Must stay above "/:id" so "next-sku" is not read as a product id.
router.get("/next-sku", controller.nextSku);
router.post("/", resolveUser, controller.create);
router.post("/import", resolveUser, controller.importMany);

router.get("/:id", controller.getOne);
// price list: selling price + GST % (products module is Super Admin only, so only the Super Admin sets prices)
router.put("/:id/price", controller.setPrice);

router.get("/:id/bom", controller.getBom);
router.put("/:id/bom", controller.saveBom);
router.post("/:id/bom/import", controller.importBom);

module.exports = router;
