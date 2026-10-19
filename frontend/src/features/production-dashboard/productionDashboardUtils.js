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
    .filter((item) => item.status === "COMPLETED" && isSameLocalDay(item.completed_at))
    .map((item) => item.order_id ?? item.id))
    .size
}

export function getActiveProduction(items) {
  return items.filter((item) => item.status === "IN_PRODUCTION" && inProduction(item) > 0)
}

export function getMaterialIssues(items) {
  return items.filter((item) => hasMaterialIssue(item))
}

export function getWorkQueue(items) {
  return items
    .filter((item) => {
      const active = item.status === "IN_PRODUCTION" && inProduction(item) > 0
      return active || isStartable(item)
    })
    .sort((a, b) => {
      const priority = (item) => {
        if (item.material_status === "SHORTAGE") return 0
        if (item.material_status === "UNKNOWN") return 1
        if (item.status === "IN_PRODUCTION" && inProduction(item) > 0) return 2
        if (item.material_status === "COVERED") return 3
        return 4
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
  if (remainingToStart(item) <= 0) return { label: "Fully started", variant: "info" }
  if (item.material_status === "UNKNOWN") return { label: "BOM needs review", variant: "warning" }
  if (item.material_status === "SHORTAGE") return { label: "Material shortage", variant: "danger" }
  if (item.material_status === "COVERED") return { label: "Ready to start", variant: "success" }
  return { label: "Waiting", variant: "neutral" }
}
