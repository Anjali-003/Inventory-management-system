// Shared helpers for the Inventory screens. Mirrors the server's validation so users get
// instant feedback, but the server stays the authority.

export const QTY_RE = /^\d{1,10}(\.\d{1,2})?$/
const MAX_CENTS = 999999999999

export const toCents = (v) => {
  const [i, f = ""] = String(v).trim().split(".")
  return Number(i) * 100 + Number((f + "00").slice(0, 2))
}
export const fromCents = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`

/** Returns { error } or { cents, value }. */
export function checkQty(raw, label = "Quantity", { allowZero = false } = {}) {
  const text = String(raw ?? "").trim()
  if (!text) return { error: `${label} is required` }
  if (!QTY_RE.test(text)) return { error: "Enter a number with up to 2 decimals" }
  const cents = toCents(text)
  if (cents > MAX_CENTS) return { error: `${label} is too large` }
  if (!allowZero && cents <= 0) return { error: `${label} must be greater than zero` }
  return { cents, value: fromCents(cents) }
}

export const fmtQty = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

// "2026-09-30 14:05:09" (server local time) -> "30 Sep 2026, 14:05"
export function fmtDateTime(s) {
  if (!s) return "-"
  const d = new Date(s.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return s
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`
}

export function newKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export const errorMessage = (err, fallback = "Something went wrong. Please try again.") => {
  if (err?.response?.data?.message) return err.response.data.message
  if (err?.code === "ERR_NETWORK") return "Cannot reach the server. Check your connection and retry."
  return fallback
}

export const TYPE_META = {
  OPENING_BALANCE: { label: "Opening balance", tone: "neutral" },
  STOCK_IN: { label: "Stock in", tone: "success" },
  STOCK_OUT: { label: "Stock out", tone: "danger" },
  ADJUSTMENT_IN: { label: "Adjustment (+)", tone: "info" },
  ADJUSTMENT_OUT: { label: "Adjustment (−)", tone: "warning" },
  RESERVED: { label: "Reserved", tone: "neutral" },
  CONSUMED: { label: "Consumed", tone: "danger" },
  RELEASED: { label: "Released", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
}

export const REASONS = {
  in: ["Purchase receipt", "Customer / production return", "Transfer in", "Other"],
  out: [
    "Issued to production",
    "Production wastage / rejected",
    "Damaged / scrapped",
    "Replacement issued",
    "Quality control / inspection",
    "Testing / trial",
    "R&D / experiment",
    "Rework / repair",
    "Customer sample / demo",
    "Warranty / customer replacement",
    "Lost / missing",
    "Issued by mistake / excess",
    "Returned to supplier",
    "Other",
  ],
  adjust: ["Cycle count correction", "Damage found", "Data entry correction", "Other"],
}

// Stock-out preset -> code stored on the ledger row (the Inventory History balance sheet groups by it).
export const STOCK_OUT_CODE = {
  "Issued to production": "ISSUED_TO_PRODUCTION",
  "Production wastage / rejected": "PRODUCTION_WASTAGE",
  "Damaged / scrapped": "DAMAGED",
  "Replacement issued": "REPLACEMENT",
  "Quality control / inspection": "QUALITY_CONTROL",
  "Testing / trial": "TESTING",
  "R&D / experiment": "RND",
  "Rework / repair": "REWORK",
  "Customer sample / demo": "CUSTOMER_SAMPLE",
  "Warranty / customer replacement": "WARRANTY",
  "Lost / missing": "LOST",
  "Issued by mistake / excess": "WRONG_ISSUE",
  "Returned to supplier": "RETURNED_TO_SUPPLIER",
  Other: "OTHER",
}
// For these an order must be selected (the server enforces the same list).
export const ORDER_REQUIRED_PRESETS = [
  "Production wastage / rejected",
  "Damaged / scrapped",
  "Replacement issued",
  "Quality control / inspection",
  "Testing / trial",
  "R&D / experiment",
  "Rework / repair",
]

/** Combine the preset and the free-text note into the single reason string the ledger stores. */
export const composeReason = (preset, note) => {
  const n = note.trim()
  if (preset && preset !== "Other") return n ? `${preset}: ${n}` : preset
  return n
}

// ---- new-component helpers (mirror the server rules; the server stays the authority)
export const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,49}$/
export const UNIT_RE = /^[A-Za-z][A-Za-z0-9 ./-]{0,19}$/
export const UNIT_SUGGESTIONS = ["pcs", "kg", "g", "m", "cm", "ltr", "ml", "set", "box", "roll", "pair", "pack"]

/** Next free SKU in the same pattern as `base` (e.g. CMP-019), skipping codes already used by new lines in the list. */
export function suggestSku(base, newSkus = []) {
  const m = /^(.*?)(\d+)$/.exec(base || "CMP-001")
  if (!m) return base || ""
  const [, prefix, digits] = m
  let n = Number(digits)
  for (const sku of newSkus) {
    const x = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`).exec(sku)
    if (x && Number(x[1]) >= n) n = Number(x[1]) + 1
  }
  return prefix + String(n).padStart(digits.length, "0")
}
