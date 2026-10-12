const express = require("express")
const controller = require("./finished-goods.controller")

const router = express.Router()

router.get("/", controller.list)
router.get("/:id", controller.getOne)
router.post("/:id/dispatch", controller.dispatch)
router.post("/:id/complete", controller.complete)

module.exports = router
