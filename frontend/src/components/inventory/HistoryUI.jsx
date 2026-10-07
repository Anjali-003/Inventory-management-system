import { cn } from "../../lib/utils"

/*
    Small building blocks shared by the Inventory History page only:
    Panel, Pill, Initials, Sparkline, PanelSkeleton and the reason -> colour map.
*/

export const PANEL_SHADOW = "shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)]"

export function Panel({ title, description, action, className, children }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", PANEL_SHADOW, className)}>
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-6 tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
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

export function PanelSkeleton({ rows = 3, className }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", PANEL_SHADOW, className)} aria-busy="true">
      <div className="space-y-2 border-b px-6 py-4">
        <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-3 w-64 max-w-full rounded bg-muted motion-safe:animate-pulse" />
      </div>
      <div className="space-y-3 px-6 py-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-muted motion-safe:animate-pulse" style={{ width: `${92 - i * 11}%` }} />
        ))}
      </div>
    </div>
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
      <div className="relative h-24 text-primary">
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
