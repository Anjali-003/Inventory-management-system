import { motion } from "motion/react"
import { CalendarClock, Factory } from "lucide-react"
import { cn } from "@/lib/utils"

const number = (value) => Math.max(0, Number(value || 0))
const formatDate = (value) => (value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "Not started")

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
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-700 transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function QuantityTile({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-extrabold leading-none tabular-nums text-slate-950">{number(value).toLocaleString()}</p>
    </div>
  )
}

/** Desktop production-order card. The supplied actions reuse the existing workflow handlers. */
export default function ProductionOrderCard({ item, readiness, actions }) {
  const completed = number(item.quantity_completed)
  const ordered = number(item.ordered_quantity)
  const started = number(item.quantity_to_produce)
  const remaining = Math.max(0, number(item.remaining_to_start ?? (ordered - started)))
  const active = Math.max(0, number(item.quantity_in_production ?? (started - completed)))
  const shortage = item.material_status === "SHORTAGE"
  const unknown = item.material_status === "UNKNOWN"

  return (
    <motion.article
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.998 }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-[#dce5e0] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-shadow hover:shadow-md"
    >
      <span aria-hidden className={cn(
        "absolute inset-y-0 left-0 w-1 bg-gradient-to-b",
        shortage ? "from-rose-500 to-red-700" : unknown ? "from-amber-400 to-orange-600" : "from-emerald-500 to-teal-700"
      )} />

      <div className="min-w-0 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-slate-950 tabular-nums">
              {item.order_number || `Order #${item.order_id}`}
            </p>
            <p className="mt-1 break-words text-sm font-medium leading-snug text-slate-800">
              {item.product_name || "Product unavailable"}
            </p>
            {item.product_sku && <p className="mt-1 break-words text-xs text-slate-600">{item.product_sku}</p>}
          </div>
          <span className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
            shortage ? "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200" :
              unknown ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" :
                remaining === 0 ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200" :
                  "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
          )}>
            <span className={cn("size-1.5 rounded-full", shortage ? "bg-rose-600" : unknown ? "bg-amber-500" : remaining === 0 ? "bg-blue-600" : "bg-emerald-600")} />
            {shortage ? "Material shortage" : unknown ? "BOM needs review" : remaining === 0 ? "Fully started" : "Production order"}
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <Progress completed={completed} ordered={ordered} />
          <div className="mt-3">{readiness}</div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <QuantityTile label="Started" value={started} />
          <QuantityTile label="In progress" value={active} />
          <QuantityTile label="To start" value={remaining} />
        </div>

        <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-dashed border-slate-200 pt-4">
          <div className="flex min-w-0 items-start gap-2 text-xs text-slate-600">
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p>{formatDate(item.started_at)}</p>
              {item.started_by_name && <p className="mt-0.5 break-words font-medium text-slate-800">Started by {item.started_by_name}</p>}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Factory className="size-3.5" aria-hidden /> Production tracking
            </span>
            <div className="flex min-w-0 flex-wrap justify-end gap-2 [&_button]:min-h-9">
              {actions}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  )
}
