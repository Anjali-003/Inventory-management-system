import { AlertTriangle, ClipboardCheck } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { getMaterialIssues, qty, remainingToStart } from "@/features/production-dashboard/productionDashboardUtils"

export default function MaterialShortagesPanel({ items, loading, onCheck }) {
  const navigate = useNavigate()
  const issues = getMaterialIssues(items).slice(0, 5)

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <CardTitle>Material shortages</CardTitle>
        <CardDescription>Orders that cannot start their full remaining quantity.</CardDescription>
      </CardHeader>
      {loading ? <div className="p-4"><TableSkeleton rows={3} /></div> : issues.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No material issues">
          All startable orders have enough material, or their material requirements need no further attention.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {issues.map((item) => {
            const unknown = item.material_status === "UNKNOWN"
            const shortBy = Math.max(0, remainingToStart(item) - qty(item.max_production_quantity))
            return (
              <div key={item.order_id} className="space-y-2.5 p-4">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold tabular-nums">{item.order_number}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.product_name || "-"}>{item.product_name || "-"}</p>
                  </div>
                  <Badge variant={unknown ? "warning" : "danger"}>{unknown ? "BOM review" : "Shortage"}</Badge>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  {unknown ? (
                    <p className="text-muted-foreground">Material coverage is unknown. Review the product BOM.</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Units short to start all remaining</span>
                      <span className="shrink-0 font-semibold tabular-nums text-destructive">{shortBy}</span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => onCheck(item)}>
                  <AlertTriangle /> Check material details
                </Button>
              </div>
            )
          })}
        </div>
      )}
      {issues.length > 0 && (
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/production")}>
            View all production orders
          </Button>
        </div>
      )}
    </Card>
  )
}
