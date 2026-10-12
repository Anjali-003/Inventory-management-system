const express = require("express");
const controller = require("./super-admin.controller");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

router.use(requireRole("SUPER_ADMIN"));

router.get("/", controller.list);
router.post("/", controller.create);
router.post("/:id/deactivate", controller.deactivate);
router.post("/:id/activate", controller.activate);

module.exports = router;
