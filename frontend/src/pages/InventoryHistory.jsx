import { useCallback, useEffect, useState } from "react"
import { MotionConfig, motion } from "motion/react"
import { AlertTriangle, ArrowDownToLine, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, Factory, History, PackageCheck, Scale, TrendingUp } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, TableSkeleton } from "../components/feedback"
import ErrorBanner from "../components/ErrorBanner"
import { Button } from "../components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Skeleton } from "../components/ui/skeleton"
import FinishedProductCards from "../components/inventory/FinishedProductCards"
import BalanceSheetCard, { ShortfallDetail, balanceStatus } from "../components/inventory/BalanceSheetCard"
import { CountUp, HistoryHero, HistoryStat, MonthBars, Pill, Reveal, TabBar, TabPanel } from "../components/inventory/HistoryUI"
import { errorMessage, fmtQty } from "../lib/stock"
import { monthLabel, shiftMonth, shortDate } from "../lib/format"

/*
    Cumulative Inventory History.

    ONE number (total components, all items together) that only ever grows with received stock
    (plus a baseline, if one was ever recorded) and carries over from month to month.
    All business figures come from the server (GET /inventory/history, /history/balance, /history/products);
    only the charts are drawn in the browser.

    Layout: hero banner (cumulative total) -> three figures -> tabs card (balance sheet first)
    -> monthly receipts (one bar per month, Jan to Dec of the picked year) with the working for the picked month.
*/

const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
const monthOnly = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" })
const signed = (n) => `${n > 0 ? "+" : ""}${fmtQty(n)}`
const STAT_TONE = { success: "success", danger: "danger", warning: "warning" }

