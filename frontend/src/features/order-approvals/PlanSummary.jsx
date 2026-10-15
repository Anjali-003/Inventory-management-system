import { Badge } from "@/components/ui/badge"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { planVerdict } from "./approvalParts"
import { useGetOrderPlanQuery } from "./orderApprovalsApi"

/*
  The "Stock check" cell of an order row: what can be built right now with the stock on the shelf.
  It reads the plan from the backend and refreshes by itself when stock changes (tag "Inventory").
*/
export default function PlanSummary({ orderId, items = [] }) {
  const { data: plan, isLoading, error } = useGetOrderPlanQuery(orderId)

  if (isLoading) return <span className="text-xs text-muted-foreground">Checking stock...</span>
  if (error || !plan) return <span className="text-xs text-muted-foreground">Could not check stock</span>

  const verdict = planVerdict(plan)
  const names = Object.fromEntries(items.map((i) => [i.product_id, i.name]))

  return (
    <div className="space-y-1.5">
      <Badge variant={verdict.variant}>{verdict.label}</Badge>
      <ul className="space-y-0.5">
        {(plan.lines || []).map((l) => (
          <li key={l.product_id} className="text-xs">
            <span className="text-muted-foreground">{names[l.product_id] || `#${l.product_id}`}: </span>
            <span className={cn("font-semibold tabular-nums", l.can_make === 0 ? "text-destructive" : l.remaining > 0 ? "text-warning" : "text-primary")}>
              {fmtQty(l.can_make)}
            </span>
            <span className="text-muted-foreground"> of {fmtQty(l.ordered)} can be made</span>
          </li>
        ))}
      </ul>
      {plan.shortages?.length > 0 && (
        <p className="text-xs text-destructive">{plan.shortages.length} component{plan.shortages.length > 1 ? "s" : ""} short for the rest</p>
      )}
    </div>
  )
}
