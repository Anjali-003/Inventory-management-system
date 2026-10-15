import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ClipboardList, Loader2, Plus, RefreshCw, Send, Trash2, X } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import UserCell from "@/components/UserCell"
import { ConfirmDialog } from "@/components/Modal"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { ApprovalStatus } from "@/features/order-approvals/approvalParts"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import NewOrderModal from "./NewOrderModal"
import OrderDetailModal from "./OrderDetailModal"
import { OrderProgress, STAGES, countByStatus, isStatus, newestFirst, plural, stageOf } from "./orderParts"
import { useDeleteMarketingOrderMutation, useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "./marketingOrdersApi"

const EMPTY = []
const SHOW_LINES = 2

/*
  Marketing Manager: build an order (Draft), press Send to hand it to the Operations Admin.
  After that the admin's decision (and the reason, when rejected) shows here. Only drafts can still be deleted.

  The page state lives in the URL, so a link (or a click on a dashboard figure) opens it already set up:
    ?status=DRAFT | PENDING_APPROVAL | APPROVED | REJECTED   filter
    ?q=text                                                  search
    ?order=12                                                that order's popup
    ?new=1                                                   the New order popup
*/
export default function MarketingOrders() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("marketingOrders")

  const [params, setParams] = useSearchParams()
  const status = isStatus(params.get("status")) ? params.get("status") : null
  const query = params.get("q") ?? ""
  const orderId = params.get("order")
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
      if (String(o.id) === orderId) patch({ order: null }, true)
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete this order."))
    } finally {
      setConfirmDelete(null)
    }
  }

  const strip = [
    { key: "ALL", label: "All orders", tone: "info", hint: "Everything you raised", value: counts.total, active: !status, onClick: () => patch({ status: null }), className: "col-span-2 xl:col-span-1" },
    ...STAGES.map((s) => ({
      key: s.status,
      label: s.label,
      tone: s.dotTone,
      hint: s.hint,
      value: counts[s.status],
      active: status === s.status,
      onClick: () => patch({ status: status === s.status ? null : s.status }),
    })),
  ]

  return (
    <>
      <PageHeader title="Marketing Orders" description="Prepare an order, then send it to the Operations Admin for approval.">
        <div className="flex gap-2">
          <Button variant="outline" onClick={refetch} disabled={isFetching}><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</Button>
          {editable && <Button onClick={() => patch({ new: "1" })}><Plus /> New order</Button>}
        </div>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load orders. Check that the server is running.</Notice></div>}

      <Card className="overflow-hidden">
        <StatStrip cols="grid-cols-2 xl:grid-cols-5" layoutId="marketing-order-summary" items={strip} />

        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={(v) => patch({ q: v }, true)} placeholder="Search order or product..." />
          <div className="flex min-h-8 flex-1 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="tabular-nums">Showing {shown.length} of {counts.total}</span>
            {status && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cf-green-soft py-1 pl-2.5 pr-1 font-semibold text-primary animate-in fade-in zoom-in-95 duration-200">
                {stageOf(status).label}
                <button type="button" aria-label={`Remove ${stageOf(status).label} filter`} onClick={() => patch({ status: null })} className="grid size-4 place-items-center rounded-full outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/60">
                  <X className="size-3" />
                </button>
              </span>
            )}
            {filtered && <button type="button" onClick={clearFilters} className="font-semibold text-primary outline-none hover:underline focus-visible:underline">Clear filters</button>}
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={ClipboardList} title={filtered ? "No order matches" : "No orders yet"}>
            {filtered
              ? status && !query.trim() && counts[status] === 0
                ? `You have no ${stageOf(status).label.toLowerCase()} orders right now.`
                : "Try a different search or filter."
              : "Use New order to prepare your first order."}
            <span className="mt-4 flex justify-center gap-2">
              {filtered && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
              {!filtered && editable && <Button onClick={() => patch({ new: "1" })}><Plus /> New order</Button>}
            </span>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin decision</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={status ?? "all"}>
                {shown.map((o, i) => {
                  const extra = o.items.length - SHOW_LINES
                  const decided = o.approval_status === "APPROVED" || o.approval_status === "REJECTED"
                  return (
                    <TableRow
                      key={o.id}
                      onClick={() => patch({ order: o.id })}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, animationFillMode: "backwards" }}
                      className="cursor-pointer motion-reduce:animate-none"
                    >
                      <TableCell className="min-w-44">
                        <button type="button" className="block text-left font-semibold tabular-nums outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:underline">
                          {o.order_number}
                        </button>
                        <span className="block text-xs text-muted-foreground" title={fmtDateTime(o.created_at)}>
                          {o.created_by_name ? `${o.created_by_name} · ` : ""}{timeAgo(o.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <ul className="space-y-0.5">
                          {o.items.slice(0, SHOW_LINES).map((it) => (
                            <li key={it.product_id} className="text-sm">{it.name} <span className="text-muted-foreground">× {fmtQty(it.quantity)}</span></li>
                          ))}
                          {extra > 0 && <li className="text-xs font-semibold text-primary">+ {plural(extra, "more product")}</li>}
                        </ul>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <ApprovalStatus value={o.approval_status} />
                          <OrderProgress status={o.approval_status} />
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        {decided ? (
                          <div className="space-y-0.5">
                            <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
                            {o.approval_remarks && <p className="line-clamp-2 max-w-64 whitespace-normal text-xs text-muted-foreground">{o.approval_remarks}</p>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable && o.approval_status === "DRAFT" && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" aria-label={`Delete draft ${o.order_number}`} onClick={(e) => { e.stopPropagation(); setConfirmDelete(o) }}><Trash2 /></Button>
                            <Button size="sm" disabled={busyId === o.id} onClick={(e) => { e.stopPropagation(); sendOrder(o) }}>
                              {busyId === o.id ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {adding && <NewOrderModal onClose={() => patch({ new: null }, true)} />}
      {selected && !confirmDelete && (
        <OrderDetailModal
          order={selected}
          editable={editable}
          busy={busyId === selected.id}
          onClose={() => patch({ order: null }, true)}
          onSend={sendOrder}
          onDelete={setConfirmDelete}
        />
      )}
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
    </>
  )
}
