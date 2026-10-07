/*
  Pure mock "backend" (no axios, no network). mockAdapter.js feeds it requests.

  It mirrors the real Express API for everything the Inventory area needs:
    /inventory (list, item, ledger, components, next-sku, stock-in, stock-in/batch, stock-out, edit, archive,
                history, history/daily, history/products, history/balance)
  plus the small lists other pages need to open without errors (/orders, /products, /attendance, /auth/*).
  Anything else: GET -> [] , write -> 501 "not available in mock mode".

  State lives in memory: changes you make (stock in/out ...) show up until you reload the page.
*/
import { buildSeed, fmtD, fmtDT, REASON_LABELS, USERS } from "./mockData"

/* ----------------------------------------------------------------- helpers */
const pad2 = (n) => String(n).padStart(2, "0")
const toC = (v) => {
  const [i, f = ""] = String(v ?? 0).trim().split(".")
  return Number(i) * 100 + Number((f + "00").slice(0, 2))
}
const fromC = (c) => `${Math.floor(c / 100)}.${pad2(c % 100)}`
const num = (c) => c / 100
const QTY_RE = /^\d{1,10}(\.\d{1,2})?$/
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/

class Http {
  constructor(status, message, code, extra) {
    this.status = status
    this.data = { message, code, ...(extra || {}) }
  }
}
const bad = (m, extra) => new Http(422, m, "VALIDATION", extra)

let S = null
const state = () => (S ||= buildSeed(new Date()))
export const resetMock = () => { S = null }

let authed = true
try { authed = sessionStorage.getItem("mock_auth") !== "0" } catch { /* not in a browser */ }
const setAuthed = (v) => { authed = v; try { sessionStorage.setItem("mock_auth", v ? "1" : "0") } catch { /* ignore */ } }

const todayStr = () => fmtD(new Date())
const comp = (id) => state().components.find((c) => c.id === Number(id))
const userName = (id) => (id ? USERS.find((u) => u.id === id)?.name || "System" : "System")

function qty(raw, field, { allowZero = false } = {}) {
  if (raw === undefined || raw === null || raw === "") throw bad(`${field} is required`, { field })
  const t = String(raw).trim()
  if (!QTY_RE.test(t)) throw bad(`${field} must be a positive number with at most 2 decimal places`, { field })
  const c = toC(t)
  if (!allowZero && c <= 0) throw bad(`${field} must be greater than zero`, { field })
  return c
}
function reasonText(raw, { required = true } = {}) {
  const t = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : ""
  if (!t) { if (required) throw bad("A reason is required"); return null }
  if (t.length < 3) throw bad("Reason must be at least 3 characters")
  if (t.length > 255) throw bad("Reason must be 255 characters or fewer")
  return t
}
const attr = (raw) => (typeof raw === "string" && raw.trim() ? raw.trim().replace(/\s+/g, " ").slice(0, 100) : undefined)
const keyOf = (raw) => {
  if (typeof raw !== "string" || !KEY_RE.test(raw.trim())) {
    throw new Http(400, "Missing or invalid idempotency_key (8-64 letters, digits, - or _)", "IDEMPOTENCY_KEY_REQUIRED")
  }
  return raw.trim()
}

/* ------------------------------------------------------------------- views */
const lastMove = (cid) => {
  let m = ""
  for (const r of state().ledger) if (r.component_id === cid && r.created_at > m) m = r.created_at
  return m || null
}

function itemView(c) {
  const s = state()
  const onHand = s.onHand[c.id] || 0
  const ledgerBalance = s.ledger.reduce(
    (a, r) => (r.component_id !== c.id ? a : r.direction === "IN" ? a + r.cents : r.direction === "OUT" ? a - r.cents : a), 0)
  return {
    id: c.id, // inventory id == component id in the mock
    component_id: c.id,
    sku: c.sku,
    component_name: c.name,
    unit: c.unit,
    category: c.category ?? null,
    size: c.size ?? null,
    quantity_on_hand: fromC(onHand),
    quantity_reserved: fromC(c.reserved || 0),
    location: c.location ?? null,
    available: fromC(onHand - (c.reserved || 0)),
    minimum_stock_level: fromC(c.minimum_stock_level),
    is_active: c.is_active,
    archived_at: c.archived_at,
    last_movement_at: lastMove(c.id),
    ledger_balance: fromC(ledgerBalance),
    in_sync: ledgerBalance === onHand ? 1 : 0,
  }
}

