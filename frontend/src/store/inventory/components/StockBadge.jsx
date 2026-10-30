import { Badge } from "@/components/ui/badge"
import { stockState } from "@/lib/stock"

export function StockBadge({ item }) {
  switch (stockState(item)) {
    case "archived": return <Badge variant="neutral">Archived</Badge>
    case "out": return <Badge variant="danger">Out of stock</Badge>
    case "low": return <Badge variant="warning">Low stock</Badge>
    default: return <Badge variant="success">In stock</Badge>
  }
}
