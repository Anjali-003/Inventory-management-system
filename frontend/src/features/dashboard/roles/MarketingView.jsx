import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, FileText, IndianRupee, Loader2, Percent, Plus, Receipt, Send, Wallet } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { ConfirmDialog } from "@/components/Modal"
import { pageButtonClass } from "@/components/PageKit"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetCustomersQuery } from "@/features/finished-goods/customersApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { myFgStep } from "@/features/finished-goods/fgFlow"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "@/features/marketing-orders/marketingOrdersApi"
import { useGetNotificationsQuery, useMarkNotificationReadMutation } from "@/features/notifications/notificationsApi"
import { MktBtn, NewOrderFab, StatusPill } from "@/features/marketing-orders/mktKit"
import { rise, stagger } from "@/features/marketing-orders/mktMotion"
import { countByStatus, newestFirst, ordersHref, plural, rupees, stageOf } from "@/features/marketing-orders/orderParts"
import { useGetSalesSummaryQuery } from "@/features/sales/salesApi"
import { Receivables, TopSellers, TrendBars, VsLastMonth } from "@/features/sales/SalesSnapshot"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import OrderDrawer from "@/features/marketing-orders/OrderDrawer"
import { Flag, StageBar, WorkCard, useFlash } from "@/features/dashboard/components/WorkKit"
import { Greeting, StatRow } from "@/features/dashboard/DashboardKit"

const EMPTY = []

/* Plain-language line under the title: the one thing worth doing next. */
function nudge(counts, revised, late) {
  if (revised) return `${plural(revised, "order")} with a revised quantity. Open it to see both copies and accept.`
  if (late) return `${plural(late, "order")} past the delivery date. Tell the customer, or ask the Operations Admin.`
  if (counts.REJECTED) return `${plural(counts.REJECTED, "order")} rejected. Open it to read the admin's remarks.`
  if (counts.DRAFT) return `${plural(counts.DRAFT, "draft")} ready to send to the Operations Admin.`
  if (counts.PENDING_APPROVAL) return `${plural(counts.PENDING_APPROVAL, "order")} waiting for the Operations Admin.`
  return "Where your orders stand with the Operations Admin."
}

