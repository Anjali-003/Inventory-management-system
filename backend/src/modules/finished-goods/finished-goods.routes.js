const express = require("express")
const controller = require("./finished-goods.controller")
const resolveUser = require("../../middleware/resolveUser")

const router = express.Router()

router.get("/", controller.list)
router.get("/:id", controller.getOne)
router.post("/:id/dispatch", resolveUser, controller.dispatch)
router.post("/:id/complete", resolveUser, controller.complete)

module.exports = router
