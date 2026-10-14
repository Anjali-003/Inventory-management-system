const express = require("express");
const controller = require("./iqc.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("iqc") is applied in routes/index.js: GET = view (store manager may look), POST = edit (IQC manager)
const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/:id/inspect", resolveUser, controller.inspect);

module.exports = router;
