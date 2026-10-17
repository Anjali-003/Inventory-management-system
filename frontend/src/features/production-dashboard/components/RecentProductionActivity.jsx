import { CheckCircle2, Factory, History } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback"
import { formatWhen } from "@/features/production-dashboard/productionDashboardUtils"

export default function RecentProductionActivity({ items, loading }) {
  const events = items.flatMap((item) => {
    const result = []
    if (item.started_at) result.push({
      id: `${item.order_id}-started`,
      kind: "started",
      order: item.order_number,
      product: item.product_name,
      actor: item.started_by_name,
      at: item.started_at,
    })
    if (item.completed_at) result.push({
      id: `${item.order_id}-completed`,
      kind: "completed",
      order: item.order_number,
      product: item.product_name,
      actor: item.updated_by_name || item.started_by_name,
      at: item.completed_at,
    })
    return result
  }).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5)

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <CardTitle>Recent production activity</CardTitle>
        <CardDescription>Latest recorded start and completion milestones.</CardDescription>
      </CardHeader>
      {loading ? (
        <div className="space-y-4 p-5">
          {[0, 1, 2].map((key) => <div key={key} className="h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="No production activity yet">
          Production starts and completions will be listed here when recorded.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {events.map((event) => {
            const Icon = event.kind === "completed" ? CheckCircle2 : Factory
            const title = event.kind === "completed" ? "Production completed" : "Production started"
            return (
              <div key={event.id} className="flex min-w-0 items-start gap-3 px-4 py-3.5 sm:px-5">
                <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${event.kind === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title} · <span className="tabular-nums">{event.order}</span></p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.product || "Product unavailable"}{event.actor ? ` · ${event.actor}` : ""}</p>
                </div>
                <time className="shrink-0 text-right text-xs text-muted-foreground">{formatWhen(event.at)}</time>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
