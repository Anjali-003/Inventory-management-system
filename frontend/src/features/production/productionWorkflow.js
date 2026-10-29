const quantity = (value) => Math.max(0, Number(value || 0))

export const remainingToStart = (item) => Math.max(
  0,
  Number(item?.remaining_to_start ?? (quantity(item?.ordered_quantity) - quantity(item?.quantity_to_produce))),
)

export const readyToStartQuantity = (item) => Math.min(
  remainingToStart(item),
  quantity(item?.max_production_quantity),
)

export const inProductionQuantity = (item) => Math.max(
  0,
  Number(item?.quantity_in_production ?? (quantity(item?.quantity_to_produce) - quantity(item?.quantity_completed))),
)

export const isProductionCompleted = (item) => {
  const ordered = quantity(item?.ordered_quantity ?? item?.order_item_quantity)
  // A production run can finish the currently allotted subset before the whole order line is done.
  // Only label it complete when every ordered unit has been recorded as completed.
  return ordered > 0 && quantity(item?.quantity_completed) >= ordered
}

export const materialAllottedQuantity = (item) => {
  const ordered = quantity(item?.ordered_quantity)
  const value = item?.material_allotted_quantity
  // Backward-compatible fallback for a server version that doesn't expose the derived field yet.
  const allotted = value !== null && value !== undefined
    ? quantity(value)
    : quantity(item?.quantity_to_produce) + readyToStartQuantity(item)
  return Math.min(ordered, allotted)
}

export const leftToBeAllottedQuantity = (item) => {
  const value = item?.material_left_to_allot
  if (value !== null && value !== undefined) return Math.min(quantity(item?.ordered_quantity), quantity(value))
  return Math.max(0, quantity(item?.ordered_quantity) - materialAllottedQuantity(item))
}

export const isApprovedForProduction = (item) => Boolean(
  item?.inventory_issued_at && item?.approval_status === "APPROVED",
)

/* ------------------------------------------------------------------ what the Production Manager does next */

const CAN_START_STATUSES = new Set(["PENDING", "IN_PRODUCTION", "TESTING"])
const HIDDEN_APPROVALS = new Set(["DRAFT", "REJECTED"])

/* Drafts and rejected orders never reach production: they are not the Production Manager's to see. */
export const isVisibleToProduction = (item) => !HIDDEN_APPROVALS.has(item?.approval_status)

/* Units whose materials the Store handed over and that are not started yet. */
export const canStartProduction = (item) => remainingToStart(item) > 0
  && CAN_START_STATUSES.has(item?.order_status)
  && item?.material_status !== "UNKNOWN"
  && quantity(item?.max_production_quantity) > 0

/* Units started and not recorded as made yet. */
export const canRecordUnits = (item) => Boolean(item?.id) && item?.status === "IN_PRODUCTION" && inProductionQuantity(item) > 0

// Keep the request action visible until all ordered units are covered by Store allotments.
// Requestable quantity only prevents duplicate requests; it must not hide the path to pending handovers.
export const canRequestMaterials = (item) => isApprovedForProduction(item)
  && item?.material_status !== "UNKNOWN"
  && remainingToStart(item) > 0
  && leftToBeAllottedQuantity(item) > 0

/* ------------------------------------------------------------------ by when */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/* The earlier of the customer's date and the Operations Admin's: the one Production works to ("2026-11-02" or null). */
export const dueDateOf = (item) => [item?.required_by_date, item?.estimated_delivery_date].filter(Boolean).sort()[0] || null

/* "2026-11-02" -> days from today (negative: already past) */
export const daysUntil = (date) => Math.round((new Date(`${date}T00:00:00`) - new Date(`${ymd(new Date())}T00:00:00`)) / 86400000)

/* whole days since a moment (a request, a start) */
export const daysSince = (at) => (at ? Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86400000)) : null)

export const dueLine = (days) => (days < 0 ? `Late by ${days === -1 ? "1 day" : `${-days} days`}` : days === 0 ? "Due today" : `Due in ${days === 1 ? "1 day" : `${days} days`}`)

export const shortDay = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

/* Asked the Store for materials that it has not handed over yet. */
export const waitingForStore = (item) => quantity(item?.material_request_outstanding_quantity) > 0

/* QC failed this batch and it is back with Production to fix (or being fixed). */
export const needsRework = (item) => ["NEEDS_REWORK", "IN_PROGRESS"].includes(item?.rework_status)