function moveView(r) {
  const c = comp(r.component_id)
  return {
    id: r.id, component_id: r.component_id, sku: c.sku, component_name: c.name, unit: c.unit,
    transaction_type: r.transaction_type, direction: r.direction,
    quantity: fromC(r.cents), balance_after: fromC(r.balance_after),
    reason: r.reason, reference_no: r.reference_no, reference_type: r.reference_type, reference_id: r.reference_id,
    created_by: r.created_by, user_name: userName(r.created_by), created_at: r.created_at,
  }
}

/* ------------------------------------------------------------ ledger write */
function post(c, type, direction, cents, extra = {}) {
  const s = state()
  if (direction === "IN") s.onHand[c.id] = (s.onHand[c.id] || 0) + cents
  if (direction === "OUT") s.onHand[c.id] = (s.onHand[c.id] || 0) - cents
  const row = {
    id: s.nextLedgerId++, component_id: c.id, transaction_type: type, direction, cents,
    balance_after: s.onHand[c.id] || 0,
    reason: extra.reason ?? null, reason_code: extra.reason_code ?? null, reference_no: extra.reference_no ?? null,
    reference_type: null, reference_id: null, created_by: 1, order_id: extra.order_id ?? null,
    created_at: fmtDT(new Date()), idempotency_key: extra.key ?? null,
  }
  s.ledger.push(row)
  return row
}

const replayOf = (key) => {
  const hit = state().idem.get(key)
  return hit ? { ...hit, replayed: true } : null
}
const remember = (key, result) => { state().idem.set(key, result); return result }

/* -------------------------------------------------------------------- reads */
function listInventory({ status = "active" }) {
  const rows = state().components.filter((c) => (status === "archived" ? !c.is_active : status === "all" ? true : c.is_active))
  return rows.map(itemView)
}

function getItem(id) {
  const c = comp(id)
  if (!c) throw new Http(404, "Inventory item not found", "NOT_FOUND")
  const recent = state().ledger
    .filter((r) => r.component_id === c.id && r.transaction_type !== "OPENING_BALANCE")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id))
    .slice(0, 15).map(moveView)
  return { ...itemView(c), recent_movements: recent }
}

function componentOptions({ q = "", limit = 8 }) {
  const take = Math.min(50, Math.max(1, Number(limit) || 8))
  const tokens = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)
  const hit = state().components.filter((c) => tokens.every((t) => c.sku.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)))
  const first = tokens[0] || ""
  hit.sort((a, b) => (b.sku.toLowerCase() === first) - (a.sku.toLowerCase() === first) || a.name.localeCompare(b.name))
  return {
    total: hit.length,
    rows: hit.slice(0, take).map((c) => ({
      id: c.id, sku: c.sku, name: c.name, unit: c.unit, category: c.category, size: c.size,
      minimum_stock_level: fromC(c.minimum_stock_level), inventory_id: c.id, is_active: c.is_active,
      location: c.location, quantity_on_hand: fromC(state().onHand[c.id] || 0),
    })),
  }
}

const nextSku = () => {
  const n = Math.max(0, ...state().components.map((c) => Number(/^CMP-(\d+)$/.exec(c.sku)?.[1] || 0)))
  return { sku: `CMP-${String(n + 1).padStart(3, "0")}` }
}

