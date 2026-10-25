import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, CalendarClock, ChevronRight, IndianRupee, PackageX, Route } from "lucide-react"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { useGetAttendanceQuery } from "@/features/attendance/attendanceApi"
import { useGetProductStockQuery } from "@/features/product-stock/productStockApi"
import { useGetExtraMaterialsQuery } from "@/features/material-requests/extraMaterialsApi"
import { useGetMonthlyReportQuery, useGetStockBalanceQuery, useGetTrackedOrdersQuery } from "@/features/order-tracker/orderTrackerApi"
import RecentActivity from "@/features/activity/RecentActivity"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ROLE_LABELS } from "@/lib/permissions"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Greeting, StatRow, useDrill } from "../DashboardKit"
import { isLowStock, stockRow } from "../rows"

/*
  The CEO's page. Everything a CEO asks, answered here, each answer one click away from the list behind it:
    How much did we sell?            Are orders stuck, and with whom?       Are we late for any customer?
    Is any stock missing?            Who is holding the work right now?     How good are suppliers and QC?
    What stock is short / ready?     Is everyone at work today?             What happened just now?
*/
const EMPTY = []
const STUCK_DAYS = 3
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`)
const ATT = [["Present", "PRESENT", "text-success"], ["Absent", "ABSENT", "text-destructive"], ["Half day", "HALF_DAY", "text-warning"], ["On leave", "LEAVE", "text-primary"]]
// every department's own screen, read here without logging in as that role (see Dashboard.jsx DEPT_VIEWS)
const DEPARTMENTS = [["marketing", "Marketing"], ["operations", "Operations"], ["purchase", "Purchase"], ["iqc", "IQC"], ["store", "Store"], ["production", "Production"], ["quality", "QC & Finished Goods"], ["hr", "HR"]]

function Panel({ title, description, to, toLabel, children, className }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="items-center">
        <div><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
        {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">{toLabel}<ChevronRight className="size-3.5" /></Link>}
      </CardHeader>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  )
}

function Line({ label, value, bad, sub, to }) {
  const body = (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">{label}{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
      <span className={cn("shrink-0 font-semibold tabular-nums", bad && "text-destructive")}>{value}</span>
    </div>
  )
  return to ? <Link to={to} className="-mx-2 block rounded-md px-2 hover:bg-muted/60">{body}</Link> : body
}

function OrderList({ rows, empty, late }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {rows.slice(0, 6).map((o) => (
        <li key={o.id}>
          <Link to={`/order-tracker?order=${o.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tabular-nums">{o.orderNumber}</span>
              <span className="block truncate text-xs text-muted-foreground">{o.stage} · {ROLE_LABELS[o.waitingFor] || o.waitingFor}</span>
            </span>
            <Badge variant="danger">{late ? `${o.lateDays} d late` : `${o.daysWaiting} d`}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function SuperAdminView() {
  const drill = useDrill()
  const [now] = useState(() => new Date())
  const thisMonth = monthKey(now)
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const today = useMemo(() => { const d = new Date(now); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }, [now])

  const tracker = useGetTrackedOrdersQuery()
  const report = useGetMonthlyReportQuery(thisMonth)
  const prev = useGetMonthlyReportQuery(lastMonth)
  const balance = useGetStockBalanceQuery()
  const inventory = useGetInventoryQuery("active")
  const products = useGetProductStockQuery()
  const extras = useGetExtraMaterialsQuery()
  const { data: att = null } = useGetAttendanceQuery(today)

  const d = useMemo(() => {
    const orders = tracker.data ?? EMPTY
    const open = orders.filter((o) => !o.done)
    const stuck = open.filter((o) => o.daysWaiting >= STUCK_DAYS).sort((a, b) => b.daysWaiting - a.daysWaiting)
    const late = open
      .filter((o) => o.promisedDate && String(o.promisedDate).slice(0, 10) < today)
      .map((o) => ({ ...o, lateDays: Math.floor((now - new Date(o.promisedDate)) / 86400000) }))
      .sort((a, b) => b.lateDays - a.lateDays)
    // who is holding the work: open orders per role, with the longest wait
    const byRole = new Map()
    for (const o of open) {
      const r = byRole.get(o.waitingFor) || { role: o.waitingFor, count: 0, oldest: 0 }
      r.count++
      r.oldest = Math.max(r.oldest, o.daysWaiting || 0)
      byRole.set(o.waitingFor, r)
    }
    const inv = inventory.data ?? EMPTY
    const out = inv.filter((i) => Number(i.quantity_on_hand) <= 0)
    const low = inv.filter(isLowStock)
    const ready = (products.data ?? EMPTY).filter((p) => p.onHand > 0)
    const extraRows = extras.data ?? EMPTY
    return {
      open, stuck, late,
      byRole: [...byRole.values()].sort((a, b) => b.count - a.count),
      out, low, ready,
      readyPieces: ready.reduce((sum, p) => sum + p.onHand, 0),
      extraPending: extraRows.filter((e) => e.status === "PENDING").length,
      extraThisMonth: extraRows.filter((e) => e.status === "ISSUED" && String(e.decidedAt || "").slice(0, 7) === thisMonth).length,
    }
  }, [tracker.data, inventory.data, products.data, extras.data, today, now, thisMonth])

  const r = report.data
  const p = prev.data
  const unexplained = balance.data ? Number(balance.data.shortfall?.unexplained || 0) : null
  const salesChange = r && p && p.sales.net > 0 ? Math.round(((r.sales.net - p.sales.net) / p.sales.net) * 100) : null
  const maxRole = Math.max(1, ...d.byRole.map((x) => x.count))

  return (
    <>
      <Greeting description="The whole company on one page. Click any number for the list behind it." />

      {/* the four questions first: money, stuck work, late customers, missing stock */}
      <StatRow drill={drill} stats={[
        { label: "Sales this month", value: r ? rupees(r.sales.net) : null, icon: IndianRupee, tone: "green", loading: report.isLoading,
          detail: r ? `Received ${rupees(r.sales.collected)}${salesChange !== null ? ` · ${salesChange >= 0 ? "+" : ""}${salesChange}% vs last month` : ""}` : undefined, to: "/reports" },
        { label: `Orders stuck ${STUCK_DAYS}+ days`, value: tracker.data ? d.stuck.length : null, icon: Route, tone: d.stuck.length ? "red" : "green", loading: tracker.isLoading,
          detail: `${d.open.length} order${d.open.length === 1 ? "" : "s"} open`, to: "/order-tracker" },
        { label: "Late for the customer", value: tracker.data ? d.late.length : null, icon: CalendarClock, tone: d.late.length ? "red" : "green", loading: tracker.isLoading,
          detail: "Past the promised delivery date", to: "/order-tracker" },
        { label: "Stock missing (no reason)", value: unexplained === null ? null : fmtQty(Math.max(unexplained, 0)), icon: PackageX, tone: unexplained > 0 ? "red" : "green", loading: balance.isLoading,
          detail: unexplained > 0 ? "Pieces short with no explanation" : "Every piece is accounted for", to: "/inventory-history" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Who is holding the work" description="Open orders waiting for each role, and the longest wait." to="/order-tracker" toLabel="Order Tracker" className="lg:col-span-1">
          {d.byRole.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No open order.</p> : (
            <div className="space-y-3">
              {d.byRole.map((x) => (
                <div key={x.role}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{ROLE_LABELS[x.role] || x.role}</span>
                    <span className="tabular-nums"><b>{x.count}</b><span className={cn("ml-2 text-xs", x.oldest >= STUCK_DAYS ? "font-semibold text-destructive" : "text-muted-foreground")}>oldest {x.oldest} d</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", x.oldest >= STUCK_DAYS ? "bg-destructive" : "bg-primary")} style={{ width: `${(x.count / maxRole) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Stuck orders" description={`Waiting ${STUCK_DAYS}+ days at one step, longest first.`} to="/order-tracker" toLabel="All orders">
          <OrderList rows={d.stuck} empty="Nothing is stuck." />
        </Panel>
        <Panel title="Late for the customer" description="Promised date has passed, not delivered yet." to="/order-tracker" toLabel="All orders">
          <OrderList rows={d.late} empty="No order is late." late />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="This month" description="Money, quality and speed." to="/reports" toLabel="Reports">
          {!r ? <p className="py-4 text-sm text-muted-foreground">Loading…</p> : (
            <>
              <Line label="Net sales" value={rupees(r.sales.net)} sub={p ? `Last month ${rupees(p.sales.net)}` : undefined} />
              <Line label="Money received" value={rupees(r.sales.collected)} />
              <Line label="Still to collect" value={rupees(r.sales.toCollect)} bad={r.sales.toCollect > 0}
                sub={r.sales.owed[0] ? `Oldest: ${r.sales.owed[0].billNumber}, ${r.sales.owed[0].days} days` : undefined} />
              <Line label="Spent on purchases" value={rupees(r.money.spent)} />
              <Line label="Estimated profit" value={r.money.profit === null ? "—" : rupees(r.money.profit)} bad={r.money.profit !== null && r.money.profit < 0}
                sub={r.money.marginPct !== null ? `${r.money.marginPct}% of sales` : "Needs purchase rates of the components"} />
              <Line label="Orders delivered" value={r.orderTime.delivered} sub={r.orderTime.avgDays !== null ? `${r.orderTime.avgDays} days on average` : undefined} />
              <Line label="QC passed first try" value={pctText(r.qualityCheck.firstTryPassPct)} bad={r.qualityCheck.firstTryPassPct !== null && r.qualityCheck.firstTryPassPct < 90} sub={`${r.qualityCheck.failed} batch fail${r.qualityCheck.failed === 1 ? "" : "s"}`} />
              <Line label="IQC rejected" value={pctText(r.suppliers.rejectedPct)} bad={r.suppliers.rejectedPct > 2} sub={`${fmtQty(r.suppliers.rejected)} pieces`} />
              <Line label="Supplier deliveries late" value={`${r.suppliers.late} / ${r.suppliers.due}`} bad={r.suppliers.late > 0}
                sub={r.suppliers.bySupplier[0]?.late ? `Worst: ${r.suppliers.bySupplier.find((s) => s.late)?.name || ""}` : undefined} />
            </>
          )}
        </Panel>
        <Panel title="Stock" description="What is short and what is ready to sell." to="/inventory" toLabel="Component Stock">
          <Line label="Components out of stock" value={d.out.length} bad={d.out.length > 0} to="/inventory?filter=out" />
          <Line label="At or below minimum" value={d.low.length} bad={d.low.length > 0} to="/inventory?filter=low" />
          <Line label="Finished products ready" value={fmtQty(d.readyPieces)} sub={`${d.ready.length} product${d.ready.length === 1 ? "" : "s"} in the Store`} to="/product-stock" />
          <Line label="Extra material waiting for Store" value={d.extraPending} bad={d.extraPending > 0} to="/store-material-requests" />
          <Line label="Extra material issued this month" value={d.extraThisMonth} sub="Damaged / wasted pieces, with a reason" to="/inventory-history" />
          {d.low.length > 0 && (
            <button type="button" onClick={() => drill.openList({ title: "Components to reorder", rows: d.low.map((i) => stockRow(i)), to: "/inventory?filter=low", toLabel: "Open Component Stock", empty: "" })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><AlertTriangle className="size-3.5" /> See what to reorder</button>
          )}
        </Panel>
        <Panel title="People today" description={att ? `${att.filter((e) => !e.status).length} of ${att.length} not marked yet.` : "Attendance"} to="/attendance" toLabel="Attendance">
          {!att ? <p className="py-4 text-sm text-muted-foreground">No attendance sheet for today.</p> : (
            <div className="grid grid-cols-2 gap-3">
              {ATT.map(([label, key, color]) => (
                <div key={key} className="rounded-lg border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums", color)}>{att.filter((e) => e.status === key).length}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="See any department's screen" description="Exactly what that team sees, without logging in as them." className="mt-4">
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map(([key, label]) => (
            <Link key={key} to={`/dashboard?dept=${key}`} className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-muted">{label}</Link>
          ))}
        </div>
      </Panel>

      <RecentActivity />
      {drill.host}
    </>
  )
}
