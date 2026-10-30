import { remainingToStart } from "@/production/production/productionWorkflow"

export const qty = (value) => Number(value || 0)

/* A production line in the shape the Start production and Request materials popups take. */
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
