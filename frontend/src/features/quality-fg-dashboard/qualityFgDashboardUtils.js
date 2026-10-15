const number = (value) => Math.max(0, Number(value) || 0)

export function getQcNeedsTesting(items = []) {
  return items.filter((item) => number(item.remainingToTest) > 0 || number(item.quantityFailed) > 0)
}

export function getQcReadyForInspection(items = []) {
  return items.filter((item) =>
    number(item.remainingToTest) === 0 &&
    number(item.quantityFailed) === 0 &&
    (number(item.availableForQC) > 0 || number(item.quantityRejected) > 0)
  )
}

export function getActionableQcItems(items = []) {
  const priority = (item) => {
    if (number(item.remainingToTest) > 0) return 0
    if (number(item.quantityFailed) > 0) return 1
    if (number(item.availableForQC) > 0) return 2
    if (number(item.quantityRejected) > 0) return 3
    return 4
  }
  return items
    .filter((item) => priority(item) < 4)
    .sort((a, b) => priority(a) - priority(b))
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

export function getQcActionLabel(item) {
  if (number(item.remainingToTest) > 0) return `${number(item.remainingToTest)} unit(s) need testing`
  if (number(item.quantityFailed) > 0) return `${number(item.quantityFailed)} failed unit(s) need retesting`
  if (number(item.availableForQC) > 0) return `${number(item.availableForQC)} unit(s) ready for QC`
  if (number(item.quantityRejected) > 0) return `${number(item.quantityRejected)} unit(s) need QC review`
  return "No action pending"
}

export function getFinishedGoodsStatus(status) {
  if (status === "PACKAGING") return { label: "Packaging / ready to dispatch", variant: "warning" }
  if (status === "DISPATCHED") return { label: "Dispatched / awaiting completion", variant: "info" }
  if (status === "COMPLETED") return { label: "Completed", variant: "success" }
  return { label: status || "Unknown", variant: "neutral" }
}
