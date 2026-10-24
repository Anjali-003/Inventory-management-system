import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { ClipboardList, Loader2, Plus, RefreshCw, Send, Trash2, X } from "lucide-react"
import UserCell from "@/components/UserCell"
import { ConfirmDialog } from "@/components/Modal"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermissions } from "@/features/auth/usePermissions"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import NewOrderModal from "./NewOrderModal"
import OrderDrawer from "./OrderDrawer"
import OrdersTable from "./OrdersTable"
import { HeroButton, MktBtn, MktHero, NewOrderFab, SearchField, StageChips, StageTile, StatusSelect, StatusPill, TileGrid } from "./mktKit"
import { PRESS_SOFT, rise, stagger } from "./mktMotion"
import { ALL_STAGE, OrderSteps, STAGES, countByStatus, isDrawerTab, isStatus, newestFirst, plural, stageOf } from "./orderParts"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "./marketingOrdersApi"

const EMPTY = []
const SHOW_LINES = 2

const isDecided = (o) => ["APPROVED", "REJECTED"].includes(o.approval_status)

/*
  Marketing Manager: build an order (Draft), press Send to hand it to the Operations Admin.
  After that the admin's decision (and the reason, when rejected) shows here. Only drafts can still be deleted.

  Layout: the orders are a table while the list box is 1024px wide or more, otherwise each order is a card
  (container query, so it follows the room the list really has next to the sidebar).
  The status filter is a scrolling row of chips on a phone, colour tiles on a tablet and a dropdown on a desktop (lg+).

  The page state lives in the URL, so a link (or a click on a dashboard figure) opens it already set up:
    ?status=DRAFT | PENDING_APPROVAL | APPROVED | REJECTED   filter
    ?q=text                                                  search
    ?order=12                                                that order's popup
    ?new=1                                                   the New order popup
*/

