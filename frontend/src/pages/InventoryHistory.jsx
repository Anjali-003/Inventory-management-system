import { useCallback, useEffect, useState } from "react"
import { MotionConfig, motion } from "motion/react"
import { ArrowDownToLine, Boxes, ChevronLeft, ChevronRight, Factory, History, Scale } from "lucide-react"
import api from "../api/api"
import { EmptyState, TableSkeleton } from "../components/feedback"
import ErrorBanner from "../components/ErrorBanner"
import FinishedProductCards from "../components/inventory/FinishedProductCards"
import BalanceSheetCard, { ShortfallDetail, balanceStatus } from "../components/inventory/BalanceSheetCard"
import { CfButton, CountUp, MonthBars, Panel, PanelHeader, Reveal, StatCard, TabBar, TabPanel } from "../components/inventory/HistoryUI"
import { errorMessage, fmtQty } from "../lib/stock"
import { monthLabel, shiftMonth, shortDate } from "../lib/format"

/*
    Cumulative Inventory History.

    ONE number (total components, all items together) that only ever grows with received stock
    (plus a baseline, if one was ever recorded) and carries over from month to month.
    All business figures come from the server (GET /inventory/history, /history/balance, /history/products);
    only the charts are drawn in the browser.

    Look: CircuitFlow (green, soft grey, compact type, DM Sans), switched on for this page only by the
    `cf-scope` wrapper (see index.css).
    Layout: header + month picker -> four stat cards -> reconciliation panel (balance sheet first)
    -> monthly receipts (one bar per month, Jan to Dec of the picked year) with the working for the picked month.
*/

const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
const monthOnly = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" })
const signed = (n) => `${n > 0 ? "+" : ""}${fmtQty(n)}`
const STAT_TONE = { success: "green", danger: "red", warning: "amber" }

