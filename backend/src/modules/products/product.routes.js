const express = require("express");
const controller = require("./product.controller");

const router = express.Router();

router.get("/", controller.list);

// Must stay above "/:id" so "next-sku" is not read as a product id.
router.get("/next-sku", controller.nextSku);
router.post("/", controller.create);
router.post("/import", controller.importMany);

router.get("/:id", controller.getOne);

router.get("/:id/bom", controller.getBom);
router.put("/:id/bom", controller.saveBom);
router.post("/:id/bom/import", controller.importBom);

module.exports = router;
