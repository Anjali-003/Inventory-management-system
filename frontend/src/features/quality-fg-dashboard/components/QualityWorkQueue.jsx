import { ClipboardCheck, FlaskConical, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { getActionableQcItems, getQcActionLabel } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

function stateOf(item) {
  if (Number(item.remainingToTest || 0) > 0) return { label: "Testing required", variant: "warning" }
  if (Number(item.quantityFailed || 0) > 0) return { label: "Retesting required", variant: "danger" }
  if (Number(item.availableForQC || 0) > 0) return { label: "Ready for QC", variant: "info" }
  return { label: "QC review required", variant: "warning" }
}

export default function QualityWorkQueue({ items = [], loading, onOpen }) {
  const navigate = useNavigate()
  const rows = getActionableQcItems(items).slice(0, 5)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Quality work queue</CardTitle>
          <CardDescription>Testing, retesting and inspection work that needs attention.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/quality-control")}>View all <ArrowRight /></Button>
      </CardHeader>

      {loading ? <TableSkeleton rows={4} /> : rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No quality actions waiting">
          When production units are ready for testing or inspection, they will appear here.
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
                <Button size="sm" onClick={() => onOpen(item)}><FlaskConical /> Open QC</Button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
