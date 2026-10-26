/*
  After Quality Control an order moves through these 4 steps (QC's pass already packs it and sends it to the Store). Each step has ONE owner role, so every screen can
  say plainly "who acts next and what they do". Same order and names as backend finished-goods.service.js.
*/
export const FG_STEPS = [
  { status: "HANDED_OVER", label: "Passed QC", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "receive", button: "Receive into stock", tone: "warning",
    todo: "QC passed and packed it. Count the goods and receive them into product stock." },
  { status: "IN_STORE", label: "In stock", owner: "MARKETING_MANAGER", ownerLabel: "Marketing Manager", action: "bill", button: "Make bill", tone: "info",
    todo: "Make the customer's bill." },
  { status: "BILLED", label: "Billed", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "dispatch", button: "Give out for delivery", tone: "info",
    todo: "Give the goods out for delivery (product stock goes down). This completes the order." },
  { status: "DELIVERED", label: "Given out", owner: null, ownerLabel: null, action: null, button: null, tone: "success",
    todo: "Done. The order is complete." },
]

export const fgStepOf = (status) => FG_STEPS.find((s) => s.status === status) || null
export const fgIndexOf = (status) => FG_STEPS.findIndex((s) => s.status === status)

/* the step this role should act on, or null when the next move belongs to someone else */
export const myFgStep = (item, role) => {
  const step = fgStepOf(item?.status)
  if (!step?.action) return null
  return role === "SUPER_ADMIN" || role === step.owner ? step : null
}

export const fgBadge = (status) => {
  const step = fgStepOf(status)
  return step ? { variant: step.tone, label: step.label } : { variant: "neutral", label: status || "Unknown" }
}

/* who did a step and when, for the timeline */
export const fgStepDone = (item, status) => ({
  HANDED_OVER: { by: item.handedOverByName, at: item.handedOverAt },
  IN_STORE: { by: item.receivedByName, at: item.receivedAt },
  BILLED: { by: item.billedByName, at: item.billedAt },
  DELIVERED: { by: item.dispatchedByName, at: item.dispatchedAt },
}[status] || {})
