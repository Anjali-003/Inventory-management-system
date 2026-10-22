/*
  Order planner: "what can we build RIGHT NOW, and what do we have to buy for the rest?"

  Pure CommonJS, no database and no dependencies, so it is easy to test (tests/order-planner.test.js).
  order-approval.service.js loads the data and calls it. The frontend never runs it: it only calls
  GET /order-approvals/:id/plan and shows the result.

  Inputs
    items             order lines, in priority order:  [{ product_id, quantity }]
    bomByProduct      { [product_id]: [{ component_id, quantity_per_unit }] }   (components for ONE unit)
    availableByComp   { [component_id]: available }   available = current on-hand stock; reservation logic is not used
    componentInfo     optional { [component_id]: { sku, name, unit } } copied into the shortage rows

  How it works
    1. Lines are served one after another. For a line: can_make = the smallest whole number of units that
       every BOM component still allows (floor(available / per_unit) over all components), capped at the
       ordered quantity. The components used for those units are taken out of the pool BEFORE the next line,
       so two products that share a component never promise the same stock twice.
    2. remaining = ordered - can_make.
    3. For the remaining units, per component: needed = sum(remaining x per_unit); free = what is still in
       the pool after step 1; shortage = max(0, needed - free). Only components with shortage > 0 are returned.
    4. A product without a BOM cannot be planned: can_make 0, listed in missing_bom, no shortage rows for it.

  All maths is done in hundredths (like the ledger), so 0.1 + 0.2 style float errors cannot appear.
*/

const toCents = (v) => Math.round(Number(v || 0) * 100)
const fromCents = (c) => c / 100

function planOrder({ items, bomByProduct, availableByComp, componentInfo = {} }) {
  const pool = {}
  for (const [id, qty] of Object.entries(availableByComp || {})) pool[id] = Math.max(0, toCents(qty))

  const lines = []
  const missingBom = []
  const remainingUnits = [] // [{ product_id, remaining }] for the shortage step

  for (const it of items) {
    const ordered = Number(it.quantity) || 0
    const bom = bomByProduct[it.product_id] || []

    if (bom.length === 0) {
      missingBom.push(it.product_id)
      lines.push({ product_id: it.product_id, ordered, can_make: 0, remaining: ordered, has_bom: false })
      continue
    }

    let canMake = ordered
    for (const b of bom) {
      const per = toCents(b.quantity_per_unit)
      if (per <= 0) continue
      canMake = Math.min(canMake, Math.floor((pool[b.component_id] || 0) / per))
    }
    canMake = Math.max(0, Math.floor(canMake))

    for (const b of bom) pool[b.component_id] = (pool[b.component_id] || 0) - canMake * toCents(b.quantity_per_unit)

    const remaining = Math.round((ordered - canMake) * 100) / 100 // ordered can have 2 decimals
    lines.push({ product_id: it.product_id, ordered, can_make: canMake, remaining, has_bom: true })
    if (remaining > 0) remainingUnits.push({ product_id: it.product_id, remaining })
  }

  const need = {}
  for (const r of remainingUnits)
    for (const b of bomByProduct[r.product_id])
      need[b.component_id] = (need[b.component_id] || 0) + Math.round(r.remaining * toCents(b.quantity_per_unit))

  const shortages = []
  for (const [id, needed] of Object.entries(need)) {
    const free = Math.max(0, pool[id] || 0)
    const short = needed - free
    if (short > 0) {
      const info = componentInfo[id] || {}
      shortages.push({
        component_id: Number(id), sku: info.sku, name: info.name, unit: info.unit,
        required: fromCents(needed), available: fromCents(free), shortage: fromCents(short),
      })
    }
  }

  return {
    fully_producible: lines.length > 0 && lines.every((l) => l.remaining === 0),
    lines,
    shortages,
    missing_bom: missingBom,
  }
}

module.exports = { planOrder }
