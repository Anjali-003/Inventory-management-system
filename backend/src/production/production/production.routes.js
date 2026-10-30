const express = require("express")
const controller = require("./production.controller")
const resolveUser = require("../../middleware/resolveUser")

const router = express.Router()

router.get("/", controller.list)
router.post("/:id/update-progress", resolveUser, controller.updateProgress)
router.post("/:id/complete", resolveUser, controller.complete)
router.post("/:id/rework/start", resolveUser, controller.startRework)
router.post("/:id/rework/submit", resolveUser, controller.submitRework)

module.exports = router