function getLedger(p = {}) {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  let rows = state().ledger.filter((r) => r.transaction_type !== "OPENING_BALANCE")
  if (p.component_id) rows = rows.filter((r) => r.component_id === Number(p.component_id))
  if (p.direction) {
    if (!["IN", "OUT", "RESERVE", "RELEASE", "NONE"].includes(p.direction)) throw new Http(400, "Invalid direction", "VALIDATION")
    rows = rows.filter((r) => r.direction === p.direction)
  }
  if (p.type) rows = rows.filter((r) => r.transaction_type === p.type)
  if (p.from) {
    if (!dateRe.test(p.from)) throw new Http(400, "Invalid from date", "VALIDATION")
    rows = rows.filter((r) => r.created_at >= p.from)
  }
  if (p.to) {
    if (!dateRe.test(p.to)) throw new Http(400, "Invalid to date", "VALIDATION")
    const [y, m, d] = p.to.split("-").map(Number)
    const next = fmtD(new Date(y, m - 1, d + 1))
    rows = rows.filter((r) => r.created_at < next)
  }
  if (p.q && String(p.q).trim()) {
    const q = String(p.q).trim().toLowerCase()
    rows = rows.filter((r) => {
      const c = comp(r.component_id)
      return [c.sku, c.name, r.reason, r.reference_no, userName(r.created_by)].some((v) => v && String(v).toLowerCase().includes(q))
    })
  }
  rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id))
  const pageSize = Math.min(100, Math.max(1, Number(p.page_size) || 25))
  const page = Math.max(1, Number(p.page) || 1)
  const sum = (dir) => rows.reduce((a, r) => (r.direction === dir ? a + r.cents : a), 0)
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize).map(moveView),
    total: rows.length, total_in: fromC(sum("IN")), total_out: fromC(sum("OUT")), page, page_size: pageSize,
  }
}

/* ------------------------------------------------------------------ writes */
function stockInOne(body) {
  const c = comp(body.component_id)
  if (!c) throw new Http(404, "Component not found", "NOT_FOUND")
  const key = keyOf(body.idempotency_key)
  const again = replayOf(key); if (again) return { status: 200, data: again }
  const cents = qty(body.quantity, "Quantity")
  const reason = reasonText(body.reason)
  applyAttrs(c, body)
  c.is_active = 1; c.archived_at = null
  const row = post(c, "STOCK_IN", "IN", cents, { reason, reference_no: body.reference_no || null, key })
  return { status: 201, data: remember(key, { item: itemView(c), movement_id: row.id, replayed: false }) }
}

function applyAttrs(c, b) {
  const loc = attr(b.location), cat = attr(b.category), size = attr(b.size)
  if (loc !== undefined) c.location = loc
  if (cat !== undefined) c.category = cat
  if (size !== undefined) c.size = size
}

