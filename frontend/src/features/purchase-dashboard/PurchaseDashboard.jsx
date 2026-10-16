import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, CheckCircle2, ClipboardList, PackageCheck, RefreshCw, ShoppingCart } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice } from "@/components/feedback"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/HistoryUI"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import OrderShortageModal from "./OrderShortageModal"

const EMPTY = []
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000
// only the components that are still to be ordered (lines already on a purchase order are done)
const shortageOf = (o) => (o.purchase_request?.items || EMPTY).filter((c) => c.purchase_order_id == null)

// "2026-09-30 14:05:09" (server time) -> is it from the last 24h?
const isNew = (s) => {
  if (!s) return false
  const t = new Date(s.replace(" ", "T")).getTime()
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS
}

/*
  Purchase Manager dashboard: ONE card per approved order. The data is the same list the Approved Orders page
  uses (GET /approved-orders), and it already refreshes live (LiveSync invalidates "OrderApprovals"), so a
  new order approved by the Operations Admin shows up here by itself. Click a card -> popup with the short components.
*/
function OrderCard({ order, index, onOpen }) {
  const shortages = shortageOf(order)
  const short = shortages.length > 0
  const extraProducts = order.items.length - 2

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35 }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(order)}
      className={cn(
        "relative flex w-full flex-col gap-3 overflow-hidden rounded-[13px] border border-slate-200/80 bg-card p-4 text-left shadow-[0_2px_5px_rgba(22,34,30,0.045)] outline-none transition-shadow hover:shadow-[0_8px_22px_rgba(22,34,30,0.09)] focus-visible:ring-2 focus-visible:ring-ring/60"
      )}
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
          <li key={i.product_id} className="truncate">
            {i.name} <span className="text-muted-foreground">× {fmtQty(i.quantity)}</span>
          </li>
        ))}
        {extraProducts > 0 && <li className="text-xs text-muted-foreground">+{extraProducts} more product{extraProducts > 1 ? "s" : ""}</li>}
      </ul>

      <div className="mt-auto border-t pt-3">
        {short ? (
          <>
            <Badge variant="danger">{shortages.length} component{shortages.length > 1 ? "s" : ""} short</Badge>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {shortages.slice(0, 2).map((c) => c.name).join(", ")}
              {shortages.length > 2 && ` +${shortages.length - 2} more`}
            </p>
          </>
        ) : (
          <Badge variant="success">Nothing to buy</Badge>
        )}
      </div>
    </motion.button>
  )
}

export default function PurchaseDashboard() {
  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetApprovedOrdersQuery()
  const { canEdit } = usePermissions()
  const [query, setQuery] = useState("")
  const [onlyShort, setOnlyShort] = useState(false)
  const [openId, setOpenId] = useState(null)

  // keep the id (not the object) so the popup stays in sync when the list refreshes live
  const opened = useMemo(() => data.find((o) => o.id === openId) || null, [data, openId])

  const stats = useMemo(() => {
    const withShortage = data.filter((o) => shortageOf(o).length > 0)
    const uniqueComponents = new Set(withShortage.flatMap((o) => shortageOf(o).map((c) => c.component_id)))
    return { total: data.length, needBuy: withShortage.length, clear: data.length - withShortage.length, components: uniqueComponents.size }
  }, [data])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter((o) => {
      if (onlyShort && shortageOf(o).length === 0) return false
      if (!q) return true
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)) ||
        shortageOf(o).some((c) => c.name.toLowerCase().includes(q) || (c.sku || "").toLowerCase().includes(q))
      )
    })
  }, [data, query, onlyShort])

  return (
    <>
      <PageHeader title="Purchase Dashboard" description="Every approved order, with the components we still have to buy.">
        <Button variant="outline" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load orders. Check that the server is running.</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={ClipboardList} tone="blue" label="Approved orders" value={stats.total} loading={isLoading} detail="Sent to purchase" />
        <StatCard index={1} icon={ShoppingCart} tone={stats.needBuy ? "amber" : "green"} label="Orders to buy for" value={stats.needBuy} loading={isLoading} detail="Have short components" onClick={() => setOnlyShort(true)} active={onlyShort} />
        <StatCard index={2} icon={AlertTriangle} tone={stats.components ? "amber" : "green"} label="Components short" value={stats.components} loading={isLoading} detail="Distinct components" />
        <StatCard index={3} icon={CheckCircle2} tone="green" label="Nothing to buy" value={stats.clear} loading={isLoading} detail="Fully in stock" onClick={() => setOnlyShort(false)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or component..." />
        <div className="flex gap-1 rounded-lg border bg-card p-1" role="group" aria-label="Filter orders">
          <Button size="sm" variant={onlyShort ? "ghost" : "secondary"} onClick={() => setOnlyShort(false)}>All orders</Button>
          <Button size="sm" variant={onlyShort ? "secondary" : "ghost"} onClick={() => setOnlyShort(true)}>Needs purchase</Button>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[13px]" />)}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={PackageCheck} title={query || onlyShort ? "No order matches" : "No approved orders yet"}>
            {query || onlyShort ? "Try a different search or filter." : "A card appears here as soon as the Operations Admin approves an order."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((o, i) => <OrderCard key={o.id} order={o} index={i} onOpen={(x) => setOpenId(x.id)} />)}
          </div>
        )}
      </div>

      <OrderShortageModal order={opened} onClose={() => setOpenId(null)} canRaisePurchase={canEdit("purchase")} />
    </>
  )
}
