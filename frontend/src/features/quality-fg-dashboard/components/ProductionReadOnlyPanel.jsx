import { ArrowRight, Factory } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { getActiveProduction, getProductionCompletion } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

const number = (value) => Math.max(0, Number(value) || 0)

export default function ProductionReadOnlyPanel({ items = [], loading }) {
  const navigate = useNavigate()
  const rows = [...items]
    .sort((a, b) => Number(b.quantity_in_production || 0) - Number(a.quantity_in_production || 0))
    .slice(0, 4)
  const activeCount = getActiveProduction(items).length

  return (
    <Card className="overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <div>
          <CardTitle>Production status</CardTitle>
          <CardDescription>Read-only progress overview · {loading ? "Loading" : `${activeCount} active run(s)`}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/production")}>View production <ArrowRight /></Button>
      </CardHeader>

      {loading ? <TableSkeleton rows={3} /> : rows.length === 0 ? (
        <EmptyState icon={Factory} title="No production records to display">
          Production details will appear here when orders are available.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {rows.map((item) => {
            const ordered = number(item.ordered_quantity)
            const completed = number(item.quantity_completed)
            const started = number(item.quantity_to_produce)
            const pct = getProductionCompletion(item)
            const inProgress = number(item.quantity_in_production) > 0
            return (
              <button key={item.order_id ?? item.id} type="button" onClick={() => navigate("/production")} className="block w-full px-5 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.order_number || `Order #${item.order_id ?? item.id}`}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.product_name || "Product unavailable"}</span>
                  </span>
                  <Badge variant={inProgress ? "info" : "neutral"}>{inProgress ? "In production" : item.status || item.order_status || "Not started"}</Badge>
                </span>
                <span className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{completed} of {ordered} completed</span>
                  <span className="tabular-nums">{pct}%</span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">{started} units started · {number(item.remaining_to_start)} units yet to start · View only</span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
