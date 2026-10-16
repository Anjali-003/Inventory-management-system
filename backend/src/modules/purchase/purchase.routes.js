const express = require("express");
const controller = require("./purchase.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("purchase") is applied in routes/index.js: GET = view, POST = edit (purchase manager)
const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/", resolveUser, controller.create); // place order: ONLY for lines of the Operations Admin's list
router.post("/:id/receive", resolveUser, controller.receive); // goods arrived
router.post("/:id/send-to-iqc", resolveUser, controller.sendToIqc); // hand over to the IQC manager

module.exports = router;
