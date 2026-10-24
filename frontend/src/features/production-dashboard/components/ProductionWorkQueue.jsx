import { ArrowRight, Factory, PackagePlus, Play, Wrench } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import {
  getWorkQueue,
  inProduction,
  isStartable,
  qty,
  readinessFor,
} from "@/features/production-dashboard/productionDashboardUtils"
import {
  isApprovedForProduction,
  isProductionCompleted,
  leftToBeAllottedQuantity,
  readyToStartQuantity,
} from "@/features/production/productionWorkflow"

function OrderProgress({ item }) {
  const ordered = qty(item.ordered_quantity)
  const completed = qty(item.quantity_completed)
  const percent = ordered > 0 ? Math.min(100, Math.round((completed / ordered) * 100)) : 0
  return (
    <div className="mt-2 min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{completed} / {ordered} units completed</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default function ProductionWorkQueue({ items, loading, onRequest, onStart }) {
  const navigate = useNavigate()
  const queue = getWorkQueue(items).slice(0, 6)

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-[#E3E6EB] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Production work queue</CardTitle>
          <CardDescription>Request materials, start allotted units, or record completed production.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate("/production")}>
          View all <ArrowRight />
        </Button>
      </CardHeader>
      {loading ? <div className="p-4"><TableSkeleton rows={4} /></div> : queue.length === 0 ? (
        <EmptyState icon={Factory} title="No production tasks need attention">
          Approved product lines will appear here when a material request or production action is available.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {queue.map((item) => {
            const readiness = readinessFor(item)
            const complete = isProductionCompleted(item)
            const activeUnits = inProduction(item)
            const ready = readyToStartQuantity(item)
            const left = leftToBeAllottedQuantity(item)
            const approved = isApprovedForProduction(item)
            const canRequest = approved && !complete && left > 0 && item.material_status !== "UNKNOWN"
            const canStart = approved && !complete && isStartable(item) && item.material_status !== "UNKNOWN" && ready > 0

            return (
              <div key={item.order_item_id ?? item.id ?? item.order_id} className="min-w-0 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold tabular-nums">{item.order_number}</p>
                      <Badge variant={readiness.variant}>{readiness.label}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground" title={item.product_name || "-"}>{item.product_name || "-"}</p>
                    <OrderProgress item={item} />
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{qty(item.material_allotted_quantity)} units allotted</span>
                      <span>{left} left to be allotted</span>
                      <span>{qty(item.quantity_completed)} completed</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {canRequest && (
                      <Button variant="outline" size="sm" onClick={() => onRequest(item)}>
                        <PackagePlus /> Request materials
                      </Button>
                    )}
                    {canStart && (
                      <Button size="sm" onClick={() => onStart(item)}>
                        <Play /> Start production
                      </Button>
                    )}
                    {activeUnits > 0 && (
                      <Button variant="outline" size="sm" onClick={() => navigate("/production")}>
                        <Wrench /> Record completed units
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
