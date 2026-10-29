import { Link } from "react-router-dom"
import { CheckCircle2, Clock, PackagePlus, PlayCircle, Wrench } from "lucide-react"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { PageButton, SURFACE } from "@/components/PageKit"
import { cn } from "@/lib/utils"
import {
  canRecordUnits, canStartProduction, daysUntil, dueDateOf, dueLine, materialState, needsMaterialRequest, needsRework, nextStep, shortDay,
} from "@/features/production/productionWorkflow"

const num = (v) => Math.max(0, Number(v || 0))

// the next step's colour: amber = the Production Manager's turn, grey = someone else's, green = done
const STEP = {
  action: { icon: PlayCircle, cls: "text-amber-800" },
  wait: { icon: Clock, cls: "text-lp-muted" },
  done: { icon: CheckCircle2, cls: "text-success" },
}
const MATERIAL_DOT = { success: "bg-success", info: "bg-sky-500", warning: "bg-amber-500" }

/* The buttons of a line: every step that is the Production Manager's now, the main one (solid) last. */
export function LineActions({ item, onStart, onRecord, onRequest }) {
  const start = canStartProduction(item)
  const record = canRecordUnits(item)
  const request = needsMaterialRequest(item)
  if (!start && !record && !request) return null
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {request && <PageButton size="sm" variant={start || record ? "outline" : "primary"} onClick={() => onRequest(item)}><PackagePlus /> Ask Store for materials</PageButton>}
      {record && <PageButton size="sm" variant={start ? "outline" : "primary"} onClick={() => onRecord(item)}><CheckCircle2 /> Record finished units</PageButton>}
      {start && <PageButton size="sm" variant="primary" onClick={() => onStart(item)}><PlayCircle /> Start production</PageButton>}
    </div>
  )
}

/*
  One product line of an order on the Production page: the order, who it is for and by when; the next step (or whose
  turn it is); how much is made and where its materials stand; then the buttons. Same surface as the Marketing cards.
*/
export default function ProductionLineCard({ item, editable, onStart, onRecord, onRequest }) {
  const step = nextStep(item)
  const { icon: StepIcon, cls } = STEP[step.tone]
  const made = num(item.quantity_completed)
  const ordered = num(item.ordered_quantity)
  const pct = ordered > 0 ? Math.min(100, Math.round((made / ordered) * 100)) : 0
  const material = materialState(item)
  const due = dueDateOf(item)
  const days = due ? daysUntil(due) : null
  const open = step.tone !== "done"

  return (
    <article className={cn(SURFACE, "flex min-w-0 flex-col p-4 transition-colors hover:border-lp-rule")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <OrderDisplayNumber orderNumber={item.order_number} itemCount={item.item_count} itemIndex={item.item_index} fallback={`Order #${item.order_id}`}
            to={`/order-tracker?order=${item.order_id}`} className="text-base font-semibold tabular-nums text-lp-ink" />
          <p className="truncate text-[13px] text-lp-muted">{[item.customer_name, item.product_name].filter(Boolean).join(" · ") || "Product unavailable"}</p>
        </div>
        {due && open && (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", days < 0 ? "bg-rose-50 text-rose-700" : days <= 7 ? "bg-amber-50 text-amber-800" : "bg-lp-bg text-lp-muted")} title={`Delivery date ${shortDay(due)}`}>
            {days <= 7 ? dueLine(days) : `Due ${shortDay(due)}`}
          </span>
        )}
      </div>

      <p className={cn("mt-3 flex items-start gap-2 text-[13px] font-semibold", cls)}>
        <StepIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{step.text}
      </p>

      {needsRework(item) && (
        <Link to="/qc-failed" className="mt-2 flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50">
          <Wrench className="size-3.5 shrink-0" aria-hidden /> QC failed this batch. Fix it on QC Failed / Rework.
        </Link>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2 text-xs text-lp-muted">
          <span><b className="font-semibold text-lp-ink tabular-nums">{made}</b> of <b className="font-semibold text-lp-ink tabular-nums">{ordered}</b> made</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lp-bg" role="progressbar" aria-label="Units made" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-lp-green transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-lp-muted">
          <span className={cn("size-2 shrink-0 rounded-full", MATERIAL_DOT[material.tone])} aria-hidden />
          <span className="font-medium text-lp-ink">{material.label}</span> · {material.detail}
        </p>
      </div>

      {editable && (canStartProduction(item) || canRecordUnits(item) || needsMaterialRequest(item)) && (
        <div className="mt-auto pt-4">
          <div className="border-t border-dashed border-lp-line pt-3"><LineActions item={item} onStart={onStart} onRecord={onRecord} onRequest={onRequest} /></div>
        </div>
      )}
    </article>
  )
}