/* One order as a card (phones and tablets). The body opens the order; the buttons under it never do. */
function OrderCard({ o, editable, busy, onOpen, onSend, onDelete }) {
  const stage = stageOf(o.approval_status)
  const draft = o.approval_status === "DRAFT"
  const extra = o.items.length - SHOW_LINES

  return (
    <motion.article
      layout="position"
      variants={rise}
      className="relative overflow-hidden rounded-2xl border border-[#E3E6EB] bg-card shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]"
    >
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1 bg-gradient-to-b", stage?.s.grad ?? "from-slate-600 to-slate-800")} />

      <motion.div
        role="button"
        tabIndex={0}
        whileTap={PRESS_SOFT}
        onClick={() => onOpen(o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(o) }
        }}
        className="cursor-pointer p-4 ps-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold tabular-nums tracking-[-0.01em]">{o.order_number}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fmtDateTime(o.created_at)}>
              {o.created_by_name ? `${o.created_by_name} · ` : ""}{timeAgo(o.created_at)}
            </p>
          </div>
          <StatusPill value={o.approval_status} short />
        </div>

        <ul className="mt-3.5 space-y-1.5">
          {o.items.slice(0, SHOW_LINES).map((it) => (
            <li key={it.product_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{it.name}</span>
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">× {fmtQty(it.quantity)}</span>
            </li>
          ))}
          {extra > 0 && <li className="text-xs font-semibold text-primary">+ {plural(extra, "more product")}</li>}
        </ul>

        <OrderSteps status={o.approval_status} className="mt-4" />

        {isDecided(o) && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
            {o.approval_remarks && <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-foreground/80">{o.approval_remarks}</p>}
          </div>
        )}
      </motion.div>

      {editable && draft && (
        <div className="flex gap-2 border-t bg-cf-head/70 px-4 py-3 ps-5">
          <MktBtn variant="danger" size="icon" aria-label={`Delete draft ${o.order_number}`} onClick={() => onDelete(o)}><Trash2 /></MktBtn>
          <MktBtn variant="primary" className="flex-1" disabled={busy} onClick={() => onSend(o)}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
          </MktBtn>
        </div>
      )}
    </motion.article>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex justify-between"><Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-20 rounded-full" /></div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

export default function MarketingOrders() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("marketingOrders")

  const [params, setParams] = useSearchParams()
  const status = isStatus(params.get("status")) ? params.get("status") : null
  const query = params.get("q") ?? ""
  const orderId = params.get("order")
  const tab = isDrawerTab(params.get("tab")) ? params.get("tab") : "overview"
  const adding = editable && params.get("new") === "1"

  // `replace` keeps typing in the search box from filling the browser history.
  const patch = (changes, replace = false) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace })

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetMarketingOrdersQuery()
  const [send] = useSendMarketingOrderMutation()
  const [remove, { isLoading: deleting }] = useDeleteMarketingOrderMutation()

  const [busyId, setBusyId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const counts = useMemo(() => countByStatus(data), [data])
  const selected = useMemo(() => (orderId ? data.find((o) => String(o.id) === orderId) ?? null : null), [data, orderId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...data]
      .sort(newestFirst)
      .filter(
        (o) =>
          (!status || o.approval_status === status) &&
          (!q || o.order_number.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)))
      )
  }, [data, query, status])

  const filtered = !!(status || query.trim())
  const clearFilters = () => patch({ status: null, q: null })
  const openNew = () => patch({ new: "1" })
  const openOrder = (o, drawerTab) => patch({ order: o.id, tab: drawerTab && drawerTab !== "overview" ? drawerTab : null })
  const closeOrder = () => patch({ order: null, tab: null }, true)

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

  const doDelete = async () => {
    const o = confirmDelete
    try {
      await remove(o.id).unwrap()
      toast.success(`${o.order_number} deleted`)
      if (String(o.id) === orderId) closeOrder()
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete this order."))
    } finally {
      setConfirmDelete(null)
    }
  }

  // Same list feeds the tiles (md and up) and the chips (phones).
  const filters = [
    { key: "ALL", stage: ALL_STAGE, value: counts.total, active: !status, onClick: () => patch({ status: null }) },
    ...STAGES.map((s) => ({
      key: s.status,
      stage: s,
      value: counts[s.status],
      active: status === s.status,
      onClick: () => patch({ status: status === s.status ? null : s.status }),
    })),
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Marketing" title="Marketing Orders" description="Prepare an order, then send it to the Operations Admin for approval.">
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh orders">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
        {editable && (
          <span className="hidden md:inline-flex">
            <HeroButton onClick={openNew}><Plus /> New order</HeroButton>
          </span>
        )}
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load orders. Check that the server is running.</Notice></div>}

      {/* filter: chips on a phone, tiles on tablets, a dropdown (in the bar below) on desktop */}
      <div className="hidden md:block lg:hidden">
        <TileGrid>
          {filters.map((f) => (
            <StageTile
              key={f.key}
              stage={f.stage}
              value={f.value}
              loading={isLoading}
              active={f.active}
              onClick={f.onClick}
              className={f.key === "ALL" ? "col-span-2 md:col-span-4 xl:col-span-1" : undefined}
            />
          ))}
        </TileGrid>
      </div>
      <StageChips
        label="Filter orders by status"
        items={filters.map((f) => ({ key: f.key, label: f.stage.label, value: f.value, grad: f.stage.s.grad, pill: f.stage.s.pill, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
      />

      {/* search: stays under the top bar while a phone scrolls. On a phone the bar stays one line tall:
          the count and the removable filter tag are for bigger screens (the chips already show the filter). */}
      <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-8 md:bg-transparent lg:mt-0 md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(v) => patch({ q: v }, true)} placeholder="Search order or product..." />
        <StatusSelect
          className="hidden shrink-0 lg:block"
          label="Filter orders by status"
          items={filters.map((f) => ({ key: f.key, label: f.stage.label, short: f.stage.short, value: f.value, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
        />
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:min-h-8 sm:flex-1 sm:flex-wrap sm:justify-end" aria-live="polite">
          <span className="hidden tabular-nums sm:inline">Showing {shown.length} of {counts.total}</span>
          {status && (
            <span className="hidden sm:inline-flex lg:hidden">
              <motion.span
                key={status}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn("inline-flex items-center gap-1 rounded-full py-1 ps-2.5 pe-1 font-semibold ring-1 ring-inset", stageOf(status).s.pill)}
              >
                {stageOf(status).label}
                <button type="button" aria-label={`Remove ${stageOf(status).label} filter`} onClick={() => patch({ status: null })} className="grid size-5 place-items-center rounded-full outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring/60">
                  <X className="size-3" />
                </button>
              </motion.span>
            </span>
          )}
          {filtered && <button type="button" onClick={clearFilters} className="whitespace-nowrap font-semibold text-primary outline-none hover:underline focus-visible:underline">Clear filters</button>}
        </div>
      </div>

      {/* the list follows the width of its own box (not the screen), so the table is never squeezed */}
      <div className="@container">
      {isLoading ? (
        <>
          <div className="@5xl:hidden"><CardsSkeleton /></div>
          <Card className="hidden overflow-hidden @5xl:block"><TableSkeleton /></Card>
        </>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title={filtered ? "No order matches" : "No orders yet"}>
            {filtered
              ? status && !query.trim() && counts[status] === 0
                ? `You have no ${stageOf(status).label.toLowerCase()} orders right now.`
                : "Try a different search or filter."
              : "Use New order to prepare your first order."}
            <span className="mt-4 flex justify-center gap-2">
              {filtered && <MktBtn onClick={clearFilters}>Clear filters</MktBtn>}
              {!filtered && editable && <MktBtn variant="primary" onClick={openNew}><Plus /> New order</MktBtn>}
            </span>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* phones + tablets: cards. Keyed by the filter so they rise in again whenever it changes. */}
          <motion.div
            key={`cards-${status ?? "all"}`}
            variants={stagger(0.045)}
            initial="hidden"
            animate="show"
            className="grid gap-3 @2xl:grid-cols-2 @5xl:hidden"
          >
            {shown.map((o) => (
              <OrderCard key={o.id} o={o} editable={editable} busy={busyId === o.id} onOpen={openOrder} onSend={sendOrder} onDelete={setConfirmDelete} />
            ))}
          </motion.div>

          {/* desktop: table (4 columns: Order ID, Order Items, Order Status, Operations Review) */}
          <OrdersTable
            className="hidden @5xl:block"
            orders={shown}
            filterKey={status ?? "all"}
            editable={editable}
            busyId={busyId}
            onOpen={openOrder}
            onViewItems={(o) => openOrder(o, "items")}
            onSend={sendOrder}
            onDelete={setConfirmDelete}
          />
        </>
      )}
      </div>

      {editable && <NewOrderFab onClick={openNew} />}

      {adding && <NewOrderModal onClose={() => patch({ new: null }, true)} />}
      <OrderDrawer
        order={selected && !confirmDelete ? selected : null}
        tab={tab}
        onTab={(t) => patch({ tab: t === "overview" ? null : t }, true)}
        editable={editable}
        busy={selected ? busyId === selected.id : false}
        onClose={closeOrder}
        onSend={sendOrder}
        onDelete={setConfirmDelete}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        busy={deleting}
        tone="danger"
        title="Delete this draft?"
        confirmLabel="Delete"
      >
        {confirmDelete && <p>{confirmDelete.order_number} has not been sent yet. It will be removed permanently.</p>}
      </ConfirmDialog>
    </MotionConfig>
  )
}
