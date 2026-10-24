const express = require("express")
const controller = require("./quality-control.controller")
const resolveUser = require("../../middleware/resolveUser")

const router = express.Router()

router.get("/", controller.list)
router.get("/:productionId", controller.getOne)
router.post("/:productionId/decision", resolveUser, controller.decideBatch)
router.post("/:productionId/testing", resolveUser, controller.saveTesting)
router.patch("/:productionId/testing/redo", resolveUser, controller.redoTestingResult)
router.patch("/:productionId/qc/redo", resolveUser, controller.redoQcResult)
router.post("/:productionId/qc", resolveUser, controller.saveQc)

module.exports = router
