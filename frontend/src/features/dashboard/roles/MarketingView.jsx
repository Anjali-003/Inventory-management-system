import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Plus, Send } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { ConfirmDialog } from "@/components/Modal"
import { Reveal } from "@/components/HistoryUI"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetMeQuery } from "@/features/auth/authApi"
import { usePermissions } from "@/features/auth/usePermissions"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "@/features/marketing-orders/marketingOrdersApi"
import { HeroLink, MktBtn, MktHero, NewOrderFab, StageTile, StatusPill, TileGrid } from "@/features/marketing-orders/mktKit"
import { rise, stagger } from "@/features/marketing-orders/mktMotion"
import { ALL_STAGE, OrderPipeline, STAGES, countByStatus, newestFirst, ordersHref, plural } from "@/features/marketing-orders/orderParts"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtQty } from "@/lib/stock"
import OrderDetailModal from "@/features/marketing-orders/OrderDetailModal"

const EMPTY = []

/* Plain-language line under "Hello": the one thing worth doing next. */
function nudge(counts) {
  if (counts.REJECTED) return `${plural(counts.REJECTED, "order")} rejected. Open it to read the admin's remarks.`
  if (counts.PARTIALLY_APPROVED) return `${plural(counts.PARTIALLY_APPROVED, "order")} partially approved. Open it to see the approved quantities.`
  if (counts.DRAFT) return `${plural(counts.DRAFT, "draft")} ready to send to the Operations Admin.`
  if (counts.PENDING_APPROVAL) return `${plural(counts.PENDING_APPROVAL, "order")} waiting for the Operations Admin.`
  return "Where your orders stand with the Operations Admin."
}

/* One short line for the products of an order: the first product and how many more. */
const productsSummary = (items = []) => (items.length === 0 ? "No products" : items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`)
const unitsOf = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)

/*
  Phone: a short card, only what matters at a glance (number, status, products in one line, units, age,
  the rejection reason). Tapping anywhere on it opens the full details in a popup. The Send button
  sits above the tap area, so it only sends. Hairline border, no shadow (ChaiUI).
*/
function OrderCard({ order, canSend, busy, onSend, onOpen }) {
  const items = order.items ?? []
  const rejected = order.approval_status === "REJECTED"
  return (
    <motion.li variants={rise} className="relative rounded-xl border border-[#dce5e0] bg-card transition-colors duration-200 hover:border-[#c3d1ca]">
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

/* Tablet and desktop: a compact table. Clicking a row opens the full details in a popup. */
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
        {to && <Link to={to} className="inline-flex h-9 shrink-0 items-center rounded-[10px] border border-cf-line-strong bg-card px-3 text-xs font-semibold text-primary outline-none transition-colors hover:bg-cf-green-soft focus-visible:ring-2 focus-visible:ring-ring/60">{toLabel}</Link>}
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

export default function MarketingView() {
  const toast = useToast()
  const { data: me } = useGetMeQuery()
  const { canEdit } = usePermissions()
  const editable = canEdit("marketingOrders")

  const { data = EMPTY, isLoading } = useGetMarketingOrdersQuery()
  const [send] = useSendMarketingOrderMutation()
  const [remove, { isLoading: deleting }] = useDeleteMarketingOrderMutation()
  const [busyId, setBusyId] = useState(null)
  const [openedId, setOpenedId] = useState(null) // the order whose popup is open
  const [confirmDelete, setConfirmDelete] = useState(null)

  const counts = useMemo(() => countByStatus(data), [data])
  const latest = useMemo(() => [...data].sort(newestFirst), [data])
  const attention = useMemo(
    () => [...latest.filter((o) => o.approval_status === "REJECTED"), ...latest.filter((o) => o.approval_status === "DRAFT")],
    [latest]
  )

  // read from the live list, so the popup moves on by itself once the order is sent or decided
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

  // Every figure opens the Orders page with that filter already on.
  const tiles = [
    { key: "ALL", stage: ALL_STAGE, value: counts.total, to: ordersHref(null), className: "col-span-2 md:col-span-4 xl:col-span-1" },
    ...STAGES.map((s) => ({ key: s.status, stage: s, value: counts[s.status], to: ordersHref(s.status) })),
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Marketing dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={nudge(counts)}>
        {editable && <HeroLink wrap="hidden md:inline-flex" className="h-10" to={ordersHref(null, { new: 1 })}><Plus /> New order</HeroLink>}
      </MktHero>

      <TileGrid>
        {tiles.map((t) => (
          <StageTile key={t.key} solid stage={t.stage} value={t.value} loading={isLoading} to={t.to} className={t.className} />
        ))}
      </TileGrid>

      <Reveal delay={0.2} className="mt-8">
        <Panel title="Order pipeline" description="Tap a stage to see only those orders." to={ordersHref(null)} toLabel="All orders">
          <OrderPipeline counts={counts} loading={isLoading} />
        </Panel>
      </Reveal>

      {!isLoading && counts.total === 0 ? (
        <Reveal delay={0.3} className="mt-6">
          <Card>
            <EmptyState icon={ClipboardList} title="No orders yet">
              Prepare an order, save it as a draft, then send it to the Operations Admin when it is ready.
              {editable && (
                <span className="mt-4 flex justify-center">
                  <Link to={ordersHref(null, { new: 1 })} className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-gradient-to-br from-emerald-500 to-teal-700 px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(13,148,136,0.8)] outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-3 focus-visible:ring-primary/30 active:scale-[0.97] sm:h-9">
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
            <Panel title="Needs your attention" description="Rejected orders first, then drafts to send." loading={isLoading} to={attention.length > 5 ? ordersHref("DRAFT") : null} toLabel={`View all (${attention.length})`}>
              {attention.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing needs attention">Every order has been sent and decided.</EmptyState>
              ) : (
                <OrderList orders={attention.slice(0, 5)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={(o) => setOpenedId(o.id)} />
              )}
            </Panel>
          </Reveal>
          <Reveal delay={0.4}>
            <Panel title="Latest orders" description="Newest first." loading={isLoading} to={ordersHref(null)} toLabel="View all">
              <OrderList orders={latest.slice(0, 5)} editable={editable} busyId={busyId} onSend={sendOrder} onOpen={(o) => setOpenedId(o.id)} />
            </Panel>
          </Reveal>
        </div>
      )}

      {opened && !confirmDelete && (
        <OrderDetailModal order={opened} editable={editable} busy={busyId === opened.id} onClose={() => setOpenedId(null)} onSend={sendOrder} onDelete={setConfirmDelete} />
      )}
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={doDelete} busy={deleting} tone="danger" title="Delete this draft?" confirmLabel="Delete">
        {confirmDelete && <p>{confirmDelete.order_number} has not been sent yet. It will be removed permanently.</p>}
      </ConfirmDialog>

      {editable && <NewOrderFab to={ordersHref(null, { new: 1 })} />}
    </MotionConfig>
  )
}
