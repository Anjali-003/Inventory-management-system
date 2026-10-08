/*
  Mock seed data (used only when VITE_DATA_MODE=mock).

  Every date is generated RELATIVE TO TODAY, so the ledger always spans roughly the last 3 months
  (stock-ins, production consumption, stock-outs, adjustments). That makes the date filters,
  Inventory History month view and the balance sheet testable without touching the MySQL database.

  Quantities are tracked as integer "cents" (hundredths), exactly like the real backend.
  Everything is derived from the ledger, so on-hand == ledger balance (in_sync) by construction.
*/

const pad = (n) => String(n).padStart(2, "0")
export const fmtDT = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const fmtD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// small seeded PRNG so the data is the same on every reload (but still relative to today)
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const USERS = [
  { id: 1, name: "Admin", email: "admin@example.com", role: "admin" },
  { id: 2, name: "Store Keeper", email: "store@example.com", role: "staff" },
  { id: 3, name: "Purchase Desk", email: "purchase@example.com", role: "staff" },
]

// [id, sku, name, unit, category, size, location]
const COMPONENTS = [
  [1, "CMP-001", "Resistor 10K", "pcs", "Resistor", "0805", "Rack A1"],
  [2, "CMP-002", "Resistor 4.7K", "pcs", "Resistor", "0805", "Rack A1"],
  [3, "CMP-003", "Capacitor 100nF", "pcs", "Capacitor", "0603", "Rack A2"],
  [4, "CMP-004", "Electrolytic Capacitor 470uF 16V", "pcs", "Capacitor", "8x12 mm", "Rack A2"],
  [5, "CMP-005", "LED Red", "pcs", "LED", "5mm", "Rack B1"],
  [6, "CMP-006", "LED Green", "pcs", "LED", "5mm", "Rack B1"],
  [7, "CMP-007", "ESP32 WROOM Module", "pcs", "Module", "18x25 mm", "Rack C1"],
  [8, "CMP-008", "Relay 5V 10A", "pcs", "Relay", "19x15 mm", "Rack C2"],
  [9, "CMP-009", "PCB Main Board v2", "pcs", "PCB", "100x80 mm", "Rack D1"],
  [10, "CMP-010", "Enclosure ABS Grey", "pcs", "Enclosure", "120x90x40 mm", "Rack D2"],
  [11, "CMP-011", "DC Jack 2.1mm", "pcs", "Connector", "2.1mm", "Rack B2"],
  [12, "CMP-012", "Fuse 5A Glass", "pcs", "Fuse", "5x20 mm", "Rack B2"],
  [13, "CMP-013", "Solder Wire 0.8mm", "kg", "Consumable", "0.8mm", "Rack E1"],
  [14, "CMP-014", "IR Sensor (old model)", "pcs", "Sensor", "3mm", "Rack E2"],
]

const PRODUCTS = [
  { id: 1, sku: "PRD-001", name: "Smart Controller", description: "Wi-Fi relay controller" },
  { id: 2, sku: "PRD-002", name: "Sensor Node", description: "Battery sensor node" },
]
// product id -> [[component id, qty per unit], ...]
const BOM = {
  1: [[1, 4], [3, 6], [4, 2], [5, 3], [7, 1], [8, 2], [9, 1], [10, 1], [11, 1], [12, 1]],
  2: [[2, 3], [3, 4], [6, 2], [7, 1], [9, 1], [11, 1]],
}
const PRODUCED = { 1: 40, 2: 25 } // finished units
const IN_PROGRESS = { 1: 8, 2: 5 } // consumed but not finished yet

// [id, number, status, product id, qty, days ago]
const ORDERS = [
  [1, "ORD-001", "COMPLETED", 1, 20, 72],
  [2, "ORD-002", "COMPLETED", 2, 15, 61],
  [3, "ORD-003", "COMPLETED", 1, 20, 47],
  [4, "ORD-004", "IN_PRODUCTION", 1, 8, 21],
  [5, "ORD-005", "COMPLETED", 2, 10, 30],
  [6, "ORD-006", "PENDING", 2, 5, 9],
]

