const number = (value) => Math.max(0, Number(value) || 0)

export function getQcPendingBatches(items = []) {
  return items.filter((item) => !item.batchDecision && number(item.quantityCompleted) >= number(item.orderedQuantity) && number(item.orderedQuantity) > 0)
}

export function getQcPreviousBatches(items = []) {
  return items.filter((item) => Boolean(item.batchDecision))
}

export function getQcFailedBatches(items = []) {
  return items.filter((item) => item.batchDecision === "FAIL")
}

export function getActionableQcItems(items = []) {
  return getQcPendingBatches(items).sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0))
}

export function getQcActionLabel(item) {
  return `Full batch complete · ${number(item.quantityCompleted)} of ${number(item.orderedQuantity)} units ready for one Pass/Fail decision`
}

export function countFinishedGoods(items = [], status) {
  return items.filter((item) => item.status === status).length
}

export function getActiveProduction(items = []) {
  return items.filter((item) => Number(item.quantity_in_production || 0) > 0)
}

export function getProductionCompletion(item) {
  const total = number(item.ordered_quantity)
  const completed = number(item.quantity_completed)
  return total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
}

export function getFinishedGoodsStatus(status) {
  if (status === "PACKAGING") return { label: "Packaging / ready to dispatch", variant: "warning" }
  if (status === "DISPATCHED") return { label: "Dispatched / awaiting completion", variant: "info" }
  if (status === "COMPLETED") return { label: "Completed", variant: "success" }
  return { label: status || "Unknown", variant: "neutral" }
}
