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

export function productionWorkflowStatus(item) {
  const completed = quantity(item?.quantity_completed)
  const ready = readyToStartQuantity(item)
  const left = leftToBeAllottedQuantity(item)

  if (isProductionCompleted(item)) {
    return { key: "completed", label: "Production completed", tone: "success" }
  }
  if (!isApprovedForProduction(item)) {
    // approved, but the Operations Admin has not sent anything of it to Production yet
    const label = item?.approval_status === "APPROVED" ? "Not sent to Production yet" : "Awaiting approval"
    return { key: "awaiting_approval", label, tone: "warning" }
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

