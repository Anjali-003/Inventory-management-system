import { ArrowUpRight, PackageCheck } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { qty, getLowStockItems } from "@/features/production-dashboard/productionDashboardUtils"

export default function StockWatchPanel({ items, loading }) {
  const navigate = useNavigate()
  const lowStock = getLowStockItems(items).slice(0, 5)

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Stock to watch</CardTitle>
          <CardDescription>Components at or below their minimum stock level.</CardDescription>
        </div>
        <Button variant="outline" size="icon" aria-label="Open inventory" title="Open inventory" onClick={() => navigate("/inventory")}>
          <ArrowUpRight />
        </Button>
      </CardHeader>
      {loading ? <div className="p-4"><TableSkeleton rows={3} /></div> : lowStock.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Stock levels look healthy">
          Components at or below their minimum level will show up here.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {lowStock.map((item) => {
            const available = qty(item.available)
            const minimum = qty(item.minimum_stock_level)
            const out = available <= 0
            return (
              <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={item.component_name}>{item.component_name || "Unnamed component"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.sku || "No SKU"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Minimum {minimum}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold tabular-nums ${out ? "text-destructive" : ""}`}>{available}</p>
                  <Badge variant={out ? "danger" : "warning"}>{out ? "Out of stock" : "Low stock"}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
