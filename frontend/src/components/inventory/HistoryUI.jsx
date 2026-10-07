import { useEffect, useRef, useState } from "react"
import { animate, AnimatePresence, motion } from "motion/react"
import { Card } from "../ui/card"
import { Skeleton } from "../ui/skeleton"
import { cn } from "../../lib/utils"
import { fmtQty } from "../../lib/stock"

/*
    Building blocks for the Inventory History page (same palette as the Dashboard, just with life in it):
    CountUp, Reveal, HistoryHero, HistoryStat, TabBar, Pill, Initials, MonthBars and the reason -> colour map.

    Motion rules: everything is wrapped by <MotionConfig reducedMotion="user"> on the page, so people who
    ask their OS for less motion get the same layout without the movement. Only the drawing is computed
    here; every business figure still comes from the server.
*/

const EASE = [0.22, 1, 0.36, 1]

const ACCENT = {
  primary: [
    "border-primary/25 hover:border-primary/50",
    "bg-primary/10 text-primary",
    "from-primary/[0.07]",
  ],
  success: ["border-success/25 hover:border-success/50", "bg-success/10 text-success", "from-success/[0.07]"],
  warning: ["border-warning/30 hover:border-warning/60", "bg-warning/10 text-warning", "from-warning/[0.08]"],
  danger: ["border-destructive/25 hover:border-destructive/50", "bg-destructive/10 text-destructive", "from-destructive/[0.07]"],
}

/* ------------------------------------------------------------------ helpers */

// Counts from the previous value to the new one (so changing month "rolls" the number instead of restarting at 0).
export function CountUp({ value, format = fmtQty, duration = 0.9 }) {
  const target = Number(value) || 0
  const from = useRef(0)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target
      setN(target)
      return
    }
    const c = animate(from.current, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v * 100) / 100),
      onComplete: () => { from.current = target; setN(target) },
    })
    return () => { from.current = target; c.stop() }
  }, [target, duration])
  return format(n)
}

// Fade + rise on mount. `delay` staggers sections down the page.
export function Reveal({ delay = 0, className, children }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/* --------------------------------------------------------------------- hero */

// The banner at the top: the cumulative number on the left, a few chips on the right (stacked below on phones).
export function HistoryHero({ label, value, hint, icon: Icon, chips = [] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-[#2f7bf5] via-[#1f63d6] to-[#173f9a] text-white shadow-lg shadow-primary/25"
    >
      {/* decoration: dotted grid + two soft glows (static, nothing keeps moving while you read) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.20) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "linear-gradient(to bottom left, black, transparent 65%)",
          WebkitMaskImage: "linear-gradient(to bottom left, black, transparent 65%)",
        }}
      />
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/15 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-60 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/75">
            {Icon && (
              <motion.span
                initial={{ scale: 0, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.2 }}
                className="grid size-7 place-items-center rounded-full bg-white/15 ring-1 ring-white/25"
              >
                <Icon className="size-4" aria-hidden />
              </motion.span>
            )}
            {label}
          </p>
          <p className="mt-3 text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl">
            {value === null || value === undefined ? "-" : <CountUp value={value} duration={1.1} />}
          </p>
          {hint && <p className="mt-2 text-sm text-white/75">{hint}</p>}
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {chips.map((c, i) => (
              <motion.span
                key={c.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.1, duration: 0.35 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-white/25 backdrop-blur-sm"
              >
                {c.icon && <c.icon className="size-3.5" aria-hidden />}
                {c.label}
              </motion.span>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  )
}

/* -------------------------------------------------------------------- stats */

export function HistoryStat({ label, value, hint, icon: Icon, tone = "primary", loading, index = 0, format = fmtQty, badge }) {
  const [border, chip, glow] = ACCENT[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: EASE }}
    >
      <Card className={cn("relative flex items-center justify-between gap-3 overflow-hidden border bg-gradient-to-br to-card p-3.5 transition-shadow hover:shadow-md sm:p-4", glow, border)}>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
              {value === null || value === undefined ? "-" : <CountUp value={value} format={format} />}
            </p>
          )}
          {!loading && (hint || badge) && (
            <div className="mt-1 flex items-center gap-2">
              {badge}
              {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
            </div>
          )}
        </div>
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 + index * 0.08 }}
          className={cn("hidden size-11 shrink-0 place-items-center rounded-xl sm:grid", chip)}
        >
          <Icon className="size-5" />
        </motion.span>
      </Card>
    </motion.div>
  )
}

/* --------------------------------------------------------------------- tabs */

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
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b bg-muted/30 px-3">
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
              "relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-3 text-sm font-medium outline-none transition-colors focus-visible:bg-accent/50",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon && <t.icon className={cn("size-4 transition-colors", active ? "text-primary" : "")} aria-hidden />}
            {t.label}
            {t.badge}
            {active && (
              <motion.span
                layoutId="history-tab-indicator"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

// Cross-fades the tab content when the tab changes.
export function TabPanel({ id, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        role="tabpanel"
        id={`history-panel-${id}`}
        aria-labelledby={`history-tab-${id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/* -------------------------------------------------------------------- pills */

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

export function Pill({ tone = "neutral", dot = false, pulse = false, className, children }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", PILL[tone], className)}>
      {dot && (
        <span className="relative grid size-1.5 place-items-center">
          {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", DOT[tone])} />}
          <span className={cn("relative size-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
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

export function Initials({ name, className }) {
  const letters = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-[11px] font-semibold text-accent-foreground", className)}>
      {letters}
    </span>
  )
}

/* ----------------------------------------------------------------- month bars */

// One bar per month for a whole year, spread evenly across the full width (12 equal columns).
// rows: [{ key: "2026-03", value, disabled }]. A disabled month has no data yet (before the first
// receipt or after the latest month): it shows a faint stub and can't be opened.
export function MonthBars({ rows, activeKey, onSelect, formatValue, formatLabel, formatAria }) {
  if (!rows || rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 0)
  return (
    <div className="grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }} role="group" aria-label="Received per month">
      {rows.map((r, i) => {
        const active = r.key === activeKey
        const empty = r.disabled || r.value <= 0
        const pct = empty || max <= 0 ? 3 : Math.max(6, (r.value / max) * 100)
        return (
          <button
            key={r.key}
            type="button"
            disabled={r.disabled}
            onClick={() => onSelect?.(r.key)}
            aria-label={r.disabled ? `${(formatAria || formatLabel)(r.key)}: no data` : `${(formatAria || formatLabel)(r.key)}: ${formatValue(r.value)} received`}
            aria-current={active || undefined}
            className="group flex min-w-0 flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default"
          >
            <span className={cn("h-4 whitespace-nowrap text-[11px] font-semibold tabular-nums transition-opacity", active ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
              {r.disabled ? "" : formatValue(r.value)}
            </span>
            <span className="flex h-36 w-full items-end border-b">
              <motion.span
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.6, ease: EASE }}
                className={cn(
                  "w-full rounded-t-md transition-colors",
                  r.disabled
                    ? "bg-muted"
                    : active
                      ? "bg-gradient-to-t from-primary to-[#5b9bff] shadow-[0_0_0_3px_rgb(40_116_240/0.12)]"
                      : empty
                        ? "bg-primary/10 group-hover:bg-primary/25"
                        : "bg-primary/25 group-hover:bg-primary/50"
                )}
              />
            </span>
            <span className={cn("truncate text-[11px] font-medium", active ? "text-foreground" : r.disabled ? "text-muted-foreground/50" : "text-muted-foreground")}>{formatLabel(r.key)}</span>
          </button>
        )
      })}
    </div>
  )
}
