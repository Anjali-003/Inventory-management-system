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

router.post("/:id/receive", ...by("STORE_MANAGER"), controller.step("receive"))
router.post("/:id/bill", ...by("MARKETING_MANAGER"), controller.createBill)
router.post("/:id/payments", ...by("MARKETING_MANAGER"), controller.addPayment)
// fixing a bill is the Super Admin's call: cancel it while the goods are in the Store, a credit note after they left
router.post("/:id/bill/cancel", resolveUser, requireRole("SUPER_ADMIN"), controller.cancelBill)
router.post("/:id/credit-note", resolveUser, requireRole("SUPER_ADMIN"), controller.addCreditNote)
router.post("/:id/dispatch", ...by("STORE_MANAGER"), controller.step("dispatch"))

module.exports = router
