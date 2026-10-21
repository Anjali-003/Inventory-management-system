import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { ChevronRight, ClipboardCheck, RefreshCw, X } from "lucide-react"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Modal } from "@/components/Modal"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { HeroButton, MktBtn, MktHero, OrderItems, SearchField, StageChips, StatusSelect } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { plural } from "@/features/marketing-orders/orderParts"
import { BUY_ALL, BUY_STAGES, BuyStatePill, PurchaseTile, PurchaseTileGrid, buyStageOf, buyState, isBuyState, openLinesOf } from "@/features/purchasing/purchaseKit"
import { timeAgo } from "@/features/activity/time"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

const EMPTY = []
const SHOW_LINES = 2

/*
  Purchase Manager: the orders the Operations Admin approved (newest approval first). Read-only.
  When the order has missing components, the Operations Admin's list is in `purchase_request`:
  { sent_at, sent_by_name, items: [{ component_id, sku, name, unit, quantity }] }.
  Each line also says whether it is still "To order" or already on a purchase order (purchase_order_id / po_number).
  The purchases themselves are placed on the Purchase page, only from these lines.

  Same layout as the Marketing Orders page: a gradient hero, colour tiles (chips on a phone) that filter the list,
  then cards below `lg` and a table from `lg` up. The filter lives in the URL:
    ?state=TO_ORDER | ORDERED | NONE   filter (no state = every approved order)
    ?q=text                            search
*/

