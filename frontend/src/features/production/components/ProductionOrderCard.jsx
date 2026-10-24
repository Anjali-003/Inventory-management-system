import { motion } from "motion/react"
import { CalendarClock, Factory } from "lucide-react"
import { cn } from "@/lib/utils"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { isProductionCompleted, leftToBeAllottedQuantity, materialAllottedQuantity, productionWorkflowStatus } from "@/features/production/productionWorkflow"

const number = (value) => Math.max(0, Number(value || 0))
const formatDate = (value) => (value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "—")

function Progress({ completed, ordered }) {
  const percentage = ordered > 0 ? Math.min(100, Math.round((completed / ordered) * 100)) : 0

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums text-slate-900">
          {completed.toLocaleString()} / {ordered.toLocaleString()} units completed
        </p>
        <p className="text-sm font-bold tabular-nums text-slate-700">{percentage}%</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Production completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-teal-800 transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function QuantityTile({ label, value, tone = "neutral" }) {
  const toneClass = {
    neutral: "border-slate-200 bg-slate-50 text-slate-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  }[tone]

  return (
    <div className={cn("min-w-0 rounded-xl border px-3 py-3", toneClass)}>
      <p className="break-words text-[10px] font-bold uppercase leading-snug tracking-[0.06em] opacity-75">{label}</p>
      <p className="mt-1 text-xl font-extrabold leading-none tabular-nums">{number(value).toLocaleString()}</p>
    </div>
  )
}

/** Desktop production card. Actions reuse the existing Production workflow handlers. */
export default function ProductionOrderCard({ item, readiness, actions }) {
  const completed = number(item.quantity_completed)
  const ordered = number(item.ordered_quantity)
  const allotted = materialAllottedQuantity(item)
  const left = leftToBeAllottedQuantity(item)
  const status = productionWorkflowStatus(item)
  const complete = isProductionCompleted(item)
  const accentClass = complete
    ? "from-emerald-700 to-teal-800"
    : status.key === "awaiting_allotment" || status.key === "partially_allotted"
      ? "from-amber-700 to-orange-800"
      : status.key === "bom_review" || status.key === "awaiting_approval"
        ? "from-orange-700 to-amber-800"
        : "from-emerald-700 to-teal-800"

  return (
    <motion.article
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.998 }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-[#E3E6EB] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-shadow hover:shadow-md"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${accentClass}`} />

      <div className="min-w-0 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <OrderDisplayNumber
              orderNumber={item.order_number}
              itemCount={item.item_count}
              itemIndex={item.item_index}
              fallback={`Order #${item.order_id}`}
              className="break-words text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-slate-950 tabular-nums"
            />
            <p className="mt-1 break-words text-sm font-semibold leading-snug text-slate-800">
              {item.product_name || "Product unavailable"}
            </p>
            {item.product_sku && <p className="mt-1 break-words text-xs text-slate-600">{item.product_sku}</p>}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <Progress completed={completed} ordered={ordered} />
          <div className="mt-3">{readiness}</div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <QuantityTile label="Allotted" value={allotted} tone="success" />
          <QuantityTile label="Left to be allotted" value={left} tone={left > 0 ? "warning" : "neutral"} />
          <QuantityTile label="Completed" value={completed} tone="info" />
        </div>

        <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-dashed border-slate-200 pt-4">
          <div className="flex min-w-0 items-start gap-2 text-xs text-slate-600">
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p>Last activity: {formatDate(item.completed_at || item.started_at || item.order_created_at)}</p>
              {item.updated_by_name && <p className="mt-0.5 break-words font-medium text-slate-800">Last updated by {item.updated_by_name}</p>}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Factory className="size-3.5" aria-hidden /> Production tracking
            </span>
            <div className="flex min-w-0 flex-wrap justify-end gap-2 [&_button]:min-h-9">{actions}</div>
          </div>
        </div>
      </div>
    </motion.article>
  )
}
