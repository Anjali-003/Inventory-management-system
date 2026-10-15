import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, CheckCircle2, PackageCheck, ShoppingCart, Truck } from "lucide-react"
import SearchBar from "@/components/SearchBar"
import { EmptyState } from "@/components/feedback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Greeting, InfoModal, ListPanel, StatRow, useDrill } from "../DashboardKit"
import OrderShortageModal from "../OrderShortageModal"
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

/* One card per approved order. New orders appear by themselves (live refresh); click = popup with the short components. */
function OrderCard({ order, index, onOpen }) {
  const shortages = shortageOf(order)
  const short = shortages.length > 0
  const extra = order.items.length - 2
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35 }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(order)}
      className="relative flex w-full flex-col gap-3 overflow-hidden rounded-[13px] border border-slate-200/80 bg-card p-4 text-left shadow-[0_2px_5px_rgba(22,34,30,0.045)] outline-none transition-shadow hover:shadow-[0_8px_22px_rgba(22,34,30,0.09)] focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", short ? "bg-destructive" : "bg-primary")} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold tabular-nums">{order.order_number}</p>
          <p className="text-xs text-muted-foreground">Approved {fmtDateTime(order.approved_at)}</p>
        </div>
        {isNew(order.approved_at) && <Badge variant="info">New</Badge>}
      </div>
      <ul className="space-y-0.5 text-sm">
        {order.items.slice(0, 2).map((i) => (
          <li key={i.product_id} className="truncate">{i.name} <span className="text-muted-foreground">× {fmtQty(i.quantity)}</span></li>
        ))}
        {extra > 0 && <li className="text-xs text-muted-foreground">+{extra} more product{extra > 1 ? "s" : ""}</li>}
      </ul>
      <div className="mt-auto border-t pt-3">
        {short ? (
          <>
            <Badge variant="danger">{shortages.length} component{shortages.length > 1 ? "s" : ""} short</Badge>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {shortages.slice(0, 2).map((c) => c.name).join(", ")}{shortages.length > 2 && ` +${shortages.length - 2} more`}
            </p>
          </>
        ) : (
          <Badge variant="success">Nothing to buy</Badge>
        )}
      </div>
    </motion.button>
  )
}

export default function PurchaseView() {
  const drill = useDrill()
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
      detail: (close) => <OrderShortageModal order={o} onClose={close} canRaisePurchase={canRaise} />,
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
    const by = (s) => buyList.filter((p) => p.status === s).map(purchaseRow)
    return { withShort: withShort.map(orderRowOf), all: orders.map(orderRowOf), comps, placed: by("ORDER_PLACED"), received: by("RECEIVED"), inProgress: buyList.filter((p) => p.status !== "STORED" && p.status !== "REJECTED").map(purchaseRow) }
  }, [orders, buys.data, canRaise])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (onlyShort && shortageOf(o).length === 0) return false
      if (!q) return true
      return o.order_number.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q)) || shortageOf(o).some((c) => c.name.toLowerCase().includes(q) || (c.sku || "").toLowerCase().includes(q))
    })
  }, [orders, query, onlyShort])

  return (
    <>
      <Greeting description="Every approved order, with the components we still have to buy." />
      <StatRow
        drill={drill}
        stats={[
          { label: "Orders to buy for", value: d.withShort.length, icon: ShoppingCart, tone: d.withShort.length ? "amber" : "green", loading, detail: "Have short components", drill: { title: "Orders with short components", rows: d.withShort, to: "/approved-orders", toLabel: "Open Approved Orders", empty: "Nothing to buy for any order" } },
          { label: "Components short", value: d.comps.length, icon: AlertTriangle, tone: d.comps.length ? "amber" : "green", loading, detail: "Across all orders", drill: { title: "Short components", description: "Total to buy, summed over all approved orders.", rows: d.comps, to: "/purchase", toLabel: "Open Purchase", empty: "No component is short" } },
          { label: "Waiting for goods", value: d.placed.length, icon: Truck, tone: "blue", loading, detail: "Order placed", drill: { title: "Purchases waiting for goods", rows: d.placed, to: "/purchase", toLabel: "Open Purchase", empty: "No purchase waiting for goods" } },
          { label: "Received, not sent to IQC", value: d.received.length, icon: PackageCheck, tone: d.received.length ? "violet" : "green", loading, detail: "Send them to IQC", drill: { title: "Received, not sent to IQC", rows: d.received, to: "/purchase", toLabel: "Open Purchase", empty: "Nothing to send to IQC" } },
        ]}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or component..." />
        <div className="flex gap-1 rounded-lg border bg-card p-1" role="group" aria-label="Filter orders">
          <Button size="sm" variant={onlyShort ? "ghost" : "secondary"} onClick={() => setOnlyShort(false)}>All orders</Button>
          <Button size="sm" variant={onlyShort ? "secondary" : "ghost"} onClick={() => setOnlyShort(true)}>Needs purchase</Button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[13px]" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={query || onlyShort ? "No order matches" : "No approved orders yet"}>
            {query || onlyShort ? "Try a different search or filter." : "A card appears here as soon as the Operations Admin approves an order."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((o, i) => <OrderCard key={o.id} order={o} index={i} onOpen={(x) => setOpenId(x.id)} />)}
          </div>
        )}
      </div>

      <div className="mt-4">
        <ListPanel drill={drill} loading={loading} title="My purchases in progress" description="Placed, received, with IQC or waiting for the store." rows={d.inProgress} to="/purchase" toLabel="Open Purchase" emptyIcon={ShoppingCart} empty="No purchase in progress" />
      </div>

      <OrderShortageModal order={opened} onClose={() => setOpenId(null)} canRaisePurchase={canRaise} />
      {drill.host}
    </>
  )
}
