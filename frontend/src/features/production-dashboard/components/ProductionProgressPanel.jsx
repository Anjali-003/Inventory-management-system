import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isStartable, qty, remainingToStart } from "@/features/production-dashboard/productionDashboardUtils"

export default function ProductionProgressPanel({ items, loading }) {
  const relevantItems = items.filter((item) => qty(item.quantity_to_produce) > 0 || isStartable(item))
  const ordered = relevantItems.reduce((total, item) => total + qty(item.ordered_quantity), 0)
  const started = relevantItems.reduce((total, item) => total + qty(item.quantity_to_produce), 0)
  const completed = relevantItems.reduce((total, item) => total + qty(item.quantity_completed), 0)
  const waiting = relevantItems.reduce((total, item) => total + (isStartable(item) ? remainingToStart(item) : 0), 0)
  const percent = ordered > 0 ? Math.min(100, Math.round((completed / ordered) * 100)) : 0

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Production progress</CardTitle>
        <CardDescription>Unit-level progress across the orders currently in the production queue.</CardDescription>
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed units</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{completed.toLocaleString()}</p>
            </div>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">{percent}% of {ordered.toLocaleString()} ordered</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Units started", value: started },
              { label: "Units in progress", value: Math.max(0, started - completed) },
              { label: "Units not started", value: waiting },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border bg-muted/20 px-3 py-3">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{metric.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
