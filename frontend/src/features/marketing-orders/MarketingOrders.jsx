import { useMemo, useState } from "react"
import { useUrlState } from "@/lib/useUrlState"
import { MotionConfig, motion } from "motion/react"
import { ClipboardList, Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react"
import UserCell from "@/components/UserCell"
import { ConfirmDialog } from "@/components/Modal"
import { FilterTabs, PageButton, PageHeader, Panel, SURFACE } from "@/components/PageKit"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermissions } from "@/features/auth/usePermissions"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import NewOrderModal from "./NewOrderModal"
import OrderDrawer from "./OrderDrawer"
import OrdersTable from "./OrdersTable"
import { NewOrderFab, SearchField, StatusPill } from "./mktKit"
import { PRESS_SOFT, rise, stagger } from "./mktMotion"
import { ALL_STAGE, CustomerName, OrderSteps, OrderValue, STAGES, countByStatus, declinedOf, isDrawerTab, isStatus, newestFirst, plural, stageOf } from "./orderParts"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "./marketingOrdersApi"

const EMPTY = []
const SHOW_LINES = 2

const isDecided = (o) => ["APPROVED", "REJECTED"].includes(o.approval_status)

/*
  Marketing Manager: build an order (Draft), press Send to hand it to the Operations Admin.
  After that the admin's decision (and the reason, when rejected) shows here. Only drafts can still be deleted.

  Layout: the orders are a table while the list box is 1024px wide or more, otherwise each order is a card
  (container query, so it follows the room the list really has next to the sidebar).
  The status filter is one row of tabs (components/PageKit, the home page look) on every screen size.

  The page state lives in the URL, so a link (or a click on a dashboard figure) opens it already set up:
    ?status=DRAFT | PENDING_APPROVAL | APPROVED | REJECTED   filter
    ?q=text                                                  search
    ?order=12                                                that order's popup
    ?new=1                                                   the New order popup
    ?new=1&from=12                                           ... filled in from order 12 ("Order again")
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
      className={cn(SURFACE, "relative overflow-hidden transition-colors hover:border-lp-rule")}
    >
      <motion.div
        role="button"
        tabIndex={0}
        whileTap={PRESS_SOFT}
        onClick={() => onOpen(o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(o) }
        }}
        className="cursor-pointer p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lp-green"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tabular-nums text-lp-ink">{o.order_number}</p>
            <CustomerName order={o} />
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
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-lp-text">× {fmtQty(it.quantity)}</span>
            </li>
          ))}
          {extra > 0 && <li className="text-xs font-semibold text-lp-green">+ {plural(extra, "more product")}</li>}
        </ul>
        <OrderValue order={o} className="mt-2 block" />

        <OrderSteps status={o.approval_status} className="mt-4" />

        {declinedOf(o) && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <UserCell name={declinedOf(o).by} sub={declinedOf(o).at ? fmtDateTime(declinedOf(o).at) : ""} />
            <p className="mt-1.5 text-xs leading-snug text-foreground/80">{declinedOf(o).why}</p>
          </div>
        )}
        {isDecided(o) && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
            {o.approval_remarks && <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-foreground/80">{o.approval_remarks}</p>}
          </div>
        )}
      </motion.div>

      {editable && draft && (
        <div className="flex gap-2 border-t border-lp-line px-4 py-3">
          <PageButton variant="danger" size="icon" aria-label={`Delete draft ${o.order_number}`} onClick={() => onDelete(o)}><Trash2 /></PageButton>
          <PageButton variant="primary" className="flex-1" disabled={busy} onClick={() => onSend(o)}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
          </PageButton>
        </div>
      )}
    </motion.article>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={cn(SURFACE, "space-y-3 p-4")}>
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

  const { params, patch, openPopup, closePopup } = useUrlState()
  const status = isStatus(params.get("status")) ? params.get("status") : null
  const query = params.get("q") ?? ""
  const orderId = params.get("order")
  const tab = isDrawerTab(params.get("tab")) ? params.get("tab") : "overview"
  const adding = editable && params.get("new") === "1"
  const fromId = params.get("from")

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
          (!q || o.order_number.toLowerCase().includes(q) || (o.customer_name || "").toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)))
      )
  }, [data, query, status])

  const filtered = !!(status || query.trim())
  const clearFilters = () => patch({ status: null, q: null })
  const openNew = () => openPopup({ new: "1" })
  const openOrder = (o, drawerTab) => openPopup({ order: o.id, tab: drawerTab && drawerTab !== "overview" ? drawerTab : null })
  const closeOrder = () => closePopup({ order: null, tab: null })

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
      <PageHeader eyebrow="Marketing" title="Customer Orders" description="Write the customer's order, then send it to the Operations Admin for approval.">
        <PageButton onClick={refetch} disabled={isFetching} aria-label="Refresh orders">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </PageButton>
        {editable && (
          <span className="hidden md:inline-flex">
            <PageButton variant="primary" onClick={openNew}><Plus /> New order</PageButton>
          </span>
        )}
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load orders. Check that the server is running.</Notice></div>}

      {/* one row of status tabs on every screen size (it scrolls sideways on a phone) */}
      <FilterTabs
        label="Filter orders by status"
        items={filters.map((f) => ({ key: f.key, label: f.stage.short, value: f.value, active: f.active, onClick: f.onClick }))}
      />

      {/* search: stays under the top bar while a phone scrolls */}
      <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-4 md:bg-transparent md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(v) => patch({ q: v }, true)} placeholder="Search order, customer or product..." />
        <div className="flex shrink-0 items-center gap-3 text-[13px] text-lp-muted sm:flex-1 sm:justify-end" aria-live="polite">
          <span className="hidden tabular-nums sm:inline">Showing {shown.length} of {counts.total}</span>
          {filtered && <button type="button" onClick={clearFilters} className="whitespace-nowrap font-semibold text-lp-green outline-none hover:underline focus-visible:underline">Clear filters</button>}
        </div>
      </div>

      {/* the list follows the width of its own box (not the screen), so the table is never squeezed */}
      <div className="@container">
      {isLoading ? (
        <>
          <div className="@5xl:hidden"><CardsSkeleton /></div>
          <Panel className="hidden overflow-hidden @5xl:block"><TableSkeleton /></Panel>
        </>
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState icon={ClipboardList} title={filtered ? "No order matches" : "No orders yet"}>
            {filtered
              ? status && !query.trim() && counts[status] === 0
                ? `You have no ${stageOf(status).label.toLowerCase()} orders right now.`
                : "Try a different search or filter."
              : "Use New order to prepare your first order."}
            <span className="mt-4 flex justify-center gap-2">
              {filtered && <PageButton onClick={clearFilters}>Clear filters</PageButton>}
              {!filtered && editable && <PageButton variant="primary" onClick={openNew}><Plus /> New order</PageButton>}
            </span>
          </EmptyState>
        </Panel>
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

      {/* "Order again" waits for the orders, so the popup opens already filled in */}
      {adding && !(fromId && isLoading) && (
        <NewOrderModal from={fromId ? data.find((o) => String(o.id) === fromId) : null} onClose={() => closePopup({ new: null, from: null })} />
      )}
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
