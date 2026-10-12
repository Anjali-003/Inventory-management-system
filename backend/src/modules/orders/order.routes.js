const express = require("express");
const controller = require("./order.controller");
const resolveUser = require("../../middleware/resolveUser");

const router = express.Router();

router.get("/", controller.list);
router.post("/", controller.create);

router.get("/:id", controller.getOne);
router.patch("/:id/status", controller.updateStatus);

router.get("/:id/material-check", controller.materialCheck);
router.get("/:id/production-info", controller.productionInfo);
router.get("/:id/production-check", controller.productionCheck);
router.post("/:id/start-production", resolveUser, controller.startPartialProduction);

module.exports = router;
