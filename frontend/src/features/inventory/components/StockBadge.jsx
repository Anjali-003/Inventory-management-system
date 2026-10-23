import { Badge } from "@/components/ui/badge"

export function stockState(item) {
  if (item.is_active === 0) return "archived"
  const onHand = Number(item.quantity_on_hand)
  if (onHand <= 0) return "out"
  if (onHand <= Number(item.minimum_stock_level)) return "low"
  return "ok"
}

export function StockBadge({ item }) {
  switch (stockState(item)) {
    case "archived": return <Badge variant="neutral">Archived</Badge>
    case "out": return <Badge variant="danger">Out of stock</Badge>
    case "low": return <Badge variant="warning">Low stock</Badge>
    default: return <Badge variant="success">In stock</Badge>
  }
}
