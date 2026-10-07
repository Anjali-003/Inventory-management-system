import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, History } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import StatStrip from "../components/StatStrip"
import { EmptyState, TableSkeleton } from "../components/feedback"
import ErrorBanner from "../components/ErrorBanner"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import FinishedProductCards from "../components/inventory/FinishedProductCards"
import BalanceSheetCard from "../components/inventory/BalanceSheetCard"
import { selectClass } from "../components/FormField"
import { cn } from "../lib/utils"
import { errorMessage, fmtQty } from "../lib/stock"
import { monthLabel, shiftMonth, shortDate } from "../lib/format"

/*
    Cumulative Inventory History.

    ONE number (total components, all items together) that only ever grows with received stock
    (plus a baseline, if one was ever recorded) and carries over from month to month.
    All figures come from GET /inventory/history; nothing is calculated in the browser.
*/

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
  const hasBaseline = !!picked && Number(picked.baseline) > 0 // 0 when starting from scratch, so the card stays hidden

  return (
    <div>
      <PageHeader
        title="Inventory History"
        description="One running total of all components: everything received so far. It carries over every month and never resets."
      />

      {error && <ErrorBanner title="Couldn't load history" onRetry={loadSummary}>{error}</ErrorBanner>}

      {!error && loading && <Card><TableSkeleton rows={6} /></Card>}

      {!error && !loading && summary && !summary.first_month && (
        <Card>
          <EmptyState icon={History} title="No history yet">
            Received stock will appear here once stock has been recorded.
          </EmptyState>
        </Card>
      )}

      {!error && !loading && summary?.first_month && (
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {isCurrent
                    ? `Cumulative components · as of today (${shortDate(summary.today)})`
                    : `Cumulative components · end of ${month ? monthLabel(month) : "—"}`}
                </p>
                <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                  {picked ? fmtQty(picked.cumulative) : "—"}
                </p>
                {!isCurrent && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Latest total (as of today): <span className="font-medium tabular-nums text-foreground">{fmtQty(summary.cumulative_total)}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(shiftMonth(`${month}-01`, -1))}>
                  <ChevronLeft />
                </Button>
                <select
                  aria-label="Select month"
                  className={cn(selectClass, "min-w-44")}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  {[...months].reverse().map((m) => (
                    <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
                  ))}
                </select>
                <Button variant="outline" size="icon" aria-label="Next month" disabled={!canNext} onClick={() => setMonth(shiftMonth(`${month}-01`, 1))}>
                  <ChevronRight />
                </Button>
              </div>
            </div>

            {picked && (
              <StatStrip
                layoutId="history-stat"
                cols={hasBaseline ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}
                items={[
                  { key: "open", label: "Carried in from before", value: fmtQty(picked.opening_cumulative), tone: "neutral" },
                  ...(hasBaseline
                    ? [{ key: "base", label: "Starting inventory", value: fmtQty(picked.baseline), tone: "info", hint: "Baseline added this month" }]
                    : []),
                  { key: "recv", label: "Received", value: fmtQty(picked.received), tone: "success" },
                ]}
              />
            )}
          </Card>

          <FinishedProductCards />

          <BalanceSheetCard />
        </div>
      )}
    </div>
  )
}
