/*
  After Quality Control an order moves through these 4 steps (QC's pass already packs it and sends it to the Store). Each step has ONE owner role, so every screen can
  say plainly "who acts next and what they do". Same order and names as backend finished-goods.service.js.
*/
export const FG_STEPS = [
  { status: "HANDED_OVER", label: "Passed QC", hint: "Store to receive it", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "receive", button: "Receive into stock", tone: "warning",
    todo: "QC passed and packed it. Count the goods and receive them into product stock." },
  { status: "IN_STORE", label: "In stock", hint: "Marketing to make the bill", owner: "MARKETING_MANAGER", ownerLabel: "Marketing Manager", action: "bill", button: "Make bill", tone: "info",
    todo: "Make the customer's bill." },
  { status: "BILLED", label: "Billed", hint: "Payment, then the Store gives it out", owner: "STORE_MANAGER", ownerLabel: "Store Manager", action: "dispatch", button: "Give out for delivery", tone: "info",
    todo: "Paid in full. Give the goods out for delivery (product stock goes down). This completes the order." },
  { status: "DELIVERED", label: "Given out", hint: "Done", owner: null, ownerLabel: null, action: null, button: null, tone: "success",
    todo: "Done. The order is complete." },
]

export const fgStepOf = (status) => FG_STEPS.find((s) => s.status === status) || null
export const fgIndexOf = (status) => FG_STEPS.findIndex((s) => s.status === status)

/* Billed but not fully paid: nothing leaves the Store before the whole bill is paid, so it is Marketing's turn to collect */
const COLLECT_STEP = { status: "BILLED", label: "Billed", owner: "MARKETING_MANAGER", ownerLabel: "Marketing Manager", action: "pay", button: "Mark as paid", tone: "info",
  todo: "Take the full payment, then mark the bill as paid. The Store gives the goods out only after that." }

/* where this order stands now: its status' step, or collecting the payment while the bill is still due */
export const fgStepFor = (item) => (item?.status === "BILLED" && item.bill?.due > 0 ? COLLECT_STEP : fgStepOf(item?.status))

/* the step this role should act on, or null when the next move belongs to someone else */
export const myFgStep = (item, role) => {
  const step = fgStepFor(item)
  if (!step?.action) return null
  return role === "SUPER_ADMIN" || role === "PRODUCTION_ADMIN" || role === step.owner ? step : null
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
