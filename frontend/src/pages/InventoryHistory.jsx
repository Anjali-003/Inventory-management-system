import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, History } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState } from "../components/feedback"
import ErrorBanner from "../components/ErrorBanner"
import { Button } from "../components/ui/button"
import FinishedProductCards from "../components/inventory/FinishedProductCards"
import BalanceSheetCard from "../components/inventory/BalanceSheetCard"
import { Panel, PanelSkeleton, Pill, Sparkline } from "../components/inventory/HistoryUI"
import { errorMessage, fmtQty } from "../lib/stock"
import { monthLabel, shiftMonth, shortDate } from "../lib/format"

/*
    Cumulative Inventory History.

    ONE number (total components, all items together) that only ever grows with received stock
    (plus a baseline, if one was ever recorded) and carries over from month to month.
    All business figures come from the server (GET /inventory/history); only the chart is drawn in the browser.
*/

const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })

function FlowRow({ label, value, sign, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className="text-base font-semibold tabular-nums">
        {sign && <span className="mr-1 font-normal text-muted-foreground">{sign}</span>}
        {value}
      </p>
    </div>
  )
}

export default function InventoryHistory() {
  const [summary, setSummary] = useState(null)
  const [month, setMonth] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadSummary = useCallback(() => {
    setLoading(true)
    return api
      .get("/inventory/history")
      .then((r) => {
        setSummary(r.data)
        setError("")
        setMonth((m) => m || r.data.current_month)
      })
      .catch((e) => setError(errorMessage(e, "Could not load inventory history. Check that the server is running.")))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const months = summary?.months ?? []
  const picked = months.find((m) => m.month === month)
  const first = summary?.first_month
  const last = summary?.current_month
  const canPrev = !!first && month > first
  const canNext = !!last && month < last
  const isCurrent = month === last
  const hasBaseline = !!picked && Number(picked.baseline) > 0 // 0 when starting from scratch, so the row stays hidden
  const ready = !error && !loading && !!summary?.first_month

  const monthControls = ready && (
    <div className="flex items-center gap-2">
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => setMonth(last)}>
          Go to latest
        </Button>
      )}
      <div className="inline-flex items-center overflow-hidden rounded-lg border bg-card shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
        <Button variant="ghost" size="icon-lg" className="rounded-none" aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(shiftMonth(`${month}-01`, -1))}>
          <ChevronLeft />
        </Button>
        <select
          aria-label="Select month"
          className="h-9 min-w-44 cursor-pointer border-x bg-transparent pl-3 pr-9 text-sm font-medium outline-none focus-visible:bg-accent/50"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {[...months].reverse().map((m) => (
            <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
          ))}
        </select>
        <Button variant="ghost" size="icon-lg" className="rounded-none" aria-label="Next month" disabled={!canNext} onClick={() => setMonth(shiftMonth(`${month}-01`, 1))}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory History"
        description="A running total of every component received. It carries over each month and never resets."
      >
        {monthControls}
      </PageHeader>

      {error && <ErrorBanner title="Couldn't load history" onRetry={loadSummary}>{error}</ErrorBanner>}

      {!error && loading && (
        <div className="grid gap-5 lg:grid-cols-12">
          <PanelSkeleton rows={4} className="lg:col-span-7" />
          <PanelSkeleton rows={3} className="lg:col-span-5" />
        </div>
      )}

      {!error && !loading && summary && !summary.first_month && (
        <Panel>
          <EmptyState icon={History} title="No history yet">
            Received stock will appear here once stock has been recorded.
          </EmptyState>
        </Panel>
      )}

      {ready && (
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-7">
              <div className="px-6 pb-5 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Cumulative components</p>
                  <Pill tone={isCurrent ? "success" : "neutral"} dot>
                    {isCurrent ? `As of today, ${shortDate(summary.today)}` : `End of ${month ? monthLabel(month) : "-"}`}
                  </Pill>
                </div>
                <p className="mt-3 text-[44px] font-semibold leading-none tracking-tight tabular-nums">
                  {picked ? fmtQty(picked.cumulative) : "-"}
                </p>
                {!isCurrent && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Latest total <span className="font-medium tabular-nums text-foreground">{fmtQty(summary.cumulative_total)}</span>
                  </p>
                )}
                <div className="mt-6">
                  <Sparkline
                    points={months.slice(-12).map((m) => ({ key: m.month, value: Number(m.cumulative) }))}
                    activeKey={month}
                    onSelect={setMonth}
                    formatValue={fmtQty}
                    formatLabel={shortMonth}
                  />
                </div>
              </div>
            </Panel>

            <Panel
              className="lg:col-span-5"
              title="Month movement"
              description={`${picked ? monthLabel(picked.month) : ""}: what carried in and what arrived`}
            >
              {picked && (
                <div className="divide-y">
                  <FlowRow label="Carried in from before" value={fmtQty(picked.opening_cumulative)} />
                  {hasBaseline && <FlowRow label="Starting inventory" value={fmtQty(picked.baseline)} sign="+" hint="Baseline added this month" />}
                  <FlowRow label="Received this month" value={fmtQty(picked.received)} sign="+" />
                </div>
              )}
            </Panel>
          </div>

          <FinishedProductCards />

          <BalanceSheetCard />
        </div>
      )}
    </div>
  )
}
