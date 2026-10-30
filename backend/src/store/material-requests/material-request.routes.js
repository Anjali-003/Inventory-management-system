const express = require("express");
const controller = require("./material-request.controller");
const resolveUser = require("../../middleware/resolveUser");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

router.get("/", controller.list);
router.get("/options/:orderItemId", requireRole("PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"), controller.options);
router.post("/", resolveUser, requireRole("PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"), controller.create);
router.post("/:id/issue", resolveUser, requireRole("STORE_MANAGER", "SUPER_ADMIN"), controller.issue);

module.exports = router;
