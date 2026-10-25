const express = require("express")
const controller = require("./finished-goods.controller")
const resolveUser = require("../../middleware/resolveUser")
const requireRole = require("../../middleware/requireRole")

const router = express.Router()

// every step has ONE owner role (Super Admin can do all of them)
const by = (role) => [resolveUser, requireRole(role, "SUPER_ADMIN")]

router.get("/", controller.list)
router.get("/:id", controller.getOne)
router.get("/:id/bill", controller.getBill)

router.post("/:id/pack", ...by("QUALITY_FG_MANAGER"), controller.step("pack"))
router.post("/:id/hand-over", ...by("OPERATIONS_ADMIN"), controller.step("handOver"))
router.post("/:id/receive", ...by("STORE_MANAGER"), controller.step("receive"))
router.post("/:id/bill", ...by("MARKETING_MANAGER"), controller.createBill)
router.post("/:id/dispatch", ...by("STORE_MANAGER"), controller.step("dispatch"))
router.post("/:id/deliver", ...by("MARKETING_MANAGER"), controller.step("deliver"))

module.exports = router
