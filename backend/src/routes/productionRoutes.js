const express = require("express")
const { getProductionOrders, completeProduction, updateProductionProgress } = require("../services/productionService")

const router = express.Router()
const idOf = (value) => Number(value)

router.get("/", async (_req, res) => {
  try { res.json(await getProductionOrders()) }
  catch (error) { console.error(error); res.status(500).json({ message: "Failed to fetch production orders" }) }
})

router.post("/:id/update-progress", async (req, res) => {
  const id = idOf(req.params.id)
  const quantity = Number(req.body?.quantity)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid production ID" })
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity must be a positive integer" })
  try {
    res.json(await updateProductionProgress(id, quantity, 1))
  } catch (error) {
    console.error(error)
    const conflict = /not currently in progress|Cannot complete more than|Inventory|Reserved inventory|On-hand inventory/.test(error.message)
    if (error.message === "Production order not found") return res.status(404).json({ message: error.message })
    res.status(conflict ? 409 : 500).json({ message: conflict ? error.message : "Failed to update production" })
  }
})

router.post("/:id/complete", async (req, res) => {
  const id = idOf(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid production ID" })
  try {
    res.json(await completeProduction(id, 1))
  } catch (error) {
    console.error(error)
    if (error.message === "Production order not found") return res.status(404).json({ message: error.message })
    if (error.message.includes("not currently in progress") || error.message.includes("waiting to be completed")) return res.status(409).json({ message: error.message })
    res.status(500).json({ message: "Failed to complete production" })
  }
})

module.exports = router
