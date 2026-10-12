const { getProductionOrders, completeProduction, updateProductionProgress } = require("./production.service")

const idOf = (value) => Number(value)
const validId = (id) => Number.isInteger(id) && id > 0

async function list(_req, res) {
  try { res.json(await getProductionOrders()) }
  catch (error) { console.error(error); res.status(500).json({ message: "Failed to fetch production orders" }) }
}

async function updateProgress(req, res) {
  const id = idOf(req.params.id)
  const quantity = Number(req.body?.quantity)
  if (!validId(id)) return res.status(400).json({ message: "Invalid production ID" })
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity must be a positive integer" })
  try {
    res.json(await updateProductionProgress(id, quantity, req.user.id))
  } catch (error) {
    console.error(error)
    const conflict = /not currently in progress|Cannot complete more than|Inventory|Reserved inventory|On-hand inventory/.test(error.message)
    if (error.message === "Production order not found") return res.status(404).json({ message: error.message })
    res.status(conflict ? 409 : 500).json({ message: conflict ? error.message : "Failed to update production" })
  }
}

async function complete(req, res) {
  const id = idOf(req.params.id)
  if (!validId(id)) return res.status(400).json({ message: "Invalid production ID" })
  try {
    res.json(await completeProduction(id, req.user.id))
  } catch (error) {
    console.error(error)
    if (error.message === "Production order not found") return res.status(404).json({ message: error.message })
    if (error.message.includes("not currently in progress") || error.message.includes("waiting to be completed")) return res.status(409).json({ message: error.message })
    res.status(500).json({ message: "Failed to complete production" })
  }
}

module.exports = { list, updateProgress, complete }
