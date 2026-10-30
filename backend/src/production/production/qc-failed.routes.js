const express = require("express")
const controller = require("./production.controller")
const resolveUser = require("../../middleware/resolveUser")

const router = express.Router()

// QC recovery is a separate permission-protected workspace. It reuses the
// existing production business logic so quantities and QC history stay intact.
router.get("/", controller.list)
router.post("/:id/rework/start", resolveUser, controller.startRework)
router.post("/:id/rework/submit", resolveUser, controller.submitRework)

module.exports = router
