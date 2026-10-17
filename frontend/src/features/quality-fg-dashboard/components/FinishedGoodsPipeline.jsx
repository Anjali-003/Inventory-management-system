import { ArrowRight, PackageCheck, Truck } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { countFinishedGoods, getFinishedGoodsStatus } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

const number = (value) => Math.max(0, Number(value) || 0)

export default function FinishedGoodsPipeline({ items = [], loading }) {
  const navigate = useNavigate()
  const recent = [...items].slice(0, 5)
  const packaging = countFinishedGoods(items, "PACKAGING")
  const dispatched = countFinishedGoods(items, "DISPATCHED")
  const completed = countFinishedGoods(items, "COMPLETED")

  return (
    <Card className="overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <div>
          <CardTitle>Finished Goods pipeline</CardTitle>
          <CardDescription>Batches that passed QC move through these steps: pack them, mark them dispatched, then mark them complete.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/finished-goods")}>View all <ArrowRight /></Button>
      </CardHeader>

      <div className="grid grid-cols-3 divide-x border-b">
        {[ ["Packaging", packaging, "warning"], ["Dispatched", dispatched, "info"], ["Completed", completed, "success"] ].map(([label, value, tone]) => (
          <button key={label} type="button" onClick={() => navigate("/finished-goods")} className="min-w-0 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "warning" ? "text-amber-700" : tone === "info" ? "text-blue-700" : "text-emerald-700"}`}>{loading ? "—" : value}</p>
          </button>
        ))}
      </div>

      {loading ? <TableSkeleton rows={3} /> : recent.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No finished-goods batches yet">
          Batches appear here only after the entire production batch receives a PASS decision in Quality Control.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {recent.map((item) => {
            const state = getFinishedGoodsStatus(item.status)
            return (
              <button key={item.id} type="button" onClick={() => navigate("/finished-goods")} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cf-green-soft text-primary">
                  {item.status === "DISPATCHED" ? <Truck className="size-4" /> : <PackageCheck className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.orderNumber || `Batch #${item.id}`}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.productName || "Product unavailable"} · {number(item.quantity)} units</span>
                </span>
                <Badge variant={state.variant}>{state.label}</Badge>
              </button>
            )
          })}
        </div>
      )}

      <div className="border-t px-5 py-3">
        <Button variant="outline" className="w-full" onClick={() => navigate("/finished-goods")}><PackageCheck /> Manage finished goods</Button>
      </div>
    </Card>
  )
}
