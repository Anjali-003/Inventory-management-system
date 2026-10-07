import { useCallback, useEffect, useState } from "react"
import { ArrowDownToLine, Boxes, ChevronLeft, ChevronRight, Factory, History, Scale } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, TableSkeleton } from "../components/feedback"
import ErrorBanner from "../components/ErrorBanner"
import { Button } from "../components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import FinishedProductCards from "../components/inventory/FinishedProductCards"
import BalanceSheetCard, { ShortfallDetail, balanceStatus } from "../components/inventory/BalanceSheetCard"
import { HistoryStat, Sparkline, TabBar } from "../components/inventory/HistoryUI"
import { errorMessage, fmtQty } from "../lib/stock"
import { monthLabel, shiftMonth, shortDate } from "../lib/format"

/*
    Cumulative Inventory History.

    ONE number (total components, all items together) that only ever grows with received stock
    (plus a baseline, if one was ever recorded) and carries over from month to month.
    All business figures come from the server (GET /inventory/history, /history/balance, /history/products);
    only the chart is drawn in the browser.

    Layout follows the Dashboard: a row of figures, then the full-width tabs card (balance sheet first), then the growth card.
*/

const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
const signed = (n) => `${n > 0 ? "+" : ""}${fmtQty(n)}`
const STAT_TONE = { success: "success", danger: "danger", warning: "warning" }

function FlowRow({ label, value, sign, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className="text-sm font-semibold tabular-nums">
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

  const [balance, setBalance] = useState(null)
  const [products, setProducts] = useState(null)
  const [detailError, setDetailError] = useState("")
  const [tab, setTab] = useState("balance")

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

  const loadDetail = useCallback(() => {
    setDetailError("")
    return Promise.all([api.get("/inventory/history/balance"), api.get("/inventory/history/products")])
      .then(([b, p]) => {
        setBalance(b.data)
        setProducts(p.data)
      })
      .catch((e) => setDetailError(errorMessage(e, "Could not load the balance sheet and finished products.")))
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadDetail() }, [loadDetail])

  const months = summary?.months ?? []
  const picked = months.find((m) => m.month === month)
  const first = summary?.first_month
  const last = summary?.current_month
  const canPrev = !!first && month > first
  const canNext = !!last && month < last
  const isCurrent = month === last
  const hasBaseline = !!picked && Number(picked.baseline) > 0 // 0 when starting from scratch, so the row stays hidden
  const ready = !error && !loading && !!summary?.first_month

  const diff = balance ? Number(balance.difference) : 0
  const st = balanceStatus(diff)
  const isShort = !!balance && diff < 0
  const activeTab = tab === "shortfall" && !isShort ? "balance" : tab

  const tabs = [
    { key: "balance", label: "Balance sheet" },
    ...(isShort
      ? [{
          key: "shortfall",
          label: "Shortfall",
          badge: <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive">{fmtQty(Math.abs(diff))}</span>,
        }]
      : []),
    {
      key: "products",
      label: "Finished products",
      badge: products && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{products.products.length}</span>
      ),
    },
  ]

  const descriptions = {
    balance: "Is the stock on hand what the records say it should be?",
    shortfall: "Which components are missing, and where they went.",
    products: "Components consumed by products that passed quality control.",
  }

  const monthControls = ready && (
    <div className="flex items-center gap-2">
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => setMonth(last)}>
          Go to latest
        </Button>
      )}
      <div className="inline-flex items-center overflow-hidden rounded-md border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <Button variant="ghost" size="icon-lg" className="rounded-none" aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(shiftMonth(`${month}-01`, -1))}>
          <ChevronLeft />
        </Button>
        <select
          aria-label="Select month"
          className="h-9 min-w-40 cursor-pointer border-x bg-transparent pl-3 pr-9 text-sm font-medium outline-none focus-visible:bg-accent/50"
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
    <>
      <PageHeader title="Inventory History" description="A running total of every component received. It carries over each month and never resets.">
        {monthControls}
      </PageHeader>

      {error && <ErrorBanner title="Couldn't load history" onRetry={loadSummary}>{error}</ErrorBanner>}

      {!error && loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[0, 1, 2, 3].map((i) => <HistoryStat key={i} index={i} label="Loading" icon={Boxes} loading />)}
          </div>
          <Card className="mt-4"><TableSkeleton rows={5} /></Card>
        </>
      )}

      {!error && !loading && summary && !summary.first_month && (
        <Card>
          <EmptyState icon={History} title="No history yet">
            Received stock will appear here once stock has been recorded.
          </EmptyState>
        </Card>
      )}

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <HistoryStat
              index={0}
              icon={Boxes}
              label="Cumulative components"
              value={picked ? picked.cumulative : null}
              hint={isCurrent ? `As of today, ${shortDate(summary.today)}` : `End of ${monthLabel(month)}`}
            />
            <HistoryStat
              index={1}
              icon={ArrowDownToLine}
              tone="success"
              label="Received"
              value={picked ? picked.received : null}
              hint={picked ? monthLabel(picked.month) : undefined}
            />
            <HistoryStat
              index={2}
              icon={Factory}
              label="Used by finished products"
              value={balance ? balance.components_used : null}
              loading={!balance && !detailError}
              hint="All time"
            />
            <HistoryStat
              index={3}
              icon={Scale}
              tone={STAT_TONE[st.tone]}
              label="Stock difference"
              value={balance ? diff : null}
              format={signed}
              loading={!balance && !detailError}
              hint={balance ? st.short : undefined}
            />
          </div>

          <Card className="mt-4 overflow-hidden">
            <TabBar tabs={tabs} value={activeTab} onChange={setTab} label="Inventory history sections" />
            <p className="border-b px-5 py-3 text-sm text-muted-foreground">{descriptions[activeTab]}</p>

            <div role="tabpanel" id={`history-panel-${activeTab}`} aria-labelledby={`history-tab-${activeTab}`}>
              {detailError ? (
                <div className="p-5">
                  <ErrorBanner title="Couldn't load details" onRetry={loadDetail}>{detailError}</ErrorBanner>
                </div>
              ) : !balance || !products ? (
                <TableSkeleton rows={4} />
              ) : activeTab === "balance" ? (
                <BalanceSheetCard balance={balance} onSeeShortfall={() => setTab("shortfall")} />
              ) : activeTab === "shortfall" ? (
                <ShortfallDetail balance={balance} />
              ) : (
                <FinishedProductCards data={products} />
              )}
            </div>
          </Card>

          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Cumulative growth</CardTitle>
                <CardDescription>Total received, month by month</CardDescription>
              </div>
            </CardHeader>

            <div className={months.length > 1 ? "grid lg:grid-cols-5" : ""}>
              {months.length > 1 && (
                <div className="px-5 py-4 lg:col-span-3">
                  <Sparkline
                    points={months.slice(-12).map((m) => ({ key: m.month, value: Number(m.cumulative) }))}
                    activeKey={month}
                    onSelect={setMonth}
                    formatValue={fmtQty}
                    formatLabel={shortMonth}
                  />
                </div>
              )}

              {picked && (
                <div className={months.length > 1 ? "border-t lg:col-span-2 lg:border-l lg:border-t-0" : ""}>
                  <p className="px-5 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{monthLabel(picked.month)}</p>
                  <div className="pb-1">
                    <FlowRow label="Carried in from before" value={fmtQty(picked.opening_cumulative)} />
                    {hasBaseline && <FlowRow label="Starting inventory" value={fmtQty(picked.baseline)} sign="+" hint="Baseline added this month" />}
                    <FlowRow label="Received" value={fmtQty(picked.received)} sign="+" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}
