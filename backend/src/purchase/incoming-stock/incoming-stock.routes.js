const express = require("express");
const controller = require("./incoming-stock.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("incomingStock") is applied in routes/index.js (store manager = edit)
const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/:id/accept", resolveUser, controller.accept);

module.exports = router;
