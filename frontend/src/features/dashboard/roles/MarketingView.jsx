import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardList, IndianRupee, ListTodo, Loader2, Plus, Send } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { ConfirmDialog } from "@/components/Modal"
import { CountUp, Reveal } from "@/components/HistoryUI"
import { FigureTile, TINT, pageButtonClass } from "@/components/PageKit"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetMeQuery } from "@/features/auth/authApi"
import { usePermissions } from "@/features/auth/usePermissions"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "@/features/marketing-orders/marketingOrdersApi"
import { useGetNotificationsQuery, useMarkNotificationReadMutation } from "@/features/notifications/notificationsApi"
import { severityOf } from "@/features/notifications/notificationStyle"
import NotificationIcon from "@/features/notifications/NotificationIcon"
import { HeroLink, MktBtn, MktHero, NewOrderFab, StatusPill, TileGrid } from "@/features/marketing-orders/mktKit"
import { rise, stagger } from "@/features/marketing-orders/mktMotion"
import { countByStatus, newestFirst, ordersHref, plural, rupees, stageOf } from "@/features/marketing-orders/orderParts"
import { useGetSalesSummaryQuery } from "@/features/sales/salesApi"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import OrderDrawer from "@/features/marketing-orders/OrderDrawer"
import FinishedGoodsTodo from "../FinishedGoodsTodo"
import SalesSnapshot from "@/features/sales/SalesSnapshot"

const EMPTY = []

