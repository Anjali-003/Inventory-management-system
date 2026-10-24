/*
  The numbers behind the purchase order planner (PurchasePlanner.jsx).

  One row per component that is worth buying:
    - needed for orders: open requirement lines (the Operations Admin's lists of approved orders, not ordered yet)
    - low / out of stock: on hand at or below the minimum stock level
  Suppliers sell round figures, so the suggested quantity is rounded UP to a "step" (10, 50, 100 ...). It is never below
  what the included orders need (the server refuses that too); anything above goes to stock.
*/

export const STEPS = [
  { id: "auto", label: "Auto" },
  { id: "1", label: "Exact" },
  { id: "10", label: "10" },
  { id: "50", label: "50" },
  { id: "100", label: "100" },
  { id: "500", label: "500" },
]

/* "Auto": a step that suits the size of the number (8 -> 10, 230 -> 250, 4,300 -> 4,500). */
export function autoStep(q) {
  if (q <= 100) return 10
  if (q <= 1000) return 50
  if (q <= 10000) return 500
  return 1000
}

/* Rounds UP to the step; "Exact" keeps the number (to 2 decimals, like the server). */
export function roundUp(q, step) {
  const n = Math.max(0, Number(q) || 0)
  const s = step === "auto" ? autoStep(n) : Number(step)
  if (s <= 1) return Math.ceil(n * 100) / 100
  return Math.max(s, Math.ceil(n / s) * s)
}

/*
  approvedOrders: GET /approved-orders (purchase_request.items per order)
  inventory:      GET /inventory (stock per component)
  onOrder:        Map component_id -> quantity already ordered and not in stock yet
  -> [{ component_id, sku, name, unit, lines: [{ request_item_id, order_id, order_number, quantity }],
        onHand, minimum, onOrder, low, out }]
*/
export function buildRows(approvedOrders = [], inventory = [], onOrder = new Map()) {
  const rows = new Map()
  const row = (id, info) => {
    if (!rows.has(id)) {
      rows.set(id, { component_id: id, sku: info.sku || "", name: info.name || `Component #${id}`, unit: info.unit || "pcs", lines: [], onHand: 0, minimum: 0, onOrder: onOrder.get(id) || 0, inStockList: false })
    }
    return rows.get(id)
  }

  for (const order of approvedOrders || []) {
    for (const l of order.purchase_request?.items || []) {
      if (l.purchase_order_id != null) continue // already on a purchase order
      row(l.component_id, l).lines.push({ request_item_id: l.request_item_id, order_id: order.id, order_number: order.order_number, quantity: Number(l.quantity) })
    }
  }
  for (const i of inventory || []) {
    const r = row(i.component_id, { sku: i.sku, name: i.component_name, unit: i.unit })
    r.onHand = Number(i.quantity_on_hand) || 0
    r.minimum = Number(i.minimum_stock_level) || 0
    r.inStockList = true
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      out: r.inStockList && r.onHand <= 0,
      low: r.inStockList && r.onHand <= r.minimum,
    }))
    .sort((a, b) => b.lines.length - a.lines.length || Number(b.out) - Number(a.out) || Number(b.low) - Number(a.low) || a.name.localeCompare(b.name))
}

export const needOf = (row, excluded = new Set()) => row.lines.filter((l) => !excluded.has(l.request_item_id)).reduce((s, l) => s + l.quantity, 0)

/*
  What to suggest buying: what the included orders need, plus (for a low / out of stock component) enough to get back
  to twice the minimum, counting what is already on order. Rounded up to the step.
*/
export function suggestQty(row, excluded, step) {
  const need = needOf(row, excluded)
  const refill = row.low ? Math.max(0, row.minimum * 2 - row.onHand - row.onOrder) : 0
  const target = need + refill
  return target > 0 ? roundUp(target, step) : roundUp(1, step)
}