/* One short line for the products of an order: the first product and how many more. */
const productsSummary = (items = []) => (items.length === 0 ? "No products" : items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`)
const unitsOf = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)

/* ------------------------------------------------------------- delivery risk */

// orders still on their way to the customer (not rejected, not cancelled)
const OPEN = ["DRAFT", "PENDING_APPROVAL", "QUANTITY_REVISED", "APPROVED"]
const RISK_DAYS = 7

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
// "2026-11-02" -> days from today (negative = already past)
const daysUntil = (date) => Math.round((new Date(`${date}T00:00:00`) - new Date(`${ymd(new Date())}T00:00:00`)) / 86400000)

// the earlier of the customer's date and the Operations Admin's date: whichever comes first is the one to act on
const dueDate = (o) => [o.required_by_date, o.estimated_delivery_date].filter(Boolean).sort()[0]
const shortDay = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

/* Open orders whose due date is past or within RISK_DAYS while some units are not with the customer yet. Earliest first. */
function deliveryRisk(orders) {
  return orders
    .filter((o) => OPEN.includes(o.approval_status) && dueDate(o) && Number(o.delivered_units || 0) < Number(o.totals?.quantity || 0))
    .map((o) => ({ order: o, days: daysUntil(dueDate(o)) }))
    .filter((r) => r.days <= RISK_DAYS)
    .sort((a, b) => a.days - b.days)
}

const dueLine = (days) => (days < 0 ? `Late by ${plural(-days, "day")}` : days === 0 ? "Due today" : `Due in ${plural(days, "day")}`)

/* "Due for delivery": one row per order, the most urgent first. A row opens the order. */
function RiskList({ rows, onOpen }) {
  return (
    <ul className="divide-y divide-lp-line">
      {rows.map(({ order: o, days }) => (
        <li key={o.id}>
          <button type="button" onClick={() => onOpen(o)} className="group flex w-full items-center gap-3 px-5 py-3 text-start outline-none transition-[background-color,box-shadow] hover:bg-lp-tint focus-visible:bg-lp-tint active:bg-lp-portal-on/40 hover:shadow-[inset_3px_0_0_var(--color-lp-green)] focus-visible:shadow-[inset_3px_0_0_var(--color-lp-green)]">
            <span className="min-w-0 flex-1">
              <span className="block whitespace-nowrap font-semibold tabular-nums text-lp-ink transition-colors group-hover:text-lp-green">{o.order_number}</span>
              <span className="block truncate text-xs text-lp-muted">{o.customer_name || "No customer"} · {productsSummary(o.items)}</span>
              {/* the two dates differ: Operations will deliver after (or before) the day the customer asked for */}
              {o.required_by_date && o.estimated_delivery_date && o.required_by_date !== o.estimated_delivery_date && (
                <span className={cn("block text-xs font-medium", o.estimated_delivery_date > o.required_by_date ? "text-destructive" : "text-lp-muted")}>
                  Customer wants {shortDay(o.required_by_date)} · Operations {shortDay(o.estimated_delivery_date)}
                </span>
              )}
            </span>
            <span className="max-w-[45%] shrink-0 text-end">
              <span className={cn("block text-[13px] font-semibold", days < 0 ? "text-destructive" : "text-warning")}>{dueLine(days)}</span>
              <span className="block text-xs text-lp-muted">
                {fmtQty(o.delivered_units || 0)} of {fmtQty(o.totals?.quantity || 0)} given · {stageOf(o.approval_status)?.short}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-lp-muted rtl:-scale-x-100" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

/*
  Phone: a short card, only what matters at a glance (number, status, products in one line, units, age,
  the rejection reason). Tapping anywhere on it opens the full details in the side drawer. The Send button
  sits above the tap area, so it only sends. Hairline border, no shadow (ChaiUI).
*/
function OrderCard({ order, canSend, busy, onSend, onOpen }) {
  const items = order.items ?? []
  const rejected = order.approval_status === "REJECTED"
  return (
    <motion.li variants={rise} className="relative rounded-xl border border-border bg-card transition-colors duration-200 hover:border-lp-rule">
      <button type="button" onClick={onOpen} aria-label={`Open ${order.order_number}`} className="absolute inset-0 rounded-xl outline-none transition-colors hover:bg-lp-soft active:bg-lp-tint focus-visible:ring-2 focus-visible:ring-ring/60" />
      <div className="pointer-events-none relative p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-all text-[15px] font-semibold leading-snug tabular-nums">{order.order_number}</span>
          <StatusPill value={order.approval_status} short className="shrink-0" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{productsSummary(items)}</p>
            <p className="text-xs text-muted-foreground">{fmtQty(unitsOf(items))} units · {timeAgo(order.created_at)}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        {rejected && order.approval_remarks && (
          <p className="mt-2.5 line-clamp-2 rounded-lg border border-rose-200 px-3 py-2 text-xs leading-snug text-rose-800">{order.approval_remarks}</p>
        )}
      </div>
      {canSend && (
        <div className="relative border-t border-dashed p-3">
          <MktBtn variant="primary" disabled={busy} onClick={onSend} aria-label={`Send ${order.order_number} to the Operations Admin`} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to Operations Admin
          </MktBtn>
        </div>
      )}
    </motion.li>
  )
}

/* Tablet and desktop: a compact table. Clicking a row opens the full details in the side drawer. */
function OrderTable({ orders, editable, busyId, onSend, onOpen }) {
  return (
    <Table data-cards="off">
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Products</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-end"><span className="sr-only">Action</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const items = o.items ?? []
          return (
            <TableRow key={o.id} onClick={() => onOpen(o)} className="group cursor-pointer hover:bg-lp-tint active:bg-lp-portal-on/40">
              <TableCell className="transition-shadow group-hover:shadow-[inset_3px_0_0_var(--color-lp-green)]">
                <button type="button" onClick={() => onOpen(o)} className="font-semibold tabular-nums text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{o.order_number}</button>
                <p className="text-xs text-muted-foreground">{timeAgo(o.created_at)}</p>
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                <p className="break-words leading-snug">{productsSummary(items)}</p>
                <p className="text-xs text-muted-foreground">{fmtQty(unitsOf(items))} units</p>
              </TableCell>
              <TableCell><StatusPill value={o.approval_status} short /></TableCell>
              <TableCell className="text-end">
                {editable && o.approval_status === "DRAFT" ? (
                  <MktBtn variant="primary" size="sm" disabled={busyId === o.id} onClick={(e) => { e.stopPropagation(); onSend(o) }} aria-label={`Send ${o.order_number} to the Operations Admin`}>
                    {busyId === o.id ? <Loader2 className="animate-spin" /> : <Send />} Send
                  </MktBtn>
                ) : (
                  <ChevronRight className="ms-auto size-4 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/* Table once the panel itself is 512px wide, cards below that. It follows the panel, not the screen:
   on a desktop the two panels sit side by side and are each narrower than a tablet screen. */
function OrderList({ orders, editable, busyId, onSend, onOpen }) {
  return (
    <div className="@container">
      <div className="hidden @lg:block">
        <OrderTable orders={orders} editable={editable} busyId={busyId} onSend={onSend} onOpen={onOpen} />
      </div>
      <div className="@lg:hidden">
        <RowList>
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} canSend={editable && o.approval_status === "DRAFT"} busy={busyId === o.id} onSend={() => onSend(o)} onOpen={() => onOpen(o)} />
          ))}
        </RowList>
      </div>
    </div>
  )
}

/* The list inside a panel: rows rise in one after another. */
const RowList = ({ children }) => (
  <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className="grid gap-3 p-3 sm:p-4">
    {children}
  </motion.ul>
)

/* ------------------------------------------------------------------ billing list */

/* Finished goods where the next step is Marketing's: make the bill (opens To Bill), or take the payment (opens that bill). */
function BillingList({ rows }) {
  return (
    <ul className="divide-y divide-lp-line">
      {rows.map(({ item: f, step }) => (
        <li key={f.id}>
          <Link to={step.action === "pay" && f.bill ? `/bills?show=open&bill=${f.bill.id}` : "/to-bill"} className="group flex items-center gap-3 px-5 py-3 outline-none transition-[background-color,box-shadow] hover:bg-lp-tint focus-visible:bg-lp-tint active:bg-lp-portal-on/40 hover:shadow-[inset_3px_0_0_var(--color-lp-green)] focus-visible:shadow-[inset_3px_0_0_var(--color-lp-green)]">
            <span className="min-w-0 flex-1">
              <span className="block whitespace-nowrap font-semibold tabular-nums text-lp-ink transition-colors group-hover:text-lp-green">{f.orderNumber}</span>
              <span className="block truncate text-xs text-lp-muted">{[f.customerName || f.bill?.customerName, f.productName].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="shrink-0 text-end">
              <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", step.action === "pay" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800")}>{step.button}</span>
              <span className="block text-xs text-lp-muted tabular-nums">{step.action === "pay" ? `${rupees(f.bill?.due)} due` : `${fmtQty(f.quantity ?? 0)} units`}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-lp-muted rtl:-scale-x-100" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ header */

// "2026-10" for a date
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
// this month and the eleven before it, newest first
// "2026-08" before "2026-09"
const monthBefore = (key) => { const d = new Date(`${key}-01T00:00:00`); d.setMonth(d.getMonth() - 1); return monthKey(d) }
const MONTHS = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return monthKey(d) })

/* "The Operations Admin moved a delivery date": one slim line per change, until it is opened or acknowledged. */
function DateNotices({ items, onOpen, onAcknowledge }) {
  return (
    <ul className="mb-6 grid gap-2">
      {items.map((n) => {
        // rows saved before notifications had a body: build the same line from the payload
        const body = n.body || `${n.old_date ? `${n.old_date} → ` : "Set to "}${n.new_date}${n.reason ? ` · ${n.reason}` : ""}`
        return (
          <li key={n.id} role="status" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 sm:flex-row sm:items-center">
            <CalendarClock className="hidden size-4 shrink-0 text-amber-700 sm:block" aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] text-lp-ink">
              <span className="font-semibold">{n.title}</span>
              <span className="text-lp-muted"> · {body} · {timeAgo(n.created_at)}</span>
            </p>
            <div className="flex shrink-0 gap-2">
              {n.order_id && <MktBtn size="sm" onClick={() => onOpen(n)}>View order</MktBtn>}
              <MktBtn size="sm" variant="ghost" onClick={() => onAcknowledge(n)}>Dismiss</MktBtn>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ KPI cards */

/* "↗ 3.2 pts vs last month": the margin's change in percentage points; what the figure is when there is nothing to compare */
function MarginChange({ pct, lastPct, prev = "last month" }) {
  if (pct == null || lastPct == null) return <span>Parts cost only, an estimate</span>
  const change = Math.round((pct - lastPct) * 10) / 10
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-lp-ink")}>
        <Icon className="size-3.5" aria-hidden /><span className="sr-only">{change >= 0 ? "up" : "down"}</span>{Math.abs(change)} pts
      </span>
      vs {lastPct}% {prev}
    </span>
  )
}

/* ------------------------------------------------------------------ going quiet */

/*
  Regular customers whose next order is late: more than 1.5x their usual gap since the last one (worked out by the
  server, see customers list()). The longest silence first; a row opens the customer.
*/
function GoingQuiet({ customers, loading }) {
  const quiet = customers.filter((c) => c.goingQuiet).sort((a, b) => b.daysSinceOrder / b.usualGapDays - a.daysSinceOrder / a.usualGapDays)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div className="min-w-0"><CardTitle>Going quiet</CardTitle><CardDescription>Regulars whose next order is late</CardDescription></div>
        {quiet.length > 0 && (
          <Link to="/customers?quiet=1" className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40 active:bg-lp-portal-on/40">
            All {quiet.length}<ChevronRight className="size-3.5" />
          </Link>
        )}
      </CardHeader>
      {loading ? <p className="px-5 pb-5 text-sm text-lp-muted">Loading…</p> : quiet.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-lp-muted"><CheckCircle2 className="size-4 text-success" /> Every regular customer is ordering on time.</p>
      ) : (
        <ul className="px-5 pb-4">
          {quiet.slice(0, 4).map((c) => (
            <li key={c.id}>
              <Link to={`/customers?quiet=1&q=${encodeURIComponent(c.name)}`} className="group -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-lp-portal-on/40">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-lp-ink transition-colors group-hover:text-lp-green">{c.name}</span>
                  <span className="block text-xs text-lp-muted">No order for {c.daysSinceOrder} days · usually every {c.usualGapDays}</span>
                </span>
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 tabular-nums">{(c.daysSinceOrder / c.usualGapDays).toFixed(1)}× late</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ orders card */

/*
  Where the open orders are, as one bar: Draft -> With Operations -> Being made -> In the Store -> Billed. Each part
  is as wide as its count and named under the bar with its count (one violet, light to dark, in the order of the flow).
  Delivered, rejected and cancelled orders are not open, so they are left out.
*/
const PIPELINE = [
  { id: "draft", label: "Draft", color: "bg-[#E4D7FF]" },
  { id: "ops", label: "With Operations", color: "bg-[#C4A6FF]" },
  { id: "making", label: "Being made", color: "bg-[#A27BFF]" },
  { id: "store", label: "In the Store", color: "bg-[#7A35FF]" },
  { id: "billed", label: "Billed", color: "bg-[#4E1BB8]" },
]
function stageOfOrder(o, fgStatuses = []) {
  if (o.approval_status === "DRAFT") return "draft"
  if (o.approval_status === "PENDING_APPROVAL" || o.approval_status === "QUANTITY_REVISED") return "ops"
  if (o.approval_status !== "APPROVED") return null // rejected or cancelled
  if (Number(o.delivered_units || 0) >= Number(o.totals?.quantity || 0) && Number(o.totals?.quantity || 0) > 0) return null // delivered
  if (fgStatuses.includes("BILLED")) return "billed"
  if (fgStatuses.includes("IN_STORE")) return "store"
  return "making"
}

export default function MarketingView() {
  const toast = useToast()
  const { canEdit, role } = usePermissions()
  const editable = canEdit("marketingOrders")

  const thisMonth = MONTHS[0]
  const [month, setMonth] = useState(thisMonth)
  const { data = EMPTY, isLoading } = useGetMarketingOrdersQuery()
  // this month is the default request (no ?month=), so it is shared with every other screen that reads it
  const { data: sales, isFetching: salesLoading } = useGetSalesSummaryQuery(month === thisMonth ? undefined : month)
  const { data: goods = EMPTY } = useGetFinishedGoodsQuery()
  const { data: customers = EMPTY, isLoading: customersLoading } = useGetCustomersQuery()
  const [send] = useSendMarketingOrderMutation()
  const [remove, { isLoading: deleting }] = useDeleteMarketingOrderMutation()
  const [busyId, setBusyId] = useState(null)
  const [openedId, setOpenedId] = useState(null) // the order whose side drawer is open
  const [tab, setTab] = useState("overview")
  const [workTab, setWorkTab] = useState(null) // null: the first tab with something waiting
  const openOrder = (o) => { setOpenedId(o.id); setTab("overview") }
  const closeOrder = () => { setOpenedId(null); setTab("overview") }
  const [confirmDelete, setConfirmDelete] = useState(null)
  const { data: inbox } = useGetNotificationsQuery()
  const [markRead] = useMarkNotificationReadMutation()
  // unread delivery-date changes stay on the dashboard until acknowledged (they are in the header bell too)
  const dateNotifs = useMemo(() => (inbox?.items ?? EMPTY).filter((n) => !n.read && n.type === "DELIVERY_DATE_CHANGED"), [inbox])

  const counts = useMemo(() => countByStatus(data), [data])
  const latest = useMemo(() => [...data].sort(newestFirst), [data])
  const attention = useMemo(
    () => [...latest.filter((o) => o.approval_status === "QUANTITY_REVISED"), ...latest.filter((o) => o.approval_status === "REJECTED"), ...latest.filter((o) => o.approval_status === "DRAFT")],
    [latest]
  )
  const billing = useMemo(() => goods.map((item) => ({ item, step: myFgStep(item, role) })).filter((r) => r.step), [goods, role])
  // how many open orders are at each step (an order's finished goods tell whether it is in the Store or billed)
  const pipeline = useMemo(() => {
    const fgOf = new Map()
    for (const f of goods) fgOf.set(f.orderId, [...(fgOf.get(f.orderId) || []), f.status])
    const counts = Object.fromEntries(PIPELINE.map((p) => [p.id, 0]))
    for (const o of data) { const st = stageOfOrder(o, fgOf.get(o.id)); if (st) counts[st] += 1 }
    return counts
  }, [data, goods])

  // read from the live list, so the drawer moves on by itself once the order is sent or decided
  const opened = useMemo(() => data.find((o) => o.id === openedId) ?? null, [data, openedId])

  const doDelete = async () => {
    const o = confirmDelete
    try {
      await remove(o.id).unwrap()
      toast.success(`${o.order_number} deleted`)
      if (o.id === openedId) setOpenedId(null)
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete this order."))
    } finally {
      setConfirmDelete(null)
    }
  }

  const sendOrder = async (o) => {
    setBusyId(o.id)
    try {
      await send(o.id).unwrap()
      toast.success(`${o.order_number} sent to the Operations Admin`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not send this order."))
    } finally {
      setBusyId(null)
    }
  }

  /*
    Four figures: the month's money (billed, received), then the two questions the Marketing Manager asks every day:
      Money to collect   how much is still out?          (bills not fully paid, oldest first)
      Due for delivery   which customer do I call?       (late or due within a week, not all given out)
    "Your turn" (answer a revised quantity, send a draft, make a bill) is the line under Orders.
  */
  const revised = data.filter((o) => o.approval_status === "QUANTITY_REVISED").length
  const toBill = sales?.toBill ?? 0
  const risk = useMemo(() => deliveryRisk(data), [data])
  const late = risk.filter((r) => r.days < 0).length
  const owed = sales?.toCollect ?? 0
  const oldest = sales?.owed?.[0]?.days
  const loadingFigures = isLoading || salesLoading
  const [workFlash, flashWork] = useFlash()
  // a figure or link above: open that list, scroll down to it, and blink the card so the eye lands on it
  const show = (id) => { setWorkTab(id); scrollTo("work"); flashWork() }
  const yourTurn = [revised && `${revised} to answer`, counts.DRAFT && `${plural(counts.DRAFT, "draft")} to send`, toBill && `${toBill} to bill`].filter(Boolean).join(" · ")

  const tabs = [
    { id: "attention", label: "Needs attention", count: attention.length, alert: revised + counts.REJECTED > 0 },
    { id: "risk", label: "Due for delivery", count: risk.length, alert: late > 0 },
    { id: "billing", label: "To bill & collect", count: billing.length },
    { id: "latest", label: "All recent", count: null },
  ]
  const shownTab = workTab ?? tabs.find((t) => t.count > 0)?.id ?? "latest"
  const LIMIT = 6
  const more = { attention: attention.length, risk: risk.length, billing: billing.length, latest: latest.length }[shownTab] > LIMIT
  const moreLink = { attention: [ordersHref(null), "All orders"], risk: [ordersHref("APPROVED"), "All approved orders"], billing: ["/finished-goods", "Open Finished Goods"], latest: [ordersHref(null), "All orders"] }[shownTab]
  const label = monthLabel(month)
  const money = (v) => (loadingFigures ? "…" : rupees(v))
  // another month picked: every link opens that month's bills, and the comparison names the month before it
  const past = month !== thisMonth
  const monthParam = past ? `&month=${month}` : ""
  const prev = past ? `in ${monthLabel(monthBefore(month))}` : undefined

  return (
    <MotionConfig reducedMotion="user">
      <Greeting description={nudge(counts, revised, late)}>
        <label className="sr-only" htmlFor="mkt-month">Month</label>
        <select id="mkt-month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="h-11 rounded-lg border border-lp-line bg-white ps-3 pe-8 text-[13px] font-medium text-lp-ink outline-none transition-colors hover:border-lp-green/50 hover:bg-lp-soft focus-visible:ring-2 focus-visible:ring-lp-green/40 sm:h-9">
          {MONTHS.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        {editable && <Link to={ordersHref(null, { new: 1 })} className={cn(pageButtonClass("primary"), "max-md:hidden")}><Plus /> New order</Link>}
      </Greeting>

      {dateNotifs.length > 0 && (
        <DateNotices items={dateNotifs} onOpen={(n) => { markRead(n.id); openOrder({ id: n.order_id }) }} onAcknowledge={(n) => markRead(n.id)} />
      )}

      <StatRow stats={[
        { label: month === thisMonth ? "Billed this month" : `Billed in ${label}`, icon: FileText, tone: "violet", to: `/bills?show=all${monthParam}`, value: money(sales?.net),
          chart: <TrendBars trend={sales?.trend} />,
          detail: sales?.lastMonth ? <VsLastMonth now={sales.net} before={sales.lastMonth.net} prev={prev} /> : `${sales?.bills ?? 0} bills` },
        { label: month === thisMonth ? "Received this month" : `Received in ${label}`, icon: Wallet, tone: "green", to: `/bills?show=received${monthParam}`, value: money(sales?.collected),
          detail: sales?.lastMonth ? <VsLastMonth now={sales.collected} before={sales.lastMonth.collected} prev={prev} /> : "Payments in" },
        // gross margin: an estimate from the parts' cost, so it says so on hover; only the % is shown, never costs
        { label: month === thisMonth ? "Margin this month" : `Margin in ${label}`, icon: Percent, tone: "blue",
          title: "Sales minus what the products' parts cost at their latest purchase rate. Labour and overheads are not included.",
          value: loadingFigures ? "…" : sales?.margin?.pct == null ? "—" : `${sales.margin.pct}%`,
          detail: sales?.margin ? <MarginChange pct={sales.margin.pct} lastPct={sales.margin.lastPct} prev={prev ?? "last month"} /> : "Parts cost only, an estimate" },
        { label: "Money to collect", icon: IndianRupee, tone: owed ? "amber" : "green", to: "/bills?show=open", value: money(owed),
          detail: owed ? (oldest != null ? <Flag tone={oldest > 30 ? "bad" : "warn"}>{`Oldest bill is ${plural(oldest, "day")} old`}</Flag> : "Bills not fully paid") : "Every bill is paid" },
        { label: "Due for delivery", icon: CalendarClock, tone: late ? "red" : risk.length ? "amber" : "green", onClick: () => show("risk"), active: shownTab === "risk", value: isLoading ? "…" : risk.length,
          detail: risk.length ? <>{late > 0 && <Flag tone="bad">{late} late</Flag>}{late > 0 && risk.length - late > 0 && " · "}{risk.length - late > 0 && <Flag tone="warn">{risk.length - late} this week</Flag>}</> : "Nothing due this week" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* min-w-0: a grid column would otherwise grow to its longest one-line text and push the page sideways on a phone */}
        <div className="min-w-0 lg:col-span-2">
          <WorkCard title="Orders" flash={workFlash} tabs={tabs} tab={shownTab} onTab={setWorkTab}
            pipeline={<StageBar stages={PIPELINE} counts={pipeline} noun="open orders" />}
            summary={<>Your turn: <button type="button" onClick={() => show(revised + counts.DRAFT === 0 && toBill ? "billing" : "attention")} className="rounded font-semibold text-lp-green underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-lp-green/40 active:opacity-70">{yourTurn || "Nothing is waiting for you"}</button></>}
            footer={more && <Link to={moreLink[0]} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40 active:bg-lp-portal-on/40">{moreLink[1]}<ChevronRight className="size-3.5" /></Link>}>
            {isLoading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : shownTab === "attention" ? (
              attention.length ? <OrderList orders={attention.slice(0, LIMIT)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={openOrder} />
                : <EmptyState icon={CheckCircle2} title="Nothing needs attention">Every order has been sent and decided.</EmptyState>
            ) : shownTab === "risk" ? (
              risk.length ? <RiskList rows={risk.slice(0, LIMIT)} onOpen={openOrder} />
                : <EmptyState icon={CalendarClock} title="No delivery in the next 7 days">Late orders and those due within a week show here.</EmptyState>
            ) : shownTab === "billing" ? (
              billing.length ? <BillingList rows={billing.slice(0, LIMIT)} />
                : <EmptyState icon={Receipt} title="Nothing to bill or collect">Orders in the Store to bill, and bills to take payment on, show here.</EmptyState>
            ) : latest.length ? (
              <OrderList orders={latest.slice(0, LIMIT)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={openOrder} />
            ) : (
              <EmptyState icon={ClipboardList} title="No orders yet">
                Prepare an order, save it as a draft, then send it to the Operations Admin when it is ready.
                {editable && (
                  <span className="mt-4 flex justify-center">
                    <Link to={ordersHref(null, { new: 1 })} className={pageButtonClass("primary")}><Plus className="size-4" /> Create your first order</Link>
                  </span>
                )}
              </EmptyState>
            )}
          </WorkCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TopSellers s={sales} loading={salesLoading} month={month === thisMonth ? "This month" : label} monthParam={monthParam} />
          <GoingQuiet customers={customers} loading={customersLoading} />
        </div>
      </div>

      <Receivables s={sales} loading={salesLoading} className="mt-4" />

      <OrderDrawer
        order={opened && !confirmDelete ? opened : null}
        tab={tab}
        onTab={setTab}
        editable={editable}
        busy={opened ? busyId === opened.id : false}
        onClose={closeOrder}
        onSend={sendOrder}
        onDelete={setConfirmDelete}
      />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={doDelete} busy={deleting} tone="danger" title="Delete this draft?" confirmLabel="Delete">
        {confirmDelete && <p>{confirmDelete.order_number} has not been sent yet. It will be removed permanently.</p>}
      </ConfirmDialog>

      {editable && <NewOrderFab to={ordersHref(null, { new: 1 })} />}
    </MotionConfig>
  )
}
