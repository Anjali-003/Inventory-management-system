import { motion } from "motion/react"
import { cn } from "../lib/utils"

const DOT = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-primary",
  neutral: "bg-muted-foreground/50",
}

/**
 * One connected strip of figures. Give an item `onClick` to make it a filter toggle
 * (`active` marks the selected one). `cols` is a full Tailwind grid-cols class string.
 */
export default function StatStrip({ items, cols = "grid-cols-2 lg:grid-cols-4", layoutId = "stat-active" }) {
  return (
    <div className={cn("grid gap-px bg-border", cols)}>
      {items.map((it) => {
        const inner = (
          <>
            {it.active && <motion.span layoutId={layoutId} className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", DOT[it.tone ?? "neutral"])} />
              {it.label}
            </span>
            <span className="mt-1.5 block text-2xl font-semibold tabular-nums tracking-tight">{it.value}</span>
            {it.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{it.hint}</span>}
          </>
        )
        const cell = "relative block px-5 py-4 text-left"
        return it.onClick ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={!!it.active}
            onClick={it.onClick}
            className={cn(cell, "outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60", it.active ? "bg-accent/60" : "bg-card hover:bg-muted/50")}
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
