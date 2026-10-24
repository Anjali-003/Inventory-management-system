import { useMemo, useState } from "react"
import { ArrowUpRight, ChevronRight, PieChart, TrendingUp } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const number = (value) => Math.max(0, Number(value) || 0)
const chartCardClass = "min-w-0 overflow-hidden rounded-2xl border-[#E3E6EB] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]"

function ChartHeader({ title, description, icon: Icon }) {
  return (
    <CardHeader className="flex-row items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-100 via-teal-50 to-blue-100 text-primary ring-1 ring-inset ring-emerald-800/5">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="mt-1">{description}</CardDescription>}
      </div>
    </CardHeader>
  )
}

/** A clickable SVG doughnut. Each segment and legend item opens its relevant workspace. */
export function InteractiveDonutChart({ title, description, items = [], loading = false, emptyLabel = "No records to chart yet." }) {
  const navigate = useNavigate()
  const segments = useMemo(() => {
    const valid = items.map((item, index) => ({ ...item, value: number(item.value), key: item.key || `${item.label}-${index}` }))
    const total = valid.reduce((sum, item) => sum + item.value, 0)
    let offset = 0
    return valid.map((item) => {
      const length = total > 0 ? (item.value / total) * 2 * Math.PI * 56 : 0
      const segment = { ...item, total, percentage: total > 0 ? Math.round((item.value / total) * 100) : 0, dashLength: length, dashOffset: offset }
      offset += length
      return segment
    })
  }, [items])
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  const canOpen = (segment) => Boolean(segment.to)
  const openSegment = (segment) => {
    if (segment.to) navigate(segment.to)
  }
  const openOnKey = (event, segment) => {
    if ((event.key === "Enter" || event.key === " ") && segment.to) {
      event.preventDefault()
      openSegment(segment)
    }
  }

  return (
    <Card className={chartCardClass}>
      <ChartHeader title={title} description={description} icon={PieChart} />
      {loading ? (
        <div className="grid animate-pulse gap-4 p-5 sm:grid-cols-[180px_1fr]">
          <div className="mx-auto size-40 rounded-full bg-muted" />
          <div className="space-y-3">{[0, 1, 2, 3].map((row) => <div key={row} className="h-9 rounded-lg bg-muted" />)}</div>
        </div>
      ) : (
        <div className="grid items-center gap-4 px-4 pb-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:px-5">
          <div className="relative mx-auto w-full max-w-[180px]">
            <svg viewBox="0 0 160 160" className="w-full overflow-visible" role="group" aria-label={`${title}: ${total} total records`}>
              <circle cx="80" cy="80" r="56" fill="none" stroke="#edf1ef" strokeWidth="22" />
              {segments.filter((segment) => segment.value > 0).map((segment) => (
                <circle
                  key={segment.key}
                  cx="80"
                  cy="80"
                  r="56"
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="22"
                  strokeLinecap="butt"
                  strokeDasharray={`${segment.dashLength} ${2 * Math.PI * 56 - segment.dashLength}`}
                  strokeDashoffset={-segment.dashOffset}
                  transform="rotate(-90 80 80)"
                  className={canOpen(segment) ? "cursor-pointer outline-none transition-[stroke-width,opacity] hover:opacity-80 focus-visible:opacity-80" : ""}
                  style={{ pointerEvents: canOpen(segment) ? "stroke" : "none" }}
                  tabIndex={canOpen(segment) ? 0 : undefined}
                  role={canOpen(segment) ? "button" : undefined}
                  aria-label={`${segment.label}: ${segment.value} (${segment.percentage}%). Open related records.`}
                  onClick={() => openSegment(segment)}
                  onKeyDown={(event) => openOnKey(event, segment)}
                >
                  <title>{`${segment.label}: ${segment.value} (${segment.percentage}%)`}</title>
                </circle>
              ))}
              <text x="80" y="76" textAnchor="middle" className="fill-foreground" fontSize="25" fontWeight="700">{total.toLocaleString()}</text>
              <text x="80" y="96" textAnchor="middle" className="fill-muted-foreground" fontSize="10">TOTAL BATCHES</text>
            </svg>
          </div>
          <div className="min-w-0 space-y-1.5">
            {segments.map((segment) => (
              <button
                key={segment.key}
                type="button"
                disabled={!segment.to || segment.value === 0}
                onClick={() => openSegment(segment)}
                className="group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-80"
                title={segment.to ? `Open ${segment.label}` : segment.label}
              >
                <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{segment.label}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{segment.value.toLocaleString()}</span>
                  <span className="block text-[10px] text-muted-foreground">{segment.percentage}%</span>
                </span>
                {segment.to && <ArrowUpRight className="size-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-primary" aria-hidden="true" />}
              </button>
            ))}
            {total === 0 && <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</p>}
            <p className="pt-1 text-[11px] text-muted-foreground">Select a category to open its workspace.</p>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Responsive, keyboard-accessible bar chart with 7/30-day filters and clickable day drill-down. */
export function InteractiveBarChart({ title, description, dataByPeriod, series, loading = false, emptyLabel = "No dated activity is recorded for this period." }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState(7)
  const [selection, setSelection] = useState({ period: 7, index: null })
  const points = dataByPeriod?.[period] || []
  const maxValue = Math.max(1, ...points.flatMap((point) => series.map((item) => number(point.values?.[item.key]))))
  const selectedIndex = selection.period === period ? selection.index : null
  const selectedPoint = selectedIndex == null ? null : points[selectedIndex]
  const totalActivity = points.reduce((sum, point) => sum + series.reduce((inner, item) => inner + number(point.values?.[item.key]), 0), 0)

  const selectPoint = (index) => setSelection((current) => ({
    period,
    index: current.period === period && current.index === index ? null : index,
  }))

  return (
    <Card className={chartCardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 pr-4 sm:pr-5">
        <div className="min-w-0 flex-1">
          <ChartHeader title={title} description={description} icon={TrendingUp} />
        </div>
        <div className="mt-5 flex shrink-0 rounded-xl border border-[#E3E6EB] bg-slate-50 p-1" aria-label="Chart date range">
          {[7, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriod(days)}
              aria-pressed={period === days}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${period === days ? "bg-gradient-to-br from-emerald-700 to-teal-800 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-primary"}`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 p-5">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-8 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <div className="px-4 pb-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Activity in selected period</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{totalActivity.toLocaleString()}</p>
            </div>
            <p className="text-xs text-muted-foreground">Select a date bar for details</p>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className={`flex h-[196px] items-end gap-1 border-b border-l border-slate-200 px-2 pt-2 ${period === 30 ? "min-w-[780px]" : "min-w-0"}`}>
              {points.map((point, index) => {
                const selected = selectedIndex === index
                const pointTotal = series.reduce((sum, item) => sum + number(point.values?.[item.key]), 0)
                const accessibleValues = series.map((item) => `${item.label}: ${number(point.values?.[item.key])}`).join(", ")
                return (
                  <button
                    key={point.key || point.isoDate || point.label}
                    type="button"
                    onClick={() => selectPoint(index)}
                    aria-pressed={selected}
                    aria-label={`${point.fullLabel || point.label}. ${accessibleValues}. Show records for this date.`}
                    className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-md px-0.5 pt-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 ${selected ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="flex h-[145px] w-full items-end justify-center gap-[3px]">
                      {series.map((item) => {
                        const value = number(point.values?.[item.key])
                        const height = value > 0 ? Math.max(3, (value / maxValue) * 100) : 0
                        return (
                          <span
                            key={item.key}
                            className="min-w-[3px] max-w-5 flex-1 rounded-t-[3px] transition-[height,opacity] group-hover:opacity-85"
                            style={{ height: `${height}%`, backgroundColor: item.color }}
                            title={`${item.label}: ${value}`}
                          />
                        )
                      })}
                    </span>
                    <span className={`h-7 max-w-full truncate text-[10px] leading-6 tabular-nums ${selected ? "font-bold text-primary" : "text-muted-foreground"}`}>
                      {point.showLabel === false ? "" : point.label}
                    </span>
                    <span className="sr-only">{pointTotal} total events</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {series.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>

          {selectedPoint && (
            <div className="mt-4 overflow-hidden rounded-xl border border-[#E3E6EB] bg-gradient-to-br from-white via-white to-emerald-50/50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7eeea] px-3 py-3 sm:px-4">
                <div>
                  <p className="text-sm font-bold">{selectedPoint.fullLabel || selectedPoint.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {series.map((item) => `${item.label}: ${number(selectedPoint.values?.[item.key])}`).join(" · ")}
                  </p>
                </div>
                <button type="button" onClick={() => setSelection({ period, index: null })} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-cf-green-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">Close</button>
              </div>
              {selectedPoint.details?.length ? (
                <div className="divide-y divide-[#e7eeea]">
                  {selectedPoint.details.slice(0, 6).map((detail, index) => (
                    <button
                      key={detail.id || `${detail.title}-${index}`}
                      type="button"
                      onClick={() => detail.to && navigate(detail.to)}
                      disabled={!detail.to}
                      className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-emerald-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-default sm:px-4"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-100 to-blue-100 text-primary">
                        <span className="size-2 rounded-full" style={{ backgroundColor: detail.color || "#0f6d55" }} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{detail.title}</span>
                        {detail.subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail.subtitle}</span>}
                      </span>
                      {detail.to && <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                  {selectedPoint.details.length > 6 && <p className="px-4 py-2 text-xs text-muted-foreground">Showing 6 of {selectedPoint.details.length} events. Open the related page to see all records.</p>}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-muted-foreground">{emptyLabel}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