const REASON_LABELS = {
  ISSUED_TO_PRODUCTION: "Issued to production",
  PRODUCTION_WASTAGE: "Production wastage / rejected",
  DAMAGED: "Damaged / scrapped",
  REPLACEMENT: "Replacement issued",
  QUALITY_CONTROL: "Quality control / inspection",
  TESTING: "Testing / trial",
  RND: "R&D / experiment",
  REWORK: "Rework / repair",
  CUSTOMER_SAMPLE: "Customer sample / demo",
  WARRANTY: "Warranty / customer replacement",
  LOST: "Lost / missing",
  WRONG_ISSUE: "Issued by mistake / excess",
  RETURNED_TO_SUPPLIER: "Returned to supplier",
  SAMPLE_TESTING: "Sample / testing",
  OTHER: "Other",
  ADJUSTMENT: "Stock count adjustment",
}
export { REASON_LABELS }

// reason code -> needs an order?
const OUT_REASONS = [
  ["DAMAGED", true, "Damaged during assembly"],
  ["TESTING", true, "Used for trial run"],
  ["RETURNED_TO_SUPPLIER", false, "Returned to supplier - wrong spec"],
  ["RND", true, "R&D prototype build"],
  ["LOST", false, "Not found during rack audit"],
  ["QUALITY_CONTROL", true, "QC sample pulled"],
  ["REPLACEMENT", true, "Replacement issued to customer"],
]