/* Plain-language line under "Hello": the one thing worth doing next. */
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
          <button type="button" onClick={() => onOpen(o)} className="flex w-full items-center gap-3 px-5 py-3 text-start outline-none transition-colors hover:bg-lp-bg focus-visible:bg-lp-bg">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold tabular-nums text-lp-ink">{o.order_number}</span>
              <span className="block truncate text-xs text-lp-muted">{o.customer_name || "No customer"} · {productsSummary(o.items)}</span>
              {/* the two dates differ: Operations will deliver after (or before) the day the customer asked for */}
              {o.required_by_date && o.estimated_delivery_date && o.required_by_date !== o.estimated_delivery_date && (
                <span className={cn("block text-xs font-medium", o.estimated_delivery_date > o.required_by_date ? "text-destructive" : "text-lp-muted")}>
                  Customer wants {shortDay(o.required_by_date)} · Operations {shortDay(o.estimated_delivery_date)}
                </span>
              )}
            </span>
            <span className="shrink-0 text-end">
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
    <motion.li variants={rise} className="relative rounded-xl border border-[#E3E6EB] bg-card transition-colors duration-200 hover:border-[#CDD2DA]">
      <button type="button" onClick={onOpen} aria-label={`Open ${order.order_number}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
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
            <TableRow key={o.id} onClick={() => onOpen(o)} className="cursor-pointer">
              <TableCell>
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

function Panel({ title, description, to, toLabel, loading, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className={pageButtonClass("outline", "sm")}>{toLabel}</Link>}
      </CardHeader>
      {loading ? <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : children}
    </Card>
  )
}

/* The list inside a panel: rows rise in one after another. */
const RowList = ({ children }) => (
  <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className="grid gap-3 p-3 sm:p-4">
    {children}
  </motion.ul>
)

/* "The Operations Admin moved a delivery date": one row per change, until the Marketing Manager acknowledges it. */
function DeliveryDateNotices({ items, onOpen, onAcknowledge }) {
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-sm font-bold">Delivery date changes</p>
        <span className="rounded-full bg-cf-amber-soft px-2 py-0.5 text-[11px] font-semibold text-warning tabular-nums">{items.length} new</span>
      </div>
      <ul className="divide-y">
        {items.map((n) => {
          const s = severityOf(n)
          // rows saved before notifications had a body: build the same line from the payload
          const body = n.body || `${n.old_date ? `${n.old_date} → ` : "Set to "}${n.new_date}${n.reason ? ` · ${n.reason}` : ""}`
          return (
            <li key={n.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${s.soft} ${s.tone}`}>
                <NotificationIcon n={n} className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {body}
                  <span className="text-cf-faint"> · {timeAgo(n.created_at)}{n.created_by_name ? ` by ${n.created_by_name}` : ""}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {n.order_id && (
                  <button type="button" onClick={() => onOpen(n)} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 sm:h-8">
                    View order <ChevronRight className="size-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => onAcknowledge(n)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground outline-none transition-colors hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-primary/30 sm:h-8">
                  <CheckCircle2 className="size-3.5" /> Got it
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default function MarketingView() {
  const toast = useToast()
  const { data: me } = useGetMeQuery()
  const { canEdit } = usePermissions()
  const editable = canEdit("marketingOrders")

  const { data = EMPTY, isLoading } = useGetMarketingOrdersQuery()
  const { data: sales, isLoading: salesLoading } = useGetSalesSummaryQuery()
  const [send] = useSendMarketingOrderMutation()
  const [remove, { isLoading: deleting }] = useDeleteMarketingOrderMutation()
  const [busyId, setBusyId] = useState(null)
  const [openedId, setOpenedId] = useState(null) // the order whose side drawer is open
  const [tab, setTab] = useState("overview")
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
    Three figures, each a question the Marketing Manager asks:
      Your turn          what do I have to do now?      (answer a revised quantity, send a draft, make a bill)
      Due for delivery   which customer do I call?       (late or due within a week, not all given out)
      Money to collect   how much is still out?          (bills not fully paid, oldest first)
  */
  const revised = data.filter((o) => o.approval_status === "QUANTITY_REVISED").length
  const toBill = sales?.toBill ?? 0
  const myTurn = revised + counts.DRAFT + toBill
  const risk = useMemo(() => deliveryRisk(data), [data])
  const late = risk.filter((r) => r.days < 0).length
  const owed = sales?.toCollect ?? 0
  const oldest = sales?.owed?.[0]?.days

  const figures = [
    {
      key: "turn", icon: ListTodo, label: "Your turn", value: <CountUp value={myTurn} />,
      hint: [revised && `${revised} to answer`, counts.DRAFT && `${plural(counts.DRAFT, "draft")} to send`, toBill && `${toBill} to bill`].filter(Boolean).join(" · ") || "Nothing is waiting for you",
      tint: myTurn ? TINT.amber : TINT.slate,
      // the orders are in "Needs your attention" below; when only bills are left, straight to them
      ...(revised + counts.DRAFT === 0 && toBill ? { to: "/finished-goods?status=IN_STORE" } : { onClick: () => scrollTo("your-turn") }),
    },
    {
      key: "risk", icon: CalendarClock, label: "Due for delivery", value: <CountUp value={risk.length} />,
      hint: risk.length ? [late && `${late} late`, risk.length - late && `${risk.length - late} this week`].filter(Boolean).join(" · ") : "Nothing due this week",
      tint: late ? TINT.rose : risk.length ? TINT.amber : TINT.slate,
      ...(risk.length ? { onClick: () => scrollTo("delivery-risk") } : {}),
    },
    {
      key: "money", icon: IndianRupee, label: "Money to collect", value: rupees(owed),
      hint: owed ? (oldest != null ? `Oldest bill is ${plural(oldest, "day")} old` : "Bills not fully paid") : "Every bill is paid",
      tint: oldest > 30 ? TINT.rose : owed ? TINT.amber : TINT.slate,
      to: "/bills?show=open",
    },
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Marketing dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={nudge(counts, revised, late)}>
        {editable && <HeroLink wrap="hidden md:inline-flex" className="h-10" to={ordersHref(null, { new: 1 })}><Plus /> New order</HeroLink>}
      </MktHero>

      {dateNotifs.length > 0 && (
        <DeliveryDateNotices
          items={dateNotifs}
          onOpen={(n) => { markRead(n.id); openOrder({ id: n.order_id }) }}
          onAcknowledge={(n) => markRead(n.id)}
        />
      )}

      <TileGrid className="grid-cols-1 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-3">
        {figures.map(({ key, ...f }) => (
          <FigureTile key={key} {...f} toggle={false} loading={isLoading || salesLoading} />
        ))}
      </TileGrid>

      {!isLoading && counts.total === 0 ? (
        <Reveal delay={0.3} className="mt-6">
          <Card>
            <EmptyState icon={ClipboardList} title="No orders yet">
              Prepare an order, save it as a draft, then send it to the Operations Admin when it is ready.
              {editable && (
                <span className="mt-4 flex justify-center">
                  <Link to={ordersHref(null, { new: 1 })} className={pageButtonClass("primary")}>
                    <Plus className="size-4" /> Create your first order
                  </Link>
                </span>
              )}
            </EmptyState>
          </Card>
        </Reveal>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Reveal delay={0.3}>
            <div id="your-turn" className="scroll-mt-20">
              <Panel title="Needs your attention" description="Revised quantities to accept first, then rejected orders, then drafts to send." loading={isLoading} to={attention.length > 5 ? ordersHref("DRAFT") : null} toLabel={`View all (${attention.length})`}>
                {attention.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="Nothing needs attention">Every order has been sent and decided.</EmptyState>
                ) : (
                  <OrderList orders={attention.slice(0, 5)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={openOrder} />
                )}
              </Panel>
            </div>
          </Reveal>
          <Reveal delay={0.4}>
            {/* deliveries at risk when there are any; otherwise simply the newest orders */}
            {risk.length > 0 ? (
              <div id="delivery-risk" className="scroll-mt-20">
                <Panel title="Due for delivery" description="Late, or due this week, and not fully given to the customer yet. Most urgent first." loading={isLoading} to={risk.length > 6 ? ordersHref(null) : null} toLabel="All orders">
                  <RiskList rows={risk.slice(0, 6)} onOpen={openOrder} />
                </Panel>
              </div>
            ) : (
              <Panel title="Latest orders" description="Newest first." loading={isLoading} to={ordersHref(null)} toLabel="View all">
                <OrderList orders={latest.slice(0, 5)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={openOrder} />
              </Panel>
            )}
          </Reveal>
        </div>
      )}

      <SalesSnapshot className="mt-6" />
      <FinishedGoodsTodo className="mt-4" title="Bill or take payment" />

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
