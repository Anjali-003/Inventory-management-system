const express = require("express")
const {
  getQualityControlOrders,
  getQualityControlInfo,
  saveTestingResult,
  redoTesting,
  saveQualityControlResult
} = require("../services/qualityControlService")

const router = express.Router()
const idOf = (value) => Number(value)

router.get("/", async (_req, res) => {
  try {
    res.json(await getQualityControlOrders())
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Failed to fetch quality control orders" })
  }
})

router.get("/:productionId", async (req, res) => {
  const id = idOf(req.params.productionId)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid production ID" })
  }

  try {
    res.json(await getQualityControlInfo(id))
  } catch (error) {
    console.error(error)

    if (error.message === "Production order not found") {
      return res.status(404).json({ message: error.message })
    }

    res.status(500).json({ message: "Failed to fetch quality control information" })
  }
})

router.post("/:productionId/testing", async (req, res) => {
  const id = idOf(req.params.productionId)
  const quantity = Number(req.body?.quantity)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid production ID" })
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "Testing quantity must be a positive integer" })
  }

  try {
    res.status(201).json(
      await saveTestingResult(id, quantity, req.body?.overallResult, req.body?.remarks, 1)
    )
  } catch (error) {
    console.error(error)

    if (error.message === "Production order not found") {
      return res.status(404).json({ message: error.message })
    }

    if (/positive integer|PASS or FAIL/.test(error.message)) {
      return res.status(400).json({ message: error.message })
    }

    if (error.message.includes("remaining untested quantity")) {
      return res.status(409).json({ message: error.message })
    }

    res.status(500).json({ message: "Failed to save testing result" })
  }
})

router.patch("/:productionId/testing/redo", async (req, res) => {
  const productionId = idOf(req.params.productionId)
  const redoPassed = Number(req.body?.redoPassed)

  if (!Number.isInteger(productionId) || productionId <= 0) {
    return res.status(400).json({ message: "Invalid production ID" })
  }

  if (!Number.isInteger(redoPassed) || redoPassed < 0) {
    return res.status(400).json({
      message: "Redo passed quantity must be a non-negative integer"
    })
  }

  try {
    res.json(await redoTesting(productionId, redoPassed, 1))
  } catch (error) {
    console.error(error)

    if (error.message === "Production order not found") {
      return res.status(404).json({ message: error.message })
    }

    if (
      error.message.includes("non-negative integer") ||
      error.message.includes("cannot exceed total failed quantity")
    ) {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({
      message: "Failed to save redo testing result"
    })
  }
})

router.post("/:productionId/qc", async (req, res) => {
  const id = idOf(req.params.productionId)
  const quantity = Number(req.body?.quantity)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid production ID" })
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "QC quantity must be a positive integer" })
  }

  try {
    res.status(201).json(
      await saveQualityControlResult(id, quantity, req.body?.overallResult, req.body?.remarks, 1)
    )
  } catch (error) {
    console.error(error)

    if (error.message === "Production order not found") {
      return res.status(404).json({ message: error.message })
    }

    if (/positive integer|PASS or FAIL/.test(error.message)) {
      return res.status(400).json({ message: error.message })
    }

    if (error.message.includes("available for QC")) {
      return res.status(409).json({ message: error.message })
    }

    res.status(500).json({ message: "Failed to save quality control result" })
  }
})

module.exports = router