function FlowRow({ label, value, sign, hint, strong }) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 py-2.5 ${strong ? "bg-muted/50" : ""}`}>
      <div className="min-w-0">
        <p className={`text-sm ${strong ? "font-semibold" : ""}`}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={`text-sm tabular-nums ${strong ? "text-base font-semibold text-primary" : "font-semibold"}`}>
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

  // Year chart: always Jan to Dec of the picked month's year, so the bars fill the whole width.
  // Months with no data (before the first receipt, after the latest month) are shown faded and can't be opened.
  const year = month ? month.slice(0, 4) : ""
  const byMonth = new Map(months.map((m) => [m.month, m]))
  const yearRows = year
    ? Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, "0")}`
        const m = byMonth.get(key)
        return { key, value: m ? Number(m.received) : 0, disabled: !m }
      })
    : []
  const yearTotal = yearRows.reduce((sum, r) => sum + r.value, 0)
  const canPrevYear = !!first && year > first.slice(0, 4)
  const canNextYear = !!last && year < last.slice(0, 4)
  // jump to the same month in another year, kept inside the range that has data
  const goYear = (delta) => {
    let target = `${Number(year) + delta}-${month.slice(5)}`
    if (first && target < first) target = first
    if (last && target > last) target = last
    setMonth(target)
  }

  const diff = balance ? Number(balance.difference) : 0
  const st = balanceStatus(diff)
  const isShort = !!balance && diff < 0
  const activeTab = tab === "shortfall" && !isShort ? "balance" : tab

  // growth of the picked month relative to what was carried in (drawing only; figures come from the server)
  const opening = picked ? Number(picked.opening_cumulative) : 0
  const growth = picked && opening > 0 ? (Number(picked.received) / opening) * 100 : null
  const heroChips = picked
    ? [
        { key: "recv", icon: ArrowDownToLine, label: `${fmtQty(picked.received)} received in ${monthLabel(picked.month)}` },
        ...(growth !== null && growth > 0 ? [{ key: "growth", icon: TrendingUp, label: `+${growth.toFixed(growth >= 10 ? 0 : 1)}% on carried-in stock` }] : []),
      ]
    : []

  const tabs = [
    { key: "balance", label: "Balance sheet", icon: Scale },
    ...(isShort
      ? [{
          key: "shortfall",
          label: "Shortfall",
          icon: AlertTriangle,
          badge: <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive">{fmtQty(Math.abs(diff))}</span>,
        }]
      : []),
    {
      key: "products",
      label: "Finished products",
      icon: PackageCheck,
      badge: products && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{fmtQty(products.total_produced)}</span>
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
        <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
          <Button variant="ghost" size="sm" onClick={() => setMonth(last)}>
            Go to latest
          </Button>
        </motion.div>
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
    <MotionConfig reducedMotion="user">
      <PageHeader title="Inventory History" description="A running total of every component received. It carries over each month and never resets.">
        {monthControls}
      </PageHeader>

      {error && <ErrorBanner title="Couldn't load history" onRetry={loadSummary}>{error}</ErrorBanner>}

      {!error && loading && (
        <>
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:gap-4">
            {[0, 1, 2].map((i) => <HistoryStat key={i} index={i} label="Loading" icon={Boxes} loading />)}
          </div>
          <Card className="mt-4"><TableSkeleton rows={5} /></Card>
        </>
      )}

      {!error && !loading && summary && !summary.first_month && (
        <Reveal>
          <Card>
            <EmptyState icon={History} title="No history yet">
              Received stock will appear here once stock has been recorded.
            </EmptyState>
          </Card>
        </Reveal>
      )}

      {ready && (
        <div className="space-y-4">
          <HistoryHero
            icon={Boxes}
            label="Cumulative components"
            value={picked ? picked.cumulative : null}
            hint={isCurrent ? `As of today, ${shortDate(summary.today)}` : `End of ${monthLabel(month)}`}
            chips={heroChips}
          />

          <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
            <HistoryStat
              index={1}
              icon={ArrowDownToLine}
              tone="success"
              label={`Received in ${picked ? shortMonth(picked.month) : "month"}`}
              value={picked ? picked.received : null}
              hint={picked ? `${picked.receipt_count} ${picked.receipt_count === 1 ? "receipt" : "receipts"}` : undefined}
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
              badge={balance ? <Pill tone={st.tone} dot pulse={st.tone === "danger"}>{st.pill}</Pill> : undefined}
              hint={balance ? st.short : undefined}
            />
          </div>

          <Reveal delay={0.25}>
            <Card className="overflow-hidden">
              <TabBar tabs={tabs} value={activeTab} onChange={setTab} label="Inventory history sections" />
              <p className="border-b px-5 py-3 text-sm text-muted-foreground">{descriptions[activeTab]}</p>

              {detailError ? (
                <div className="p-5">
                  <ErrorBanner title="Couldn't load details" onRetry={loadDetail}>{detailError}</ErrorBanner>
                </div>
              ) : !balance || !products ? (
                <TableSkeleton rows={4} />
              ) : (
                <TabPanel id={activeTab}>
                  {activeTab === "balance" ? (
                    <BalanceSheetCard balance={balance} onSeeShortfall={() => setTab("shortfall")} />
                  ) : activeTab === "shortfall" ? (
                    <ShortfallDetail balance={balance} />
                  ) : (
                    <FinishedProductCards data={products} />
                  )}
                </TabPanel>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.35}>
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Received month by month</CardTitle>
                  <CardDescription>
                    {fmtQty(yearTotal)} received in {year}. Tap a bar to open that month.
                  </CardDescription>
                </div>
                <div className="inline-flex items-center overflow-hidden rounded-md border bg-card">
                  <Button variant="ghost" size="icon" className="rounded-none" aria-label="Previous year" disabled={!canPrevYear} onClick={() => goYear(-1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-16 border-x px-3 text-center text-sm font-medium tabular-nums">{year}</span>
                  <Button variant="ghost" size="icon" className="rounded-none" aria-label="Next year" disabled={!canNextYear} onClick={() => goYear(1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </CardHeader>

              <div className="grid lg:grid-cols-5">
                <div className="px-5 py-5 lg:col-span-3">
                  <MonthBars
                    rows={yearRows}
                    activeKey={month}
                    onSelect={setMonth}
                    formatValue={fmtQty}
                    formatLabel={monthOnly}
                    formatAria={monthLabel}
                  />
                </div>

                {picked && (
                  <motion.div
                    key={picked.month}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="border-t bg-muted/20 lg:col-span-2 lg:border-l lg:border-t-0"
                  >
                    <p className="px-5 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{monthLabel(picked.month)}</p>
                    <div className="py-2">
                      <FlowRow label="Carried in from before" value={fmtQty(picked.opening_cumulative)} />
                      {hasBaseline && <FlowRow label="Starting inventory" value={fmtQty(picked.baseline)} sign="+" hint="Baseline added this month" />}
                      <FlowRow label="Received" value={fmtQty(picked.received)} sign="+" hint={`${picked.receipt_count} ${picked.receipt_count === 1 ? "receipt" : "receipts"} posted`} />
                      <div className="mx-5 my-1 border-t border-dashed" />
                      <FlowRow strong label="Total at month end" value={<CountUp value={picked.cumulative} />} />
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </Reveal>
        </div>
      )}
    </MotionConfig>
  )
}