function stockInBatch(body) {
  const s = state()
  const key = keyOf(body.idempotency_key)
  const again = replayOf(key); if (again) return { status: 200, data: again }
  const items = body.items
  if (!Array.isArray(items) || items.length === 0) throw new Http(422, "Add at least one item to the list", "VALIDATION")
  if (items.length > 50) throw new Http(422, "One receipt can hold at most 50 items", "VALIDATION")

  // validate everything first (all lines or none)
  const seen = new Set(), seenSku = new Set(), seenName = new Set()
  const plan = items.map((raw, i) => {
    const wrap = (fn) => { try { return fn() } catch (e) { if (e instanceof Http) e.data = { ...e.data, line: i }; throw e } }
    return wrap(() => {
      const hasId = raw.component_id !== undefined && raw.component_id !== null && raw.component_id !== ""
      const hasNew = !!raw.new_component && typeof raw.new_component === "object"
      if (hasId === hasNew) throw new Http(422, "Each line needs either an existing component or a new component", "VALIDATION")
      const cents = qty(raw.quantity, "Quantity")
      const reason = reasonText(raw.reason)
      if (hasId) {
        const c = comp(raw.component_id)
        if (!c) throw new Http(404, "Component not found", "NOT_FOUND", { field: "component" })
        if (seen.has(c.id)) throw bad("This component appears more than once in the list", { field: "component" })
        seen.add(c.id)
        return { cents, reason, raw, comp: c }
      }
      const nc = raw.new_component
      const sku = String(nc.sku ?? "").trim().toUpperCase()
      if (!/^[A-Z0-9][A-Z0-9._-]{1,49}$/.test(sku)) throw bad("SKU must be 2-50 characters: letters, digits, dot, dash or underscore", { field: "sku" })
      const name = String(nc.name ?? "").trim().replace(/\s+/g, " ")
      if (name.length < 2 || name.length > 150) throw bad("Name must be 2-150 characters", { field: "name" })
      if (s.components.some((c) => c.sku === sku) || seenSku.has(sku)) throw new Http(409, `SKU ${sku} is already used by another component`, "DUPLICATE_SKU", { field: "sku" })
      const dup = s.components.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (dup || seenName.has(name.toLowerCase())) throw new Http(409, `A component named "${name}" already exists. Select it instead of creating a new one.`, "DUPLICATE_NAME", { field: "name" })
      seenSku.add(sku); seenName.add(name.toLowerCase())
      const min = nc.minimum_stock_level === undefined || nc.minimum_stock_level === "" ? 0 : qty(nc.minimum_stock_level, "Minimum stock level", { allowZero: true })
      return { cents, reason, raw, nc: { sku, name, unit: String(nc.unit || "pcs").trim().toLowerCase(), min, category: attr(nc.category) ?? null, size: attr(nc.size) ?? null, description: nc.description || null } }
    })
  })

  const results = plan.map((p, i) => {
    let c = p.comp, created = false
    if (!c) {
      c = {
        id: s.nextComponentId++, sku: p.nc.sku, name: p.nc.name, unit: p.nc.unit, category: p.nc.category, size: p.nc.size,
        location: null, description: p.nc.description, minimum_stock_level: p.nc.min, is_active: 1, archived_at: null, reserved: 0,
      }
      s.components.push(c); s.onHand[c.id] = 0; created = true
    }
    if (!created) applyAttrs(c, p.raw); else { const loc = attr(p.raw.location); if (loc !== undefined) c.location = loc }
    c.is_active = 1; c.archived_at = null
    const row = post(c, "STOCK_IN", "IN", p.cents, { reason: p.reason, reference_no: p.raw.reference_no || null, key: `${key}:${i}` })
    return { line: i, component_id: c.id, quantity: fromC(p.cents), balance_after: fromC(row.balance_after), movement_id: row.id, created, sku: c.sku, name: c.name, unit: c.unit }
  })
  return { status: 201, data: remember(key, { items: results, count: results.length, replayed: false }) }
}

const ORDER_REQUIRED = new Set(["PRODUCTION_WASTAGE", "DAMAGED", "REPLACEMENT", "QUALITY_CONTROL", "TESTING", "RND", "REWORK"])

function stockOut(id, body) {
  const c = comp(id)
  if (!c) throw new Http(404, "Inventory item not found", "NOT_FOUND")
  const key = keyOf(body.idempotency_key)
  const again = replayOf(key); if (again) return { status: 200, data: again }
  const cents = qty(body.quantity, "Quantity")
  const reason = reasonText(body.reason)
  const code = body.reason_code ? String(body.reason_code).trim().toUpperCase() : null
  if (code && !REASON_LABELS[code]) throw bad("Unknown stock-out reason")
  const orderId = body.order_id ? Number(body.order_id) : null
  if (code && ORDER_REQUIRED.has(code) && !orderId) throw bad("Select the order for this reason")
  if (orderId && !state().orders.some((o) => o.id === orderId)) throw bad("Order not found")
  if (!c.is_active) throw new Http(409, "This item is archived. Stock it in again to reactivate it.", "ARCHIVED")
  const onHand = state().onHand[c.id] || 0
  const available = onHand - (c.reserved || 0)
  if (cents > available) {
    const shown = (x) => Number(fromC(Math.max(x, 0))).toLocaleString("en-US", { maximumFractionDigits: 2 })
    throw new Http(409, `Insufficient stock: only ${shown(available)} available to issue` +
      (onHand !== available ? ` (${shown(onHand - available)} is reserved for production)` : ""),
      "INSUFFICIENT_STOCK", { available: fromC(Math.max(available, 0)) })
  }
  const row = post(c, "STOCK_OUT", "OUT", cents, { reason, reason_code: code, order_id: orderId, reference_no: body.reference_no || null, key })
  return { status: 201, data: remember(key, { item: itemView(c), movement_id: row.id, replayed: false }) }
}