export function buildSeed(now = new Date()) {
  const rnd = mulberry32(20260101)
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1))

  const at = (daysAgo, hour = between(8, 18)) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, between(0, 59), between(0, 59), 0)
    return d
  }

  const components = COMPONENTS.map(([id, sku, name, unit, category, size, location]) => ({
    id, sku, name, unit, category, size, location, description: null, minimum_stock_level: 0,
    is_active: 1, archived_at: null, reserved: 0,
  }))
  const orders = ORDERS.map(([id, order_number, status, product_id, quantity, d]) => ({
    id, order_number, status, product_id, quantity, created_at: fmtDT(at(d, 10)),
    product_name: PRODUCTS.find((p) => p.id === product_id).name,
  }))

  // how many of each component production used (finished + in progress)
  const needed = {}
  Object.entries(BOM).forEach(([pid, lines]) =>
    lines.forEach(([cid, q]) => { needed[cid] = (needed[cid] || 0) + (PRODUCED[pid] + IN_PROGRESS[pid]) * q })
  )

  const events = [] // everything except opening balances
  const ev = (component_id, type, direction, units, when, extra = {}) =>
    events.push({ component_id, type, direction, cents: Math.round(units * 100), when, ...extra })

  for (const c of components) {
    const used = needed[c.id] || 0

    // 1) purchase receipts spread over the last ~80 days
    const total = used ? Math.round(used * 1.5) : c.id === 13 ? 30 : 40
    const windows = [[78, 62], [56, 40], [34, 18], [12, 2]].slice(0, c.id % 2 ? 4 : 3)
    const weights = windows.map(() => 0.5 + rnd())
    const wsum = weights.reduce((a, b) => a + b, 0)
    let left = total
    windows.forEach(([hi, lo], i) => {
      const units = i === windows.length - 1 ? left : Math.max(1, Math.round((total * weights[i]) / wsum))
      left -= units
      if (units <= 0) return
      const po = `PO-${between(1000, 9999)}`
      ev(c.id, "STOCK_IN", "IN", units, at(between(lo, hi)), {
        reason: `Purchase receipt ${po}`, reference_no: po, created_by: pick([2, 3]),
      })
    })

    // 2) production consumption (3 rows, tied to production orders)
    if (used) {
      const parts = [0.4, 0.35, 0.25]
      let rest = used
      parts.forEach((p, i) => {
        const u = i === parts.length - 1 ? rest : Math.round(used * p)
        rest -= u
        const oid = [1, 2, 3, 4, 5][(c.id + i) % 5]
        if (u > 0) ev(c.id, "CONSUMED", "OUT", u, at([55, 35, 12][i]), {
          reason: `Production order #${oid}`, reference_type: "PRODUCTION_ORDER", reference_id: oid, created_by: null,
        })
      })
    }

    // 3) a couple of manual stock-outs with structured reasons
    const outs = c.id % 3 === 0 ? 2 : 1
    for (let k = 0; k < outs; k++) {
      const [code, needsOrder, text] = OUT_REASONS[(c.id + k) % OUT_REASONS.length]
      const units = Math.max(1, Math.round((used || 20) * 0.02))
      const order = needsOrder ? pick(orders.filter((o) => o.status !== "PENDING")) : null
      ev(c.id, "STOCK_OUT", "OUT", units, at(between(4, 50)), {
        reason: text, reason_code: code, order_id: order ? order.id : null, created_by: 2,
      })
    }

    // 4) occasional stock-count adjustments
    if (c.id % 4 === 0) ev(c.id, "ADJUSTMENT_OUT", "OUT", 3, at(between(6, 25)), { reason: "Stock count correction", created_by: 1 })
    if (c.id % 5 === 0) ev(c.id, "ADJUSTMENT_IN", "IN", 2, at(between(6, 25)), { reason: "Stock count: found extra", created_by: 1 })
  }

  // 5) group by component, add opening balance so the running balance never dips below zero
  const ledger = []
  for (const c of components) {
    const mine = events.filter((e) => e.component_id === c.id).sort((a, b) => a.when - b.when)
    let run = 0, min = 0
    mine.forEach((e) => { run += e.direction === "IN" ? e.cents : -e.cents; min = Math.min(min, run) })
    const opening = Math.max(-min, 0) + Math.round(((needed[c.id] || 5) * 0.2 + 5) * 100)
    ledger.push({
      component_id: c.id, type: "OPENING_BALANCE", direction: "IN", cents: opening, when: at(92, 0),
      reason: "Opening balance (existing stock before the ledger was enforced)", created_by: null,
    })
    ledger.push(...mine)
    run = opening + run

    // special cases
    if (c.id === 12) { // sold out: the rest goes back to the supplier
      ledger.push({ component_id: 12, type: "STOCK_OUT", direction: "OUT", cents: run, when: at(2, 11),
        reason: "Returned to supplier - batch recalled", reason_code: "RETURNED_TO_SUPPLIER", created_by: 2 })
    }
    if (c.id === 14) { // archived item
      ledger.push({ component_id: 14, type: "STOCK_OUT", direction: "OUT", cents: run, when: at(15, 12),
        reason: "Model discontinued, remaining stock scrapped", reason_code: "OTHER", created_by: 2 })
      ledger.push({ component_id: 14, type: "ARCHIVED", direction: "NONE", cents: 0, when: at(14, 9),
        reason: "Archived by user", created_by: 1 })
      c.is_active = 0
      c.archived_at = fmtDT(at(14, 9))
    }
  }

  // production reservations (do not change on-hand)
  ;[[7, 12], [9, 10]].forEach(([cid, q]) => {
    ledger.push({ component_id: cid, type: "RESERVED", direction: "RESERVE", cents: q * 100, when: at(3, 10),
      reason: "Production order #4", reference_type: "PRODUCTION_ORDER", reference_id: 4, created_by: null })
    components.find((c) => c.id === cid).reserved = q * 100
  })

  // 6) global order: by time, then assign ids and running balance
  ledger.sort((a, b) => a.when - b.when)
  const run = {}
  const rows = ledger.map((e, i) => {
    if (e.direction === "IN") run[e.component_id] = (run[e.component_id] || 0) + e.cents
    if (e.direction === "OUT") run[e.component_id] = (run[e.component_id] || 0) - e.cents
    return {
      id: i + 1,
      component_id: e.component_id,
      transaction_type: e.type,
      direction: e.direction,
      cents: e.cents,
      balance_after: run[e.component_id] || 0,
      reason: e.reason || null,
      reason_code: e.reason_code || null,
      reference_no: e.reference_no || null,
      reference_type: e.reference_type || null,
      reference_id: e.reference_id || null,
      created_by: e.created_by ?? null,
      order_id: e.order_id || null,
      created_at: fmtDT(e.when),
      idempotency_key: null,
    }
  })

  // 7) minimum stock levels: mostly healthy, two components deliberately low
  components.forEach((c) => {
    const onHand = run[c.id] || 0
    c.minimum_stock_level = c.id === 3 || c.id === 8 ? onHand + 4000 : Math.max(100, Math.round((onHand * 0.25) / 100) * 100)
    if (c.id === 12) c.minimum_stock_level = 5000
  })

  return {
    users: USERS,
    components,
    ledger: rows,
    orders,
    products: PRODUCTS.map((p) => ({ ...p, created_at: fmtDT(at(95, 9)) })),
    bom: BOM,
    produced: { ...PRODUCED },
    onHand: Object.fromEntries(components.map((c) => [c.id, run[c.id] || 0])),
    nextLedgerId: rows.length + 1,
    nextComponentId: components.length + 1,
    idem: new Map(),
  }
}