const productsSummary = (items = []) => (items.length === 0 ? "No products" : items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`)
const unitsOf = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)

const LINE_PILL = { toOrder: "bg-amber-50 text-amber-800 ring-amber-200", ordered: "bg-emerald-50 text-emerald-800 ring-emerald-200" }

function LineStatus({ line }) {
  const toOrder = line.purchase_order_id == null
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", toOrder ? LINE_PILL.toOrder : LINE_PILL.ordered)}>
      {toOrder ? "To order" : `Ordered · ${line.po_number}`}
    </span>
  )
}

/* The components the Operations Admin asked the Purchase Manager to buy for this order: table from `sm`, cards on a phone. */
function ComponentsToBuy({ items }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">To buy</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.component_id}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{c.name}</p>
                  {c.sku && <p className="text-xs text-muted-foreground">{c.sku}</p>}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmtQty(c.quantity)} {c.unit}</TableCell>
                <TableCell><LineStatus line={c} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2 sm:hidden">
        {items.map((c) => (
          <motion.li key={c.component_id} variants={rise} className="rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold leading-snug">{c.name}</p>
                {c.sku && <p className="mt-0.5 text-xs text-muted-foreground">{c.sku}</p>}
              </div>
              <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">{fmtQty(c.quantity)} {c.unit}</span>
            </div>
            <div className="mt-2.5 border-t border-dashed pt-2.5"><LineStatus line={c} /></div>
          </motion.li>
        ))}
      </motion.ul>
    </>
  )
}

/* One approved order as a card (phones and tablets). The whole card opens the popup. */
function OrderCard({ order, onOpen }) {
  const items = order.items ?? []
  return (
    <motion.li variants={rise} className="relative rounded-xl border border-[#dce5e0] bg-card transition-colors duration-200 hover:border-[#c3d1ca]">
      <button type="button" onClick={onOpen} aria-label={`Open ${order.order_number}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
      <div className="pointer-events-none relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all text-[15px] font-semibold leading-snug tabular-nums">{order.order_number}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fmtDateTime(order.approved_at)}>
              {order.approved_by_name ? `${order.approved_by_name} · ` : ""}{timeAgo(order.approved_at)}
            </p>
          </div>
          <BuyStatePill order={order} className="shrink-0" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{productsSummary(items)}</p>
            <p className="text-xs text-muted-foreground">{plural(items.length, "product")} · {fmtQty(unitsOf(items))} units</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </motion.li>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex justify-between"><Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-20 rounded-full" /></div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function ApprovedOrders() {
  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetApprovedOrdersQuery()
  const [viewing, setViewing] = useState(null)

  const [params, setParams] = useSearchParams()
  const state = isBuyState(params.get("state")) ? params.get("state") : null
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

  const counts = useMemo(() => {
    const c = { total: data.length, TO_ORDER: 0, ORDERED: 0, NONE: 0 }
    for (const o of data) c[buyState(o)] += 1
    return c
  }, [data])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(
      (o) =>
        (!state || buyState(o) === state) &&
        (!q ||
          o.order_number.toLowerCase().includes(q) ||
          (o.created_by_name || "").toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)))
    )
  }, [data, query, state])

  const filtered = !!(state || query.trim())
  const clearFilters = () => patch({ state: null, q: null })

  // Same list feeds the tiles (md and up) and the chips (phones).
  const filters = [
    { key: "ALL", stage: BUY_ALL, value: counts.total, active: !state, onClick: () => patch({ state: null }) },
    ...BUY_STAGES.map((s) => ({
      key: s.status,
      stage: s,
      value: counts[s.status],
      active: state === s.status,
      onClick: () => patch({ state: state === s.status ? null : s.status }),
    })),
  ]

  // read from the live list, so the popup stays right if the data refreshes while it is open
  const opened = viewing ? data.find((o) => o.id === viewing.id) || viewing : null
  const openedLines = opened?.purchase_request?.items ?? EMPTY
  const openedToOrder = opened ? openLinesOf(opened).length : 0

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Purchase" title="Approved Orders" description="Orders approved by the Operations Admin, and the components we still have to buy for them.">
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh approved orders">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load approved orders. Check that the server is running.</Notice></div>}

      {/* filter: chips on a phone, tiles on tablets, a dropdown (in the bar below) on desktop */}
      <div className="hidden md:block lg:hidden">
        <PurchaseTileGrid className="md:grid-cols-4">
          {filters.map((f) => (
            <PurchaseTile key={f.key} toggle stage={f.stage} value={f.value} loading={isLoading} active={f.active} onClick={f.onClick} />
          ))}
        </PurchaseTileGrid>
      </div>
      <StageChips
        label="Filter approved orders"
        items={filters.map((f) => ({ key: f.key, label: f.stage.label, value: f.value, grad: f.stage.s.grad, pill: f.stage.s.pill, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
      />

      {/* search: stays under the top bar while a phone scrolls (the chips already show the filter) */}
      <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-5 md:bg-transparent md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(v) => patch({ q: v }, true)} placeholder="Search order, product or who raised it..." />
        <StatusSelect
          className="hidden shrink-0 lg:block"
          label="Filter approved orders"
          items={filters.map((f) => ({ key: f.key, label: f.stage.label, short: f.stage.short, value: f.value, dot: f.stage.dot, active: f.active, onClick: f.onClick }))}
        />
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:min-h-8 sm:flex-1 sm:flex-wrap sm:justify-end" aria-live="polite">
          <span className="hidden tabular-nums sm:inline">Showing {shown.length} of {counts.total}</span>
          {state && (
            <span className="hidden sm:inline-flex">
              <motion.span
                key={state}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn("inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 font-semibold ring-1 ring-inset", buyStageOf(state).s.pill)}
              >
                {buyStageOf(state).label}
                <button type="button" aria-label={`Remove ${buyStageOf(state).label} filter`} onClick={() => patch({ state: null })} className="grid size-5 place-items-center rounded-full outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring/60">
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
          <EmptyState icon={ClipboardCheck} title={filtered ? "No approved order matches" : "No approved orders yet"}>
            {filtered ? "Try a different search or filter." : "Orders will appear here once the Operations Admin approves them."}
            {filtered && (
              <span className="mt-4 flex justify-center gap-2">
                <MktBtn onClick={clearFilters}>Show all orders</MktBtn>
              </span>
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* phones + tablets: cards. Keyed by the filter so they rise in again whenever it changes. */}
          <motion.ul key={`cards-${state ?? "all"}`} variants={stagger(0.045)} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 lg:hidden">
            {shown.map((o) => <OrderCard key={o.id} order={o} onOpen={() => setViewing(o)} />)}
          </motion.ul>

          {/* desktop: table */}
          <Card className="hidden overflow-hidden lg:block">
            <Table data-cards="off">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Components to buy</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Approved by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={state ?? "all"}>
                {shown.map((o, i) => {
                  const extra = o.items.length - SHOW_LINES
                  return (
                    <TableRow
                      key={o.id}
                      onClick={() => setViewing(o)}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, animationFillMode: "backwards" }}
                      className="cursor-pointer motion-reduce:animate-none"
                    >
                      <TableCell className="min-w-36">
                        <button type="button" className="block text-left font-semibold tabular-nums outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:underline">{o.order_number}</button>
                        <span className="block text-xs text-muted-foreground" title={fmtDateTime(o.approved_at)}>{timeAgo(o.approved_at)}</span>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <ul className="space-y-0.5">
                          {o.items.slice(0, SHOW_LINES).map((it) => (
                            <li key={it.product_id} className="text-sm">{it.name} <span className="text-muted-foreground">× {fmtQty(it.quantity)}</span></li>
                          ))}
                          {extra > 0 && <li className="text-xs font-semibold text-primary">+ {plural(extra, "more product")}</li>}
                        </ul>
                      </TableCell>
                      <TableCell><BuyStatePill order={o} /></TableCell>
                      <TableCell className="min-w-44"><UserCell name={o.created_by_name} sub={fmtDateTime(o.created_at)} /></TableCell>
                      <TableCell className="min-w-44"><UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} /></TableCell>
                      <TableCell className="text-right">
                        <MktBtn variant="ghost" onClick={(e) => { e.stopPropagation(); setViewing(o) }}>Details</MktBtn>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Modal
        open={!!opened}
        onClose={() => setViewing(null)}
        size="lg"
        title={opened ? opened.order_number : ""}
        description={opened?.approval_remarks || undefined}
        footer={<MktBtn onClick={() => setViewing(null)} data-autofocus>Close</MktBtn>}
      >
        {opened && (
          <div className="space-y-6">
            {(() => {
              const stage = buyStageOf(buyState(opened))
              const Icon = stage.icon
              return (
                // key = state, so the banner re-plays its entrance (and changes colour) when the lines get ordered
                <motion.div
                  key={stage.status}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
                  className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", stage.s.grad, stage.s.glow)}
                >
                  <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
                  <div className="relative flex items-center gap-3.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">
                        {stage.status === "TO_ORDER" ? `${plural(openedToOrder, "component")} to order` : stage.label}
                      </p>
                      <p className="mt-0.5 text-xs text-white/80">{stage.hint}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(unitsOf(opened.items))}</p>
                      <p className="mt-1 text-[11px] text-white/80">units</p>
                    </div>
                  </div>
                </motion.div>
              )
            })()}

            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold">Products</h3>
              <OrderItems items={opened.items} />
            </section>

            {openedLines.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold">Components to buy for this order</h3>
                <ComponentsToBuy items={openedLines} />
              </section>
            )}
          </div>
        )}
      </Modal>
    </MotionConfig>
  )
}