function updateItem(id, body) {
  const c = comp(id)
  if (!c) throw new Http(404, "Inventory item not found", "NOT_FOUND")
  const hasQty = body.new_quantity !== undefined && body.new_quantity !== null && body.new_quantity !== ""
  const hasMin = body.minimum_stock_level !== undefined && body.minimum_stock_level !== null && body.minimum_stock_level !== ""
  if (!hasQty && !hasMin) throw new Http(422, "Nothing to change", "VALIDATION")
  if (!c.is_active) throw new Http(409, "This item is archived. Stock it in again to reactivate it.", "ARCHIVED")
  let movement = null
  if (hasQty) {
    const next = qty(body.new_quantity, "Counted quantity", { allowZero: true })
    const expected = qty(body.expected_on_hand, "expected_on_hand", { allowZero: true })
    const reason = reasonText(body.reason)
    const key = keyOf(body.idempotency_key)
    const again = replayOf(key); if (again) return { status: 200, data: again }
    const onHand = state().onHand[c.id] || 0
    if (onHand !== expected) throw new Http(409, `Stock changed while you were editing (now ${Number(fromC(onHand))}). Review the new balance and try again.`, "STALE", { current_on_hand: fromC(onHand) })
    if (next < (c.reserved || 0)) throw new Http(409, `Cannot set stock below the ${Number(fromC(c.reserved))} reserved for production`, "BELOW_RESERVED")
    const delta = next - onHand
    if (delta !== 0) movement = post(c, delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", delta > 0 ? "IN" : "OUT", Math.abs(delta), { reason, key })
    if (hasMin) c.minimum_stock_level = qty(body.minimum_stock_level, "Minimum stock level", { allowZero: true })
    return { status: 200, data: remember(key, { item: itemView(c), movement_id: movement ? movement.id : null, replayed: false }) }
  }
  c.minimum_stock_level = qty(body.minimum_stock_level, "Minimum stock level", { allowZero: true })
  return { status: 200, data: { item: itemView(c), movement_id: null, replayed: false } }
}

function archive(id, body) {
  const c = comp(id)
  if (!c) throw new Http(404, "Inventory item not found", "NOT_FOUND")
  if (!c.is_active) throw new Http(409, "This item is already archived", "ALREADY_ARCHIVED")
  if (c.reserved > 0) throw new Http(409, "Cannot archive: stock is reserved for production", "HAS_RESERVED")
  if ((state().onHand[c.id] || 0) > 0) throw new Http(409, "Cannot archive while stock is still on hand. Stock it out or adjust it to zero first.", "HAS_STOCK")
  c.is_active = 0; c.archived_at = fmtDT(new Date())
  post(c, "ARCHIVED", "NONE", 0, { reason: reasonText(body?.reason, { required: false }) || "Archived by user" })
  return { item: itemView(c), replayed: false }
}

/* ----------------------------------------------------------------- history */
const COUNTED = (r) => r.transaction_type === "OPENING_BALANCE" || r.transaction_type === "STOCK_IN"
const baselineC = (r) => (r.transaction_type === "OPENING_BALANCE" ? (r.direction === "IN" ? r.cents : r.direction === "OUT" ? -r.cents : 0) : 0)
const receivedC = (r) => (r.transaction_type === "STOCK_IN" && r.direction === "IN" ? r.cents : 0)
const nextMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${pad2(mo + 1)}` }

function monthly() {
  const today = todayStr(), currentMonth = today.slice(0, 7)
  const rows = state().ledger.filter(COUNTED)
  if (!rows.length) return { today, current_month: currentMonth, first_month: null, baseline_total: 0, received_total: 0, cumulative_total: 0, months: [] }
  const by = new Map()
  rows.forEach((r) => {
    const m = r.created_at.slice(0, 7)
    const x = by.get(m) || { baseline: 0, received: 0, count: 0 }
    x.baseline += baselineC(r); x.received += receivedC(r); x.count += receivedC(r) ? 1 : 0
    by.set(m, x)
  })
  const keys = [...by.keys()].sort()
  const first = keys[0], last = keys[keys.length - 1] > currentMonth ? keys[keys.length - 1] : currentMonth
  const months = []
  let running = 0, bs = 0, rs = 0
  for (let m = first; m <= last; m = nextMonth(m)) {
    const x = by.get(m) || { baseline: 0, received: 0, count: 0 }
    const opening = running
    running += x.baseline + x.received; bs += x.baseline; rs += x.received
    months.push({ month: m, opening_cumulative: num(opening), baseline: num(x.baseline), received: num(x.received), receipt_count: x.count, cumulative: num(running) })
  }
  return { today, current_month: currentMonth, first_month: first, baseline_total: num(bs), received_total: num(rs), cumulative_total: num(running), months }
}

function daily(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw new Http(400, "month must be in YYYY-MM format", "VALIDATION")
  const today = todayStr()
  const start = `${month}-01`, end = `${nextMonth(month)}-01`
  const rows = state().ledger.filter(COUNTED)
  let running = rows.filter((r) => r.created_at < start).reduce((a, r) => a + baselineC(r) + receivedC(r), 0)
  const opening = running
  const [y, mo] = month.split("-").map(Number)
  const lastDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : month > today.slice(0, 7) ? 0 : new Date(y, mo, 0).getDate()
  let bs = 0, rs = 0
  const days = []
  for (let d = 1; d <= lastDay; d++) {
    const key = `${month}-${pad2(d)}`
    const day = rows.filter((r) => r.created_at >= start && r.created_at < end && r.created_at.slice(0, 10) === key)
    const b = day.reduce((a, r) => a + baselineC(r), 0), r_ = day.reduce((a, r) => a + receivedC(r), 0)
    running += b + r_; bs += b; rs += r_
    days.push({ date: key, baseline: num(b), received: num(r_), receipt_count: day.filter((r) => receivedC(r)).length, cumulative: num(running) })
  }
  return { month, opening_cumulative: num(opening), baseline: num(bs), received: num(rs), closing_cumulative: num(running), days }
}

function finishedProducts() {
  const s = state()
  const products = s.products.filter((p) => s.produced[p.id]).map((p) => {
    const perUnit = (s.bom[p.id] || []).reduce((a, [, q]) => a + q * 100, 0)
    const produced = s.produced[p.id]
    return { product_id: p.id, sku: p.sku, name: p.name, produced, components_per_unit: num(perUnit), bom_lines: (s.bom[p.id] || []).length, components_used: num(produced * perUnit) }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const used = products.reduce((a, p) => a + Math.round(p.components_used * 100), 0)
  return { products, total_produced: products.reduce((a, p) => a + p.produced, 0), total_components_used: num(used) }
}

const LEAVING = (r) => ["STOCK_OUT", "ADJUSTMENT_OUT", "ADJUSTMENT_IN"].includes(r.transaction_type)
const leavingQty = (r) => (r.transaction_type === "ADJUSTMENT_IN" ? -r.cents : r.cents)
const codeOf = (r) => (r.transaction_type.startsWith("ADJUSTMENT") ? "ADJUSTMENT" : r.reason_code || "OTHER")

function balanceSheet() {
  const s = state()
  const m = monthly()
  const recvTotal = Math.round(m.cumulative_total * 100)
  const usedC = finishedProducts().products.reduce((a, p) => a + Math.round(p.components_used * 100), 0)
  const expected = recvTotal - usedC
  const actual = Object.values(s.onHand).reduce((a, b) => a + b, 0)
  const diff = actual - expected
  const consumedC = s.ledger.filter((r) => r.transaction_type === "CONSUMED" && r.direction === "OUT").reduce((a, r) => a + r.cents, 0)
  const inProduction = consumedC - usedC

  const groups = new Map()
  s.ledger.filter(LEAVING).forEach((r) => {
    const g = groups.get(codeOf(r)) || { quantity: 0, movements: 0 }
    g.quantity += leavingQty(r); g.movements += 1
    groups.set(codeOf(r), g)
  })
  const byReason = [...groups.entries()].map(([code, g]) => ({ code, label: REASON_LABELS[code] || code, quantity: num(g.quantity), movements: g.movements }))
    .sort((a, b) => b.quantity - a.quantity)
  const explained = [...groups.values()].reduce((a, g) => a + g.quantity, 0)

  const moves = s.ledger.filter(LEAVING)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)).slice(0, 200)
    .map((r) => {
      const c = comp(r.component_id), o = s.orders.find((x) => x.id === r.order_id)
      return {
        id: r.id, created_at: r.created_at, sku: c.sku, component_name: c.name, unit: c.unit, type: r.transaction_type, code: codeOf(r),
        reason_label: REASON_LABELS[codeOf(r)] || codeOf(r), quantity: num(leavingQty(r)), reason: r.reason, reference_no: r.reference_no,
        order_id: o ? o.id : null, order_number: o ? o.order_number : null, worker_name: null, worker_code: null, recorded_by: userName(r.created_by),
      }
    })

  const sumBy = (rows, f) => { const mp = new Map(); rows.forEach((r) => mp.set(r.component_id, (mp.get(r.component_id) || 0) + f(r))); return mp }
  const recvM = sumBy(s.ledger.filter(COUNTED), (r) => baselineC(r) + receivedC(r))
  const usedM = new Map()
  Object.entries(s.bom).forEach(([pid, lines]) => lines.forEach(([cid, q]) => usedM.set(cid, (usedM.get(cid) || 0) + (s.produced[pid] || 0) * q * 100)))
  const consM = sumBy(s.ledger.filter((r) => r.transaction_type === "CONSUMED" && r.direction === "OUT"), (r) => r.cents)
  const leftM = sumBy(s.ledger.filter(LEAVING), leavingQty)

  const per = s.components.map((c) => {
    const exp = (recvM.get(c.id) || 0) - (usedM.get(c.id) || 0), act = s.onHand[c.id] || 0
    return { c, exp, act, missing: exp - act, inProd: (consM.get(c.id) || 0) - (usedM.get(c.id) || 0), explained: leftM.get(c.id) || 0 }
  })
  const components = per.map((r) => ({ ...r, net: r.missing - Math.max(r.inProd, 0) })).filter((r) => r.net !== 0).sort((a, b) => b.net - a.net)
    .map((r) => ({ component_id: r.c.id, sku: r.c.sku, name: r.c.name, unit: r.c.unit, expected: num(r.exp), actual: num(r.act), missing: num(r.net), accounted: num(r.explained), unexplained: num(r.net - r.explained) }))
  const unfinished = per.filter((r) => r.inProd > 0).sort((a, b) => b.inProd - a.inProd)
    .map((r) => ({ component_id: r.c.id, sku: r.c.sku, name: r.c.name, unit: r.c.unit, quantity: num(r.inProd) }))

  return {
    received_total: num(recvTotal), components_used: num(usedC), expected_remaining: num(expected), actual_on_hand: num(actual), difference: num(diff),
    shortfall: {
      in_production: num(inProduction), by_reason: byReason, components,
      components_missing_total: num(components.reduce((a, c) => (c.missing > 0 ? a + Math.round(c.missing * 100) : a), 0)),
      unfinished_components: unfinished, explained_total: num(explained), unexplained: num(-diff - inProduction - explained), movements: moves,
    },
  }
}

/* ------------------------------------------------------------ other lists */
const orderRows = () => [...state().orders].sort((a, b) => b.id - a.id)
  .map((o) => ({ id: o.id, order_number: o.order_number, status: o.status, created_at: o.created_at, product_id: o.product_id, product_name: o.product_name, quantity: o.quantity }))

/* ------------------------------------------------------------------ router */
const ok = (data, status = 200) => ({ status, data })
const ROUTES = [
  ["GET", /^\/auth\/me$/, () => (authed ? ok({ user: USERS[0] }) : ok({ message: "Not authenticated" }, 401))],
  ["POST", /^\/auth\/login$/, () => { setAuthed(true); return ok({ message: "Login successful (mock)", user: USERS[0] }) }],
  ["POST", /^\/auth\/logout$/, () => { setAuthed(false); return ok({ message: "Logged out" }) }],

  ["GET", /^\/inventory\/ledger$/, (m, q) => ok(getLedger(q))],
  ["GET", /^\/inventory\/components\/next-sku$/, () => ok(nextSku())],
  ["GET", /^\/inventory\/components$/, (m, q) => ok(componentOptions(q))],
  ["GET", /^\/inventory\/history\/daily$/, (m, q) => ok(daily(q.month))],
  ["GET", /^\/inventory\/history\/products$/, () => ok(finishedProducts())],
  ["GET", /^\/inventory\/history\/balance$/, () => ok(balanceSheet())],
  ["GET", /^\/inventory\/history$/, () => ok(monthly())],
  ["GET", /^\/inventory$/, (m, q) => ok(listInventory({ status: ["active", "archived", "all"].includes(q.status) ? q.status : "active" }))],
  ["GET", /^\/inventory\/(\d+)$/, (m) => ok(getItem(m[1]))],
  ["POST", /^\/inventory\/stock-in\/batch$/, (m, q, b) => stockInBatch(b)],
  ["POST", /^\/inventory\/stock-in$/, (m, q, b) => stockInOne(b)],
  ["POST", /^\/inventory\/(\d+)\/stock-out$/, (m, q, b) => stockOut(m[1], b)],
  ["PUT", /^\/inventory\/(\d+)$/, (m, q, b) => updateItem(m[1], b)],
  ["DELETE", /^\/inventory\/(\d+)$/, (m, q, b) => ok(archive(m[1], b))],

  ["GET", /^\/orders$/, () => ok(orderRows())],
  ["GET", /^\/products$/, () => ok(state().products)],
  ["GET", /^\/products\/next-sku$/, () => ok({ sku: `PRD-${String(state().products.length + 1).padStart(3, "0")}` })],
  ["GET", /^\/attendance$/, () => ok([])],
]

/** method, path ("/inventory/5"), query params object, parsed body -> { status, data } (never throws) */
export function handleMock(method, path, params = {}, body = {}) {
  const clean = String(path || "").split("?")[0].replace(/\/+$/, "") || "/"
  const verb = String(method || "get").toUpperCase()
  try {
    for (const [m, re, fn] of ROUTES) {
      if (m !== verb) continue
      const hit = re.exec(clean)
      if (hit) return fn(hit, params || {}, body || {})
    }
    if (verb === "GET") return ok([])
    return ok({ message: "Not available in mock mode (VITE_DATA_MODE=mock)", code: "MOCK_NOT_IMPLEMENTED" }, 501)
  } catch (e) {
    if (e instanceof Http) return { status: e.status, data: e.data }
    console.error("[mock] unexpected error", e)
    return ok({ message: "Mock server error: " + (e?.message || e), code: "SERVER_ERROR" }, 500)
  }
}
