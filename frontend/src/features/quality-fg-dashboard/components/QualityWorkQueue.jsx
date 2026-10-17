import { ClipboardCheck, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { getActionableQcItems, getQcActionLabel } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

function stateOf() {
  return { label: "Decision required", variant: "warning" }
}

export default function QualityWorkQueue({ items = [], loading, onOpen }) {
  const navigate = useNavigate()
  const rows = getActionableQcItems(items).slice(0, 5)

  return (
    <Card className="overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader>
        <div>
          <CardTitle>Quality work queue</CardTitle>
          <CardDescription>These batches are fully made and waiting for you to choose Pass or Fail.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/quality-control")}>View all <ArrowRight /></Button>
      </CardHeader>

      {loading ? <TableSkeleton rows={4} /> : rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No quality actions waiting">
          A batch appears here only after every ordered unit has been produced.
        </EmptyState>
      ) : (
        <div className="divide-y">
          {rows.map((item) => {
            const state = stateOf(item)
            return (
              <div key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tabular-nums">{item.orderNumber || `Production #${item.id}`}</p>
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground" title={item.productName}>{item.productName || "Product unavailable"} {item.productSku ? `· ${item.productSku}` : ""}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{getQcActionLabel(item)}</p>
                </div>
                <Button size="sm" onClick={() => onOpen(item)}><ClipboardCheck /> Open QC</Button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
