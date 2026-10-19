import { useMemo, useState } from "react"
import { MotionConfig, motion } from "motion/react"
import { AlertTriangle, CheckCircle2, ChevronRight, PackageCheck, ShoppingCart, Truck } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetMeQuery } from "@/features/auth/authApi"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { HeroLink, MktHero, SearchField } from "@/features/marketing-orders/mktKit"
import { PRESS, PRESS_SOFT, SPRING, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { plural } from "@/features/marketing-orders/orderParts"
import PurchaseDetailSheet from "@/features/purchase/PurchaseDetail"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { PurchaseTile, PurchaseTileGrid } from "@/features/purchasing/purchaseKit"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { InfoModal, ListPanel, useDrill } from "../DashboardKit"
import OrderShortageDrawer from "../OrderShortageDrawer"
import { purchaseRow } from "../rows"

const EMPTY = []
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000
// only the components that are still to be ordered (lines already on a purchase order are done)
const shortageOf = (o) => (o.purchase_request?.items || EMPTY).filter((c) => c.purchase_order_id == null)

const isNew = (s) => {
  if (!s) return false
  const t = new Date(s.replace(" ", "T")).getTime()
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS
}

/* One colour family per tile, kept whole so Tailwind can see the class names. Green = nothing to do. */
const FAMILY = {
  amber: { grad: "from-amber-400 to-orange-500", glow: "shadow-orange-500/30" },
  rose: { grad: "from-rose-400 to-red-600", glow: "shadow-red-500/30" },
  blue: { grad: "from-sky-400 to-blue-600", glow: "shadow-blue-500/30" },
  violet: { grad: "from-violet-400 to-purple-600", glow: "shadow-purple-500/30" },
  green: { grad: "from-emerald-400 to-emerald-700", glow: "shadow-emerald-600/30" },
}
const tile = (label, icon, hint, family) => ({ label, icon, hint, s: FAMILY[family] })

/* Plain-language line under "Hello": the one thing worth doing next. */
function nudge({ orders, received }) {
  if (orders) return `${plural(orders, "approved customer order")} with components to buy.`
  if (received) return `${plural(received, "supplier purchase order")} received, not yet with IQC. Send ${received === 1 ? "it" : "them"} to IQC.`
  return "Every approved customer order, with the components we still have to buy."
}

/* A purchase row for the dashboard lists: same row as everywhere, but it opens the new purchase popup. */
const purchaseRowSheet = (p) => ({ ...purchaseRow(p), detail: (close) => <PurchaseDetailSheet purchase={p} onClose={close} /> })

const SEG = [
  { value: false, label: "All customer orders" },
  { value: true, label: "Needs purchase" },
]

const SHORT_PILL = "bg-rose-50 text-rose-800 ring-rose-200"
const OK_PILL = "bg-emerald-50 text-emerald-800 ring-emerald-200"

/* One card per approved order. New orders appear by themselves (live refresh); tap = popup with the short components. */
function OrderCard({ order, onOpen }) {
  const shortages = shortageOf(order)
  const short = shortages.length > 0
  const ordered = (order.purchase_request?.items || EMPTY).length - shortages.length // short lines already on a supplier purchase order
  const items = order.items ?? []
  const extra = items.length - 2
  return (
    <motion.li variants={rise} whileHover={{ y: -2 }} whileTap={PRESS_SOFT} className="relative overflow-hidden rounded-xl border border-[#dce5e0] bg-card transition-[border-color,box-shadow] duration-200 hover:border-[#c3d1ca] hover:shadow-md">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", short ? "bg-gradient-to-r from-rose-400 to-red-600" : "bg-gradient-to-r from-emerald-400 to-emerald-700")} />
      <button type="button" onClick={() => onOpen(order)} aria-label={`Open ${order.order_number}`} className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60" />
      <div className="pointer-events-none relative flex h-full flex-col gap-3 p-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-all text-[15px] font-semibold leading-snug tabular-nums">{order.order_number}</p>
            <p className="text-xs text-muted-foreground">Approved {fmtDateTime(order.approved_at)}</p>
          </div>
          {isNew(order.approved_at) && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200">New</span>
          )}
        </div>
        <ul className="space-y-0.5 text-sm">
          {items.slice(0, 2).map((i) => (
            <li key={i.product_id} className="truncate">{i.name} <span className="text-muted-foreground">× {fmtQty(i.quantity)}</span></li>
          ))}
          {extra > 0 && <li className="text-xs text-muted-foreground">+{extra} more product{extra > 1 ? "s" : ""}</li>}
        </ul>
        <div className="mt-auto border-t border-dashed pt-3">
          <div className="flex items-center justify-between gap-2">
            {short ? (
              <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", SHORT_PILL)}>
                <AlertTriangle className="size-3.5" aria-hidden /> {shortages.length} component{shortages.length > 1 ? "s" : ""} to buy
              </span>
            ) : (
              <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", OK_PILL)}>
                <CheckCircle2 className="size-3.5" aria-hidden /> {ordered > 0 ? "All ordered" : "Nothing to buy"}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-primary">
              View Details <ChevronRight className="size-3.5" aria-hidden />
            </span>
          </div>
          {short && ordered > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{ordered} more already on a supplier purchase order</p>}
        </div>
      </div>
    </motion.li>
  )
}

/* "All orders / Needs purchase": the chosen option is a coloured chip that slides across. */
function Segmented({ value, onChange }) {
  return (
    <div role="group" aria-label="Filter orders" className="relative inline-flex rounded-xl border border-cf-line-strong bg-card p-1">
      {SEG.map((o) => {
        const on = value === o.value
        return (
          <motion.button
            key={o.label}
            type="button"
            whileTap={PRESS}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className="relative h-10 rounded-lg px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:h-8"
          >
            {on && <motion.span layoutId="purchase-seg" transition={SPRING} className="absolute inset-0 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 shadow-md" />}
            <span className={cn("relative transition-colors duration-200", on ? "text-white" : "text-slate-700")}>{o.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

export default function PurchaseView() {
  const drill = useDrill()
  const { data: me } = useGetMeQuery()
  const { canEdit } = usePermissions()
  const canRaise = canEdit("purchase")
  const ord = useGetApprovedOrdersQuery()
  const buys = useGetPurchasesQuery()
  const loading = ord.isLoading || buys.isLoading
  const [query, setQuery] = useState("")
  const [onlyShort, setOnlyShort] = useState(false)
  const [openId, setOpenId] = useState(null)

  const orders = ord.data ?? EMPTY
  const opened = useMemo(() => orders.find((o) => o.id === openId) || null, [orders, openId]) // stays live while open

  const d = useMemo(() => {
    const withShort = orders.filter((o) => shortageOf(o).length > 0)
    const orderRowOf = (o) => ({
      id: `a${o.id}`,
      title: o.order_number,
      sub: shortageOf(o).length ? shortageOf(o).map((c) => c.name).join(", ") : "Nothing to buy",
      badge: shortageOf(o).length ? { variant: "danger", label: `${shortageOf(o).length} short` } : { variant: "success", label: "In stock" },
      detail: (close) => <OrderShortageDrawer order={o} onClose={close} canRaisePurchase={canRaise} />,
    })
    // one row per short component, with the orders that need it
    const byComp = new Map()
    withShort.forEach((o) => shortageOf(o).forEach((c) => {
      const e = byComp.get(c.component_id) || { ...c, total: 0, orders: [] }
      e.total += Number(c.quantity)
      e.orders.push([o.order_number, `${fmtQty(c.quantity)} ${c.unit || ""}`.trim()])
      byComp.set(c.component_id, e)
    }))
    const comps = [...byComp.values()].map((c) => ({
      id: `k${c.component_id}`,
      title: c.name,
      sub: `${c.sku || "-"} · needed by ${c.orders.length} order${c.orders.length > 1 ? "s" : ""}`,
      right: `${fmtQty(c.total)} ${c.unit || ""}`.trim(),
      detail: (close) => <InfoModal title={c.name} description={c.sku} fields={[["Total short", `${fmtQty(c.total)} ${c.unit || ""}`.trim()], ...c.orders]} onClose={close} />,
    }))
    const buyList = buys.data ?? EMPTY
    const by = (s) => buyList.filter((p) => p.status === s).map(purchaseRowSheet)
    return { withShort: withShort.map(orderRowOf), comps, placed: by("ORDER_PLACED"), received: by("RECEIVED"), inProgress: buyList.filter((p) => p.status !== "STORED" && p.status !== "REJECTED").map(purchaseRowSheet) }
  }, [orders, buys.data, canRaise])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (onlyShort && shortageOf(o).length === 0) return false
      if (!q) return true
      return o.order_number.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q)) || shortageOf(o).some((c) => c.name.toLowerCase().includes(q) || (c.sku || "").toLowerCase().includes(q))
    })
  }, [orders, query, onlyShort])

  // Each figure opens a popup with the records behind it (and a button to the page).
  const tiles = [
    { key: "orders", stage: tile("CUSTOMER ORDERS NEEDING PURCHASE", ShoppingCart, "Approved, components still to buy", d.withShort.length ? "amber" : "green"), value: d.withShort.length, drill: { title: "Customer orders with short components", rows: d.withShort, to: "/approved-orders?state=TO_ORDER", toLabel: "Open Approved Orders", empty: "Nothing to buy for any order" } },
    { key: "comps", stage: tile("COMPONENTS STILL TO BUY", AlertTriangle, "Different components short, all orders", d.comps.length ? "rose" : "green"), value: d.comps.length, drill: { title: "Short components", description: "Total still to buy, summed over all approved customer orders.", rows: d.comps, to: "/purchase", toLabel: "Open Purchase", empty: "No component is short" } },
    { key: "placed", stage: tile("SUPPLIER ORDERS AWAITING GOODS", Truck, "Purchase orders placed, not received", "blue"), value: d.placed.length, drill: { title: "Supplier purchase orders waiting for goods", rows: d.placed, to: "/purchase?status=ORDER_PLACED", toLabel: "Open Purchase", empty: "No purchase waiting for goods" } },
    { key: "received", stage: tile("RECEIVED, NOT SENT TO IQC", PackageCheck, "Material in, not yet with IQC", d.received.length ? "violet" : "green"), value: d.received.length, drill: { title: "Supplier purchases received, not yet sent to IQC", rows: d.received, to: "/purchase?status=RECEIVED", toLabel: "Open Purchase", empty: "Nothing to send to IQC" } },
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Purchase dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={nudge({ orders: d.withShort.length, received: d.received.length })}>
        <HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to="/purchase"><ShoppingCart /> Open purchase</HeroLink>
      </MktHero>

      <PurchaseTileGrid className="md:grid-cols-4">
        {tiles.map((t) => (
          <PurchaseTile key={t.key} solid stage={t.stage} value={t.value} loading={loading} onClick={() => drill.openList(t.drill)} />
        ))}
      </PurchaseTileGrid>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={setQuery} placeholder="Search customer order, product or component..." />
        <Segmented value={onlyShort} onChange={setOnlyShort} />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState icon={CheckCircle2} title={query || onlyShort ? "No order matches" : "No approved customer orders yet"}>
              {query || onlyShort ? "Try a different search or filter." : "A card appears here as soon as the Operations Admin approves an order."}
            </EmptyState>
          </Card>
        ) : (
          // keyed by the filter so the cards rise in again whenever it changes
          <motion.ul key={String(onlyShort)} variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((o) => <OrderCard key={o.id} order={o} onOpen={(x) => setOpenId(x.id)} />)}
          </motion.ul>
        )}
      </div>

      <div className="mt-4">
        <ListPanel table drill={drill} loading={loading} title="My supplier purchases in progress" description="Placed with the supplier, received, with IQC or waiting for the store." rows={d.inProgress} to="/purchase" toLabel="Open Purchase" emptyIcon={ShoppingCart} empty="No supplier purchase in progress" />
      </div>

      <OrderShortageDrawer order={opened} onClose={() => setOpenId(null)} canRaisePurchase={canRaise} />
      {drill.host}
    </MotionConfig>
  )
}
