const express = require("express");
const controller = require("./order.controller");
const resolveUser = require("../../middleware/resolveUser");
const { permit } = require("../../middleware/permissions");

const router = express.Router();

router.get("/", permit("orders"), controller.list);
router.post("/", permit("orders"), resolveUser, controller.create);

router.get("/:id", permit("orders"), controller.getOne);
router.patch("/:id/status", permit("orders"), controller.updateStatus);

router.get("/:id/material-check", permit("orders"), controller.materialCheck);
router.get("/:id/production-info", permit("production"), controller.productionInfo);
router.get("/:id/production-check", permit("production"), controller.productionCheck);
router.post("/:id/start-production", permit("production"), resolveUser, controller.startPartialProduction);

module.exports = router;
