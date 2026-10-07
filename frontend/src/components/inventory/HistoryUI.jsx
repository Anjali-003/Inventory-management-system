import { useEffect, useState } from "react"
import { animate, motion } from "motion/react"
import { Card } from "../ui/card"
import { Skeleton } from "../ui/skeleton"
import { cn } from "../../lib/utils"
import { fmtQty } from "../../lib/stock"

/*
    Small building blocks used by the Inventory History page only (same look as the Dashboard):
    HistoryStat, TabBar, Pill, Initials, Sparkline and the reason -> colour map.
*/

const ACCENT = {
  primary: ["border-l-primary", "bg-primary/10 text-primary"],
  success: ["border-l-success", "bg-success/10 text-success"],
  warning: ["border-l-warning", "bg-warning/10 text-warning"],
  danger: ["border-l-destructive", "bg-destructive/10 text-destructive"],
}

function CountUp({ value, format }) {
  const target = Number(value) || 0
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target)
      return
    }
    const c = animate(0, target, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v * 100) / 100),
      onComplete: () => setN(target),
    })
    return () => c.stop()
  }, [target])
  return format(n)
}

export function HistoryStat({ label, value, hint, icon: Icon, tone = "primary", loading, index = 0, format = fmtQty }) {
  const [border, chip] = ACCENT[tone]
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07, duration: 0.3 }}>
      <Card className={cn("flex items-center justify-between gap-2 border-l-4 p-3 sm:p-4", border)}>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
              {value === null || value === undefined ? "-" : <CountUp value={value} format={format} />}
            </p>
          )}
          {hint && !loading && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("hidden size-10 shrink-0 place-items-center rounded-full sm:grid", chip)}>
          <Icon className="size-5" />
        </span>
      </Card>
    </motion.div>
  )
}

export function TabBar({ tabs, value, onChange, label }) {
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const i = tabs.findIndex((t) => t.key === value)
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]
    onChange(next.key)
    document.getElementById(`history-tab-${next.key}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b px-3">
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            id={`history-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`history-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium outline-none transition-colors focus-visible:bg-accent/50",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.badge}
          </button>
        )
      })}
    </div>
  )
}

const PILL = {
  success: "bg-success/10 text-success ring-success/20",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  warning: "bg-warning/10 text-warning ring-warning/25",
  info: "bg-accent text-accent-foreground ring-primary/20",
  neutral: "bg-muted text-muted-foreground ring-border",
}
const DOT = {
  success: "bg-success",
  danger: "bg-destructive",
  warning: "bg-warning",
  info: "bg-primary",
  neutral: "bg-muted-foreground/60",
}

export function Pill({ tone = "neutral", dot = false, className, children }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", PILL[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  )
}

// Reason colour: loss / damage in red, checks and trials in blue, count corrections in amber, everything else quiet.
const REASON_TONE = {
  DAMAGED: "danger",
  PRODUCTION_WASTAGE: "danger",
  LOST: "danger",
  WRONG_ISSUE: "danger",
  QUALITY_CONTROL: "info",
  TESTING: "info",
  SAMPLE_TESTING: "info",
  RND: "info",
  REWORK: "info",
  CUSTOMER_SAMPLE: "info",
  ADJUSTMENT: "warning",
}
export const reasonTone = (code) => REASON_TONE[code] || "neutral"

export function Initials({ name }) {
  const letters = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
      {letters}
    </span>
  )
}

/*
    Cumulative total at the end of each month, as a line. Each month is a button, so the line also works
    as a month picker. Only the drawing is computed here; the figures are the server's.
*/
export function Sparkline({ points, activeKey, onSelect, formatValue, formatLabel }) {
  if (!points || points.length < 2) return null
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const xy = points.map((p, i) => ({
    ...p,
    x: 3 + (i / (points.length - 1)) * 94,
    y: hi === lo ? 50 : 84 - ((p.value - lo) / span) * 66,
  }))
  const line = xy.map((p) => `${p.x},${p.y}`).join(" ")
  const area = `3,100 ${line} 97,100`

  return (
    <div>
      <div className="relative h-20 text-primary">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <polygon points={area} className="fill-current opacity-[0.07]" />
          <polyline points={line} fill="none" className="stroke-current" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {xy.map((p) => {
          const active = p.key === activeKey
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelect?.(p.key)}
              aria-label={`${formatLabel(p.key)}: ${formatValue(p.value)}`}
              aria-current={active || undefined}
              title={`${formatLabel(p.key)}: ${formatValue(p.value)}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              className="group absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span
                className={cn(
                  "rounded-full border-2 border-card bg-primary transition-transform group-hover:scale-125",
                  active ? "size-3.5 ring-4 ring-primary/20" : "size-2"
                )}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{formatLabel(points[0].key)}</span>
        <span>{formatLabel(points[points.length - 1].key)}</span>
      </div>
    </div>
  )
}