/* Its materials are not asked for yet: the Production Manager's turn to ask the Store. */
export const needsMaterialRequest = (item) => canRequestMaterials(item) && !waitingForStore(item)

/* Not finished and nothing for Production to do: the Store's or the Operations Admin's turn. */
export const isHeldUp = (item) => !isProductionCompleted(item) && !canStartProduction(item) && !canRecordUnits(item) && !needsMaterialRequest(item)

/*
  The tabs of the Production page (and of the Production card on the dashboard), by what there is to do. A line can
  sit in more than one (units to start AND units to record); "held" holds the lines where it is someone else's turn.
*/
export const PRODUCTION_TABS = [
  { key: "start", label: "Ready to start", test: canStartProduction },
  { key: "making", label: "Being made", test: canRecordUnits },
  { key: "ask", label: "Need materials", test: needsMaterialRequest },
  { key: "held", label: "Held up", test: isHeldUp },
  { key: "done", label: "Done", test: isProductionCompleted },
]

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

/*
  The one line a card leads with: what to do next on this product line, or whose turn it is.
  { key, text, tone } - tone: "action" (the Production Manager's turn), "wait" (someone else's), "done"
*/
export function nextStep(item) {
  const ready = readyToStartQuantity(item)
  const left = leftToBeAllottedQuantity(item)
  if (isProductionCompleted(item)) return { key: "done", text: `Done: all ${plural(quantity(item.ordered_quantity), "unit")} made`, tone: "done" }
  if (!isApprovedForProduction(item)) return { key: "approval", text: "Waiting for Operations to approve the order", tone: "wait" }
  if (item.material_status === "UNKNOWN") return { key: "bom", text: "The product has no parts list (BOM). Ask the Super Admin to add it.", tone: "wait" }
  if (canStartProduction(item)) return { key: "start", text: `Start ${plural(ready, "unit")}: their materials are here`, tone: "action" }
  if (canRecordUnits(item)) return { key: "record", text: `Record finished units: ${plural(inProductionQuantity(item), "unit")} being made`, tone: "action" }
  if (canRequestMaterials(item) && !waitingForStore(item)) return { key: "request", text: `Ask the Store for materials for ${plural(left, "unit")}`, tone: "action" }
  if (waitingForStore(item)) {
    const asked = daysSince(item.material_requested_at)
    const since = asked === null ? "" : asked === 0 ? " (asked today)" : ` (asked ${asked === 1 ? "1 day" : `${asked} days`} ago)`
    return { key: "store", text: `Waiting for the Store to hand over the materials${since}`, tone: "wait" }
  }
  return { key: "other", text: "Nothing to do right now", tone: "wait" }
}

/* Where the materials of a line stand, in three plain words. { label, detail, tone } (Badge variants) */
export function materialState(item) {
  const ordered = quantity(item.ordered_quantity)
  const allotted = materialAllottedQuantity(item)
  const left = leftToBeAllottedQuantity(item)
  if (left === 0) return { label: "Materials received", detail: `for all ${ordered}`, tone: "success" }
  if (waitingForStore(item)) return { label: "Requested from Store", detail: `received for ${allotted} of ${ordered}`, tone: "info" }
  return { label: "Materials needed", detail: `received for ${allotted} of ${ordered}`, tone: "warning" }
}

export function productionWorkflowStatus(item) {
  const completed = quantity(item?.quantity_completed)
  const ready = readyToStartQuantity(item)
  const left = leftToBeAllottedQuantity(item)

  if (isProductionCompleted(item)) {
    return { key: "completed", label: "Production completed", tone: "success" }
  }
  if (!isApprovedForProduction(item)) {
    return { key: "awaiting_approval", label: "Awaiting approval", tone: "warning" }
  }
  if (item?.material_status === "UNKNOWN") {
    return { key: "bom_review", label: "BOM needs review", tone: "warning" }
  }
  if (inProductionQuantity(item) > 0) {
    return { key: "in_production", label: "Production in progress", tone: "info" }
  }
  if (left > 0 && ready > 0) {
    return { key: "partially_allotted", label: "Partially allotted", tone: "info" }
  }
  if (left > 0) {
    return { key: "awaiting_allotment", label: "Awaiting allotment", tone: "warning" }
  }
  if (ready > 0) {
    return { key: "ready_to_start", label: "Ready to start", tone: "success" }
  }
  if (completed > 0) {
    return { key: "in_production", label: "Production in progress", tone: "info" }
  }
  return { key: "awaiting_allotment", label: "Awaiting allotment", tone: "warning" }
}

