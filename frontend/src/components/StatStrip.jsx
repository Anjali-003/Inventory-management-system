import { motion } from "motion/react"
import { StageChips, StatusSelect } from "@/features/marketing-orders/mktKit"
import { cn } from "../lib/utils"

const DOT = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-primary",
  neutral: "bg-muted-foreground/50",
}

// the colour of the selected chip on a phone, per tone
const GRAD = {
  success: "from-emerald-700 to-emerald-800",
  warning: "from-amber-700 to-orange-800",
  danger: "from-rose-600 to-red-800",
  info: "from-sky-700 to-blue-800",
  neutral: "from-slate-600 to-slate-800",
}

// soft tinted look of the unselected chips on a phone (same as the Marketing Orders chips)
const PILL = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  neutral: "bg-slate-100 text-slate-800 ring-slate-200",
}

/**
 * One connected strip of figures. Give an item `onClick` to make it a filter toggle
 * (`active` marks the selected one). `cols` is a full Tailwind grid-cols class string.
 * `dropdown` (a label): the strip is responsive: a thin scrolling row of chips on a phone, this strip on a tablet,
 * and one dropdown listing every figure with its count on a PC (lg+).
 */
export default function StatStrip({ items, cols = "grid-cols-2 lg:grid-cols-4", layoutId = "stat-active", dropdown }) {
  return (
    <>
      {dropdown && (
        <StageChips
          label={dropdown}
          items={items.map((it) => ({ key: it.key, label: it.label, value: it.value, grad: GRAD[it.tone ?? "neutral"], pill: PILL[it.tone ?? "neutral"], dot: DOT[it.tone ?? "neutral"], active: it.active, onClick: it.onClick }))}
        />
      )}
      {dropdown && (
        <div className="hidden items-center gap-3 border-b px-4 py-3 sm:px-5 lg:flex">
          <StatusSelect portal label={dropdown} items={items.map((it) => ({ key: it.key, label: it.label, value: it.value, dot: DOT[it.tone ?? "neutral"], active: it.active, onClick: it.onClick }))} />
        </div>
      )}
      <StripGrid items={items} cols={cn(cols, dropdown && "hidden md:grid lg:hidden")} layoutId={layoutId} />
    </>
  )
}

function StripGrid({ items, cols, layoutId }) {
  return (
    <div className={cn("grid gap-px bg-border", cols)}>
      {items.map((it) => {
        const inner = (
          <>
            {it.active && <motion.span layoutId={layoutId} className="absolute inset-x-0 top-0 h-[3px] bg-primary" />}
            <span className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span className={cn("size-2 rounded-full", DOT[it.tone ?? "neutral"])} />
              {it.label}
            </span>
            <span className="mt-1.5 block text-[24px] font-bold tabular-nums tracking-[-0.7px]">{it.value}</span>
            {it.hint && <span className="mt-0.5 block text-[11px] text-cf-faint">{it.hint}</span>}
          </>
        )
        const cell = cn("relative block px-5 py-4 text-left", it.className)
        return it.onClick ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={!!it.active}
            onClick={it.onClick}
            className={cn(cell, "outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60", it.active ? "bg-accent/70" : "bg-card hover:bg-cf-head")}
          >
            {inner}
          </button>
        ) : (
          <div key={it.key} className={cn(cell, "bg-card")}>{inner}</div>
        )
      })}
    </div>
  )
}
