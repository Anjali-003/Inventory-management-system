const express = require("express");
const controller = require("./product-stock.controller");

// read only: product stock changes through the finished-goods steps (receive / give out)
const router = express.Router();

router.get("/", controller.list);
router.get("/movements", controller.movements);

module.exports = router;
