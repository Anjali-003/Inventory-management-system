import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { ClipboardList, RefreshCw, ShoppingCart, X } from "lucide-react"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { HeroButton, MktBtn, MktHero, SearchField, StageChips, StatusSelect } from "@/features/marketing-orders/mktKit"
import { rise, stagger } from "@/features/marketing-orders/mktMotion"
import { useGetPurchasesQuery, useReceivePurchaseMutation, useSendPurchaseToIqcMutation } from "@/features/purchasing/purchasingApi"
import {
  PURCHASE_ALL, PURCHASE_STAGES, PurchaseCard, PurchaseCardList, PurchaseStatusPill, PurchaseSteps, PurchaseTile, PurchaseTileGrid, StepButton,
  countPurchases, isPurchaseStatus, purchaseStageOf,
} from "@/features/purchasing/purchaseKit"
import { ordersToOrder, qtyWithUnit } from "@/features/purchasing/purchasingUtils"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import NewPurchaseModal from "./NewPurchaseModal"
import PurchaseDetailSheet from "./PurchaseDetail"

const EMPTY = []

/*
  Purchase department. The purchase manager can only buy what the Operations Admin sent: the "Components to order"
  panel lists the short components of every approved order, and "Place order" turns some or all of them into a
  purchase (no free purchases). Then he marks it Received when the goods arrive and presses Send to IQC: only then
  does it reach the IQC manager (inspection) and, once approved there, the store manager.
  The Store Manager, IQC Manager and Operations Admin see this page read-only.

  Same layout as the Marketing Orders page: a gradient hero, a row of colour tiles (chips on a phone) that filter the
  list, then cards below `lg` and a table from `lg` up.

  The filter lives in the URL, so a link (or a click on a dashboard figure) opens the page already set up:
    ?status=ORDER_PLACED | RECEIVED | PENDING_IQC | PENDING_STORE | STORED | REJECTED   filter
    ?q=text                                                                              search
*/

function CardsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex justify-between"><Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-20 rounded-full" /></div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