function FlowRow({ label, value, sign, hint, strong }) {
  return (
    <div className={`flex min-h-[46px] items-center justify-between gap-4 border-b px-[18px] py-2 last:border-b-0 ${strong ? "bg-cf-head" : ""}`}>
      <div className="min-w-0">
        <p className={`text-xs ${strong ? "font-bold" : "font-medium"}`}>{label}</p>
        {hint && <p className="mt-0.5 text-[10px] text-cf-faint">{hint}</p>}
      </div>
      <p className={`text-xs tabular-nums ${strong ? "text-base font-bold tracking-tight text-primary" : "font-semibold"}`}>
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
  const receivedDetail = picked
    ? `${picked.receipt_count} ${picked.receipt_count === 1 ? "receipt" : "receipts"}${growth !== null && growth > 0 ? ` · ↑ ${growth.toFixed(growth >= 10 ? 0 : 1)}% on carried-in` : ""}`
    : undefined

  const tabs = [
    { key: "balance", label: "Balance sheet" },
    ...(isShort
      ? [{
          key: "shortfall",
          label: "Shortfall",
          badge: <span className="rounded-full bg-cf-red-soft px-1.5 py-px text-[10px] font-bold tabular-nums text-destructive">{fmtQty(Math.abs(diff))}</span>,
        }]
      : []),
    {
      key: "products",
      label: "Finished products",
      badge: products && (
        <span className="rounded-full bg-card px-1.5 py-px text-[10px] font-bold tabular-nums text-muted-foreground ring-1 ring-border">{fmtQty(products.total_produced)}</span>
      ),
    },
  ]

  const descriptions = {
    balance: "Is the stock on hand what the records say it should be?",
    shortfall: "Which components are missing, and where they went.",
    products: "Components consumed by products that passed quality control.",
  }

  const iconBtn = "grid size-9 place-items-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-40"
  const monthControls = ready && (
    <div className="flex items-center gap-2">
      {!isCurrent && (
        <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
          <CfButton variant="ghost" onClick={() => setMonth(last)}>Go to latest</CfButton>
        </motion.div>
      )}
      <div className="inline-flex items-center overflow-hidden rounded-[7px] border border-cf-line-strong bg-card">
        <button type="button" className={iconBtn} aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(shiftMonth(`${month}-01`, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <select
          aria-label="Select month"
          className="h-9 min-w-36 cursor-pointer border-x bg-transparent pl-3 pr-8 text-xs font-semibold outline-none focus-visible:bg-accent/60"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {[...months].reverse().map((m) => (
            <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
          ))}
        </select>
        <button type="button" className={iconBtn} aria-label="Next month" disabled={!canNext} onClick={() => setMonth(shiftMonth(`${month}-01`, 1))}>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )

  return (
    <MotionConfig reducedMotion="user">
      <div className="cf-scope">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[1px] text-primary">Inventory</p>
            <h1 className="text-[25px] font-bold leading-tight tracking-[-0.6px]">Inventory History</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">A running total of every component received. It carries over each month and never resets.</p>
          </div>
          {monthControls}
        </header>

        {error && <ErrorBanner title="Couldn't load history" onRetry={loadSummary}>{error}</ErrorBanner>}

        {!error && loading && (
          <div className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <StatCard key={i} index={i} label="Loading" icon={Boxes} loading />)}
            </div>
            <Panel><TableSkeleton rows={5} /></Panel>
          </div>
        )}

        {!error && !loading && summary && !summary.first_month && (
          <Reveal>
            <Panel>
              <EmptyState icon={History} title="No history yet">
                Received stock will appear here once stock has been recorded.
              </EmptyState>
            </Panel>
          </Reveal>
        )}

        {ready && (
          <div className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                index={0}
                icon={Boxes}
                tone="green"
                label="Cumulative components"
                value={picked ? picked.cumulative : null}
                detail={isCurrent ? `As of today, ${shortDate(summary.today)}` : `End of ${monthLabel(month)}`}
              />
              <StatCard
                index={1}
                icon={ArrowDownToLine}
                tone="blue"
                label={`Received in ${picked ? shortMonth(picked.month) : "month"}`}
                value={picked ? picked.received : null}
                detail={receivedDetail}
              />
              <StatCard
                index={2}
                icon={Factory}
                tone="violet"
                label="Used by finished products"
                value={balance ? balance.components_used : null}
                loading={!balance && !detailError}
                detail="All time"
              />
              <StatCard
                index={3}
                icon={Scale}
                tone={STAT_TONE[st.tone]}
                label="Stock difference"
                value={balance ? diff : null}
                format={signed}
                loading={!balance && !detailError}
                detail={balance ? st.short : undefined}
              />
            </div>

            <Reveal delay={0.2}>
              <Panel>
                <PanelHeader title="Stock reconciliation" subtitle={descriptions[activeTab]}>
                  <TabBar tabs={tabs} value={activeTab} onChange={setTab} label="Inventory history sections" />
                </PanelHeader>

                {detailError ? (
                  <div className="p-[18px]">
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
              </Panel>
            </Reveal>

            <Reveal delay={0.3}>
              <Panel>
                <PanelHeader title="Received month by month" subtitle={`${fmtQty(yearTotal)} received in ${year}. Click a bar to open that month.`}>
                  <div className="inline-flex items-center overflow-hidden rounded-[7px] border border-cf-line-strong bg-card">
                    <button type="button" className={iconBtn} aria-label="Previous year" disabled={!canPrevYear} onClick={() => goYear(-1)}>
                      <ChevronLeft className="size-4" />
                    </button>
                    <span className="min-w-16 border-x px-3 text-center text-xs font-semibold leading-9 tabular-nums">{year}</span>
                    <button type="button" className={iconBtn} aria-label="Next year" disabled={!canNextYear} onClick={() => goYear(1)}>
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </PanelHeader>

                <div className="grid lg:grid-cols-5">
                  <div className="px-[18px] py-5 lg:col-span-3">
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
                      className="border-t bg-cf-head/60 lg:col-span-2 lg:border-l lg:border-t-0"
                    >
                      <p className="px-[18px] pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.6px] text-cf-faint">{monthLabel(picked.month)}</p>
                      <div className="py-1">
                        <FlowRow label="Carried in from before" value={fmtQty(picked.opening_cumulative)} />
                        {hasBaseline && <FlowRow label="Starting inventory" value={fmtQty(picked.baseline)} sign="+" hint="Baseline added this month" />}
                        <FlowRow label="Received" value={fmtQty(picked.received)} sign="+" hint={`${picked.receipt_count} ${picked.receipt_count === 1 ? "receipt" : "receipts"} posted`} />
                        <FlowRow strong label="Total at month end" value={<CountUp value={picked.cumulative} />} />
                      </div>
                    </motion.div>
                  )}
                </div>
              </Panel>
            </Reveal>
          </div>
        )}
      </div>
    </MotionConfig>
  )
}
