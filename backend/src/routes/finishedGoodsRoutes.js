const express = require("express")
const { getFinishedGoods, getFinishedGood, markDispatched, markCompleted } = require("../services/finishedGoodsService")

const router = express.Router()
const idOf = (value) => Number(value)
const validId = (id) => Number.isInteger(id) && id > 0

router.get("/", async (_req, res) => {
  try { res.json(await getFinishedGoods()) }
  catch (error) { console.error(error); res.status(500).json({ message: "Failed to fetch finished goods" }) }
})

router.get("/:id", async (req, res) => {
  const id = idOf(req.params.id)
  if (!validId(id)) return res.status(400).json({ message: "Invalid finished goods ID" })
  try { res.json(await getFinishedGood(id)) }
  catch (error) {
    console.error(error)
    if (error.message === "Finished goods record not found") return res.status(404).json({ message: error.message })
    res.status(500).json({ message: "Failed to fetch finished goods record" })
  }
})

async function transition(res, fn, fallback) {
  try { res.json(await fn()) }
  catch (error) {
    console.error(error)
    if (error.message === "Finished goods record not found") return res.status(404).json({ message: error.message })
    if (error.message.startsWith("Cannot dispatch") || error.message.startsWith("Cannot complete")) return res.status(409).json({ message: error.message })
    res.status(500).json({ message: fallback })
  }
}

router.post("/:id/dispatch", async (req, res) => {
  const id = idOf(req.params.id)
  if (!validId(id)) return res.status(400).json({ message: "Invalid finished goods ID" })
  return transition(res, () => markDispatched(id), "Failed to mark finished goods as dispatched")
})

router.post("/:id/complete", async (req, res) => {
  const id = idOf(req.params.id)
  if (!validId(id)) return res.status(400).json({ message: "Invalid finished goods ID" })
  return transition(res, () => markCompleted(id), "Failed to mark finished goods as completed")
})

module.exports = router
