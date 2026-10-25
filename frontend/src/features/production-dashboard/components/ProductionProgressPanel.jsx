import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  isApprovedForProduction,
  isProductionCompleted,
  leftToBeAllottedQuantity,
  materialAllottedQuantity,
} from "@/features/production/productionWorkflow"
import { qty } from "@/features/production-dashboard/productionDashboardUtils"

export default function ProductionProgressPanel({ items, loading }) {
  const relevantItems = items.filter((item) => (
    !isProductionCompleted(item)
    && (qty(item.quantity_to_produce) > 0 || (isApprovedForProduction(item) && leftToBeAllottedQuantity(item) > 0))
  ))
  const ordered = relevantItems.reduce((total, item) => total + qty(item.ordered_quantity), 0)
  const allotted = relevantItems.reduce((total, item) => total + materialAllottedQuantity(item), 0)
  const completed = relevantItems.reduce((total, item) => total + qty(item.quantity_completed), 0)
  const leftToAllot = relevantItems.reduce((total, item) => total + leftToBeAllottedQuantity(item), 0)
  const percent = ordered > 0 ? Math.min(100, Math.round((completed / ordered) * 100)) : 0

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-[#E3E6EB] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <CardTitle>Production progress</CardTitle>
        <CardDescription>Material received from Store and units built, per product line.</CardDescription>
      </CardHeader>
      {loading ? (
        <div className="space-y-4 p-5">
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-3 gap-3"><div className="h-16 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /></div>
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Completed units</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{completed.toLocaleString()}</p>
            </div>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">{percent}% of {ordered.toLocaleString()} ordered</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Material received", value: allotted, tone: "text-emerald-800 bg-emerald-50 border-emerald-100" },
              { label: "Left to be allotted", value: leftToAllot, tone: "text-amber-800 bg-amber-50 border-amber-100" },
              { label: "Completed", value: completed, tone: "text-blue-800 bg-blue-50 border-blue-100" },
            ].map((metric) => (
              <div key={metric.label} className={`rounded-xl border px-3 py-3 ${metric.tone}`}>
                <p className="text-xs font-bold uppercase tracking-wide opacity-80">{metric.label}</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{metric.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
