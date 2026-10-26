/*
  After Quality Control an order moves through these steps. Each step has one owner role; Super Admin and
  Production Admin can act across the workflow. Same order and names as backend finished-goods.service.js.
*/
export const FG_STEPS = [
  { status: "PACKAGING", label: "Packing", owner: "QUALITY_FG_MANAGER", ownerLabel: "QC & Finished Goods", action: "pack", button: "Packing done", tone: "warning",
    todo: "Pack the goods, then press Packing done." },
  { status: "PACKED", label: "Packed", owner: "OPERATIONS_ADMIN", ownerLabel: "Operations Admin", action: "hand-over", button: "Hand over to Store", tone: "warning",
    todo: "Hand the packed goods over to the Store." },
  { status: "HANDED_OVER", label: "With Store", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "receive", button: "Receive into stock", tone: "warning",
    todo: "Count the goods and receive them into product stock." },
  { status: "IN_STORE", label: "In stock", owner: "MARKETING_MANAGER", ownerLabel: "Marketing Manager", action: "bill", button: "Make bill", tone: "info",
    todo: "Make the customer's bill." },
  { status: "BILLED", label: "Billed", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "dispatch", button: "Give out for delivery", tone: "info",
    todo: "Give the goods out for delivery (product stock goes down)." },
  { status: "DISPATCHED", label: "On the way", owner: "MARKETING_MANAGER", ownerLabel: "Marketing Manager", action: "deliver", button: "Mark delivered", tone: "info",
    todo: "Confirm when the customer has received the goods." },
  { status: "DELIVERED", label: "Delivered", owner: null, ownerLabel: null, action: null, button: null, tone: "success",
    todo: "Done. The order is complete." },
]

export const fgStepOf = (status) => FG_STEPS.find((s) => s.status === status) || null
export const fgIndexOf = (status) => FG_STEPS.findIndex((s) => s.status === status)

/* the step this role should act on, or null when the next move belongs to someone else */
export const myFgStep = (item, role) => {
  const step = fgStepOf(item?.status)
  if (!step?.action) return null
  return role === "SUPER_ADMIN" || role === "PRODUCTION_ADMIN" || role === step.owner ? step : null
}

export const fgBadge = (status) => {
  const step = fgStepOf(status)
  return step ? { variant: step.tone, label: step.label } : { variant: "neutral", label: status || "Unknown" }
}

/* who did a step and when, for the timeline */
export const fgStepDone = (item, status) => ({
  PACKAGING: { by: item.createdByName, at: item.createdAt },
  PACKED: { by: item.packedByName, at: item.packedAt },
  HANDED_OVER: { by: item.handedOverByName, at: item.handedOverAt },
  IN_STORE: { by: item.receivedByName, at: item.receivedAt },
  BILLED: { by: item.billedByName, at: item.billedAt },
  DISPATCHED: { by: item.dispatchedByName, at: item.dispatchedAt },
  DELIVERED: { by: item.deliveredByName, at: item.deliveredAt },
}[status] || {})
