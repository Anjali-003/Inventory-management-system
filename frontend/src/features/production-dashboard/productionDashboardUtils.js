import {
  inProductionQuantity,
  isApprovedForProduction,
  isProductionCompleted,
  leftToBeAllottedQuantity,
  productionWorkflowStatus,
  readyToStartQuantity,
} from "@/features/production/productionWorkflow"

const STARTABLE_ORDER_STATUSES = new Set(["PENDING", "IN_PRODUCTION", "TESTING"])

export const qty = (value) => Number(value || 0)

export const remainingToStart = (item) => Math.max(
  0,
  qty(item.remaining_to_start ?? (qty(item.ordered_quantity) - qty(item.quantity_to_produce))),
)

export const inProduction = (item) => Math.max(
  0,
  qty(item.quantity_in_production ?? (qty(item.quantity_to_produce) - qty(item.quantity_completed))),
)

export const isStartable = (item) => remainingToStart(item) > 0 && STARTABLE_ORDER_STATUSES.has(item.order_status)

export const hasMaterialIssue = (item) => isStartable(item) && ["SHORTAGE", "UNKNOWN"].includes(item.material_status)

export const toProductionOrder = (item) => ({
  id: item.order_id,
  order_id: item.order_id,
  order_item_id: item.order_item_id,
  order_number: item.order_number,
  item_count: item.item_count,
  item_index: item.item_index,
  product_name: item.product_name,
  quantity: qty(item.ordered_quantity),
  status: item.order_status,
  quantity_to_produce: qty(item.quantity_to_produce),
  remaining_to_start: remainingToStart(item),
})

export function isSameLocalDay(value, now = new Date()) {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

export function getTodayTaskCount(items) {
  return new Set(items
    .filter((item) => isSameLocalDay(item.order_created_at) || isSameLocalDay(item.started_at))
    .map((item) => item.order_id ?? item.id))
    .size
}

export function getCompletedTodayCount(items) {
  return new Set(items
    .filter((item) => isProductionCompleted(item) && isSameLocalDay(item.completed_at))
    .map((item) => item.order_item_id ?? item.id ?? item.order_id))
    .size
}

export function getActiveProduction(items) {
  return items.filter((item) => item.status === "IN_PRODUCTION" && inProduction(item) > 0)
}

export function getMaterialIssues(items) {
  return items.filter((item) => hasMaterialIssue(item))
}

export function getAwaitingAllotmentCount(items) {
  return items.filter((item) => (
    !isProductionCompleted(item)
    && isApprovedForProduction(item)
    && item.material_status !== "UNKNOWN"
    && leftToBeAllottedQuantity(item) > 0
  )).length
}

export function getWorkQueue(items) {
  return items
    .filter((item) => {
      if (isProductionCompleted(item)) return false
      const workflow = productionWorkflowStatus(item)
      const active = inProductionQuantity(item) > 0
      const requestable = isApprovedForProduction(item)
        && leftToBeAllottedQuantity(item) > 0
        && item.material_status !== "UNKNOWN"
      const ready = readyToStartQuantity(item) > 0
      return active || requestable || ready || workflow.key === "awaiting_allotment" || workflow.key === "partially_allotted"
    })
    .sort((a, b) => {
      const priority = (item) => {
        const workflow = productionWorkflowStatus(item)
        if (workflow.key === "awaiting_allotment" || workflow.key === "partially_allotted") return 0
        if (inProductionQuantity(item) > 0) return 1
        if (readyToStartQuantity(item) > 0) return 2
        return 3
      }
      const priorityDifference = priority(a) - priority(b)
      if (priorityDifference) return priorityDifference
      const timeA = new Date(a.started_at || a.order_created_at || 0).getTime() || 0
      const timeB = new Date(b.started_at || b.order_created_at || 0).getTime() || 0
      return timeB - timeA
    })
}

export function getLowStockItems(items) {
  return items
    .filter((item) => qty(item.available) <= qty(item.minimum_stock_level))
    .sort((a, b) => (qty(a.available) - qty(a.minimum_stock_level)) - (qty(b.available) - qty(b.minimum_stock_level)))
}

export function formatWhen(value) {
  if (!value) return "Date unavailable"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Date unavailable"
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function readinessFor(item) {
  const workflow = productionWorkflowStatus(item)
  const variants = { warning: "warning", info: "info", success: "success", neutral: "neutral" }
  return {
    label: workflow.label,
    variant: variants[workflow.tone] || "neutral",
  }
}