export default function Purchase() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("purchase")

  const [params, setParams] = useSearchParams()
  const status = isPurchaseStatus(params.get("status")) ? params.get("status") : null
  const query = params.get("q") ?? ""

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

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetPurchasesQuery()
  const [placing, setPlacing] = useState(null) // order id whose "Place order" dialog is open
  const [viewing, setViewing] = useState(null)
  const approved = useGetApprovedOrdersQuery(undefined, { skip: !editable })
  const toOrder = useMemo(() => ordersToOrder(approved.data), [approved.data])
  const placingGroup = toOrder.find((g) => g.order.id === placing) || null // closes itself once every line is ordered
  const [receive] = useReceivePurchaseMutation()
  const [sendToIqc] = useSendPurchaseToIqcMutation()
  const [busyId, setBusyId] = useState(null) // the purchase whose button was just pressed

  // "Raise purchase" on an order card sends us here with that order selected
  const location = useLocation()
  const navigate = useNavigate()
  const wantedOrder = location.state?.orderId
  useEffect(() => {
    if (!wantedOrder || !toOrder.some((g) => g.order.id === wantedOrder)) return
    setPlacing(wantedOrder)
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [wantedOrder, toOrder, navigate, location.pathname, location.search])

  // one step forward for one purchase; the list refreshes itself (tag "Purchases")
  const step = async (p, run, done) => {
    setBusyId(p.id)
    try {
      await run(p.id).unwrap()
      toast.success(`${p.po_number} ${done}`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not update this purchase."))
    } finally {
      setBusyId(null)
    }
  }
  const onReceive = (p) => step(p, receive, "marked as received")
  const onSendIqc = (p) => step(p, sendToIqc, "sent to IQC")

  const counts = useMemo(() => countPurchases(data), [data])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter((p) => (!status || p.status === status) && (!q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
      p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))))
  }, [data, query, status])

  const filtered = !!(status || query.trim())
  const clearFilters = () => patch({ status: null, q: null })
  const open = (p) => setViewing(p)

  // Same list feeds the tiles (md and up) and the chips (phones).
  const filters = [
    { key: "ALL", stage: PURCHASE_ALL, value: counts.total, active: !status, onClick: () => patch({ status: null }) },
    ...PURCHASE_STAGES.map((s) => ({
      key: s.status,
      stage: s,
      value: counts[s.status],
      active: status === s.status,
      onClick: () => patch({ status: status === s.status ? null : s.status }),
    })),
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Purchase" title="Purchase" description="Order the components the Operations Admin sent, mark them received when the goods arrive, then send them to IQC.">
        <HeroButton variant="glass" onClick={() => { refetch(); approved.refetch?.() }} disabled={isFetching} aria-label="Refresh purchases">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load purchases. Check that the server is running.</Notice></div>}

      {editable && (
        <Card className="mb-5 overflow-hidden">
          <CardHeader className="items-center">
            <div className="min-w-0">
              <CardTitle>Components to order</CardTitle>
              <CardDescription>Sent by the Operations Admin. You can only place orders for these.</CardDescription>
            </div>
            {toOrder.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
                {toOrder.length} order{toOrder.length > 1 ? "s" : ""} waiting
              </span>
            )}
          </CardHeader>
          {approved.isLoading ? (
            <TableSkeleton />
          ) : toOrder.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nothing to order">
              When the Operations Admin sends an order with short components, they will appear here.
            </EmptyState>
          ) : (
            <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
              {toOrder.map(({ order, lines }) => (
                <motion.li key={order.id} variants={rise} className="flex flex-col gap-3 rounded-xl border border-[#dce5e0] bg-card p-4 transition-colors duration-200 hover:border-[#c3d1ca] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-[15px] font-semibold tabular-nums">{order.order_number}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {lines.slice(0, 3).map((l) => `${l.name} (${qtyWithUnit(l.quantity, l.unit)})`).join(", ")}
                      {lines.length > 3 && ` +${lines.length - 3} more`}
                    </p>
                  </div>
                  <MktBtn variant="primary" className="shrink-0" onClick={() => setPlacing(order.id)}><ShoppingCart /> Place order ({lines.length})</MktBtn>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Card>
      )}

      {/* filter: chips on a phone, tiles on tablets, a dropdown (in the bar below) on desktop */}
      <div className="hidden md:block lg:hidden">
        <PurchaseTileGrid className="md:grid-cols-3 xl:grid-cols-6">
          {filters.filter((f) => f.key !== "ALL").map((f) => (
            <PurchaseTile key={f.key} toggle stage={f.stage} value={f.value} loading={isLoading} active={f.active} onClick={f.onClick} />
          ))}
        </PurchaseTileGrid>
      </div>
      <StageChips
        label="Filter purchases by status"
        items={filters.map((f) => ({ key: f.key, label: f.stage.label, value: f.value, grad: f.stage.s.grad, pill: f.stage.s.pill, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
      />

      {/* search: stays under the top bar while a phone scrolls. On a phone the bar stays one line tall:
          the count and the removable filter tag are for bigger screens (the chips already show the filter). */}
      <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-5 md:bg-transparent md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(v) => patch({ q: v }, true)} placeholder="Search PO, supplier or component..." />
        <StatusSelect
          className="hidden shrink-0 lg:block"
          label="Filter purchases by status"
          items={filters.map((f) => ({ key: f.key, label: f.stage.label, short: f.stage.short, value: f.value, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
        />
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:min-h-8 sm:flex-1 sm:flex-wrap sm:justify-end" aria-live="polite">
          <span className="hidden tabular-nums sm:inline">Showing {shown.length} of {counts.total}</span>
          {status && (
            <span className="hidden sm:inline-flex">
              <motion.span
                key={status}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn("inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 font-semibold ring-1 ring-inset", purchaseStageOf(status).s.pill)}
              >
                {purchaseStageOf(status).label}
                <button type="button" aria-label={`Remove ${purchaseStageOf(status).label} filter`} onClick={() => patch({ status: null })} className="grid size-5 place-items-center rounded-full outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring/60">
                  <X className="size-3" />
                </button>
              </motion.span>
            </span>
          )}
          {filtered && <button type="button" onClick={clearFilters} className="whitespace-nowrap font-semibold text-primary outline-none hover:underline focus-visible:underline">Clear filters</button>}
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="lg:hidden"><CardsSkeleton /></div>
          <Card className="hidden overflow-hidden lg:block"><TableSkeleton /></Card>
        </>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={ShoppingCart} title={filtered ? "No purchase matches" : "No purchases yet"}>
            {filtered
              ? status && !query.trim() && counts[status] === 0
                ? `You have no purchase with the status "${purchaseStageOf(status).label}" right now.`
                : "Try a different search or filter."
              : editable ? "Place an order from the components the Operations Admin sent (above)." : "Purchases will appear here."}
            {filtered && (
              <span className="mt-4 flex justify-center gap-2">
                <MktBtn onClick={clearFilters}>Clear filters</MktBtn>
              </span>
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* phones + tablets: cards. Keyed by the filter so they rise in again whenever it changes. */}
          <PurchaseCardList key={`cards-${status ?? "all"}`} className="md:grid-cols-2 lg:hidden">
            {shown.map((p) => (
              <PurchaseCard key={p.id} purchase={p} editable={editable} busy={busyId === p.id} onOpen={() => open(p)} onReceive={onReceive} onSendIqc={onSendIqc} />
            ))}
          </PurchaseCardList>

          {/* desktop: table */}
          <Card className="hidden overflow-hidden lg:block">
            <Table data-cards="off">
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purchased by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={status ?? "all"}>
                {shown.map((p, i) => (
                  <TableRow
                    key={p.id}
                    onClick={() => open(p)}
                    style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, animationFillMode: "backwards" }}
                    className="cursor-pointer motion-reduce:animate-none"
                  >
                    <TableCell className="min-w-40">
                      <button type="button" className="block text-left font-semibold tabular-nums outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:underline">{p.po_number}</button>
                      {p.order_number && <span className="block text-xs text-muted-foreground">for {p.order_number}</span>}
                    </TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-muted-foreground">{p.totals.lines} item{p.totals.lines === 1 ? "" : "s"} · {fmtQty(p.totals.ordered)} ordered</TableCell>
                    <TableCell>
                      <div className="flex w-44 flex-col items-start gap-2">
                        <PurchaseStatusPill value={p.status} />
                        <PurchaseSteps status={p.status} className="w-full" />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-44"><UserCell name={p.created_by_name} sub={fmtDateTime(p.created_at)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <StepButton purchase={p} editable={editable} busy={busyId === p.id} onReceive={onReceive} onSendIqc={onSendIqc} stop />
                        <MktBtn variant="ghost" onClick={(e) => { e.stopPropagation(); open(p) }}>Details</MktBtn>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {placingGroup && <NewPurchaseModal order={placingGroup.order} lines={placingGroup.lines} onClose={() => setPlacing(null)} />}
      <PurchaseDetailSheet purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </MotionConfig>
  )
}
