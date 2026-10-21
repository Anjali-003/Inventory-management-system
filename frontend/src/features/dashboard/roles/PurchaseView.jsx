import { useMemo } from "react"
import { MotionConfig } from "motion/react"
import { CheckCircle2, ClipboardList, FlaskConical, PackageSearch, ShoppingCart, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { stockState } from "@/features/inventory/components/StockBadge"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { HeroLink, MktHero } from "@/features/marketing-orders/mktKit"
import { plural } from "@/features/marketing-orders/orderParts"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { PurchaseTile, PurchaseTileGrid, countPurchases, purchaseHref } from "@/features/purchasing/purchaseKit"
import { fmtDateTime } from "@/lib/stock"
import { ListPanel, useDrill } from "../DashboardKit"
import DepartmentOverview, { shortageOf } from "../DepartmentOverview"
import OrderShortageDrawer from "../OrderShortageDrawer"

const EMPTY = []

/* Plain-language line under "Hello": only what still has to be bought. */
const nudge = (orders) => (orders ? `${plural(orders, "approved customer order")} with components to buy.` : "No components pending purchase.")

/*
  Urgent Purchase Requirements: approved orders that still have components to buy, most urgent first.
  Purchases and orders do not record an Estimated Delivery Date anywhere in this project (no column, no API field),
  so there is nothing to sort by "nearest delivery". Until that date exists the list is ordered by how long an order
  has been waiting (oldest approval first). When a delivery date is added, change urgencyAt() only.
*/
const urgencyAt = (o) => {
  const t = new Date(String(o.approved_at || "").replace(" ", "T")).getTime()
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER // no date: last
}

/* One colour family per KPI card, kept whole so Tailwind can see the class names. Green = nothing to do. */
const FAMILY = {
  amber: { grad: "from-amber-400 to-orange-500", glow: "shadow-orange-500/30" },
  rose: { grad: "from-rose-400 to-red-600", glow: "shadow-red-500/30" },
  blue: { grad: "from-sky-400 to-blue-600", glow: "shadow-blue-500/30" },
  violet: { grad: "from-violet-400 to-purple-600", glow: "shadow-purple-500/30" },
  green: { grad: "from-emerald-400 to-emerald-700", glow: "shadow-emerald-600/30" },
  slate: { grad: "from-slate-400 to-slate-600", glow: "shadow-slate-500/30" },
}
const tile = (label, icon, hint, family) => ({ label, icon, hint, s: FAMILY[family] })

/*
  The KPI cards. Each has one unit and counts only what is still open; nothing is counted in two cards:
  There is no "late" card: purchases do not record an expected delivery date in this project.
  Each card is a read-only figure that opens the page already listing it:
    Low Stock / Out of Stock   components at or below minimum / with nothing available (same stockState() as the Inventory page)
    Purchase Requirements      component lines still to order, counted per order
    IQC Status                 supplier purchase orders with IQC, waiting for inspection (PENDING_IQC)
*/

export default function PurchaseView() {
  const drill = useDrill()
  const { data: me } = useGetMeQuery()
  const { canEdit, canView } = usePermissions()
  const canOrders = canView("approvedOrders") // an IQC / Store viewer cannot read approved orders: those figures are left out
  const canRaise = canEdit("purchase")
  const ord = useGetApprovedOrdersQuery(undefined, { skip: !canOrders })
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery() // the same stock list the shortage drawer reads; this role can already view it
  const loading = (canOrders && ord.isLoading) || buys.isLoading

  const orders = ord.data ?? EMPTY

  const d = useMemo(() => {
    const buyList = buys.data ?? EMPTY
    const needs = orders.filter((o) => shortageOf(o).length > 0) // workflow 1
    const stock = Array.isArray(inv.data) ? inv.data : EMPTY
    const urgent = [...needs].sort((a, b) => urgencyAt(a) - urgencyAt(b) || a.id - b.id).map((o) => {
      const n = shortageOf(o).length
      return {
        id: `u${o.id}`,
        title: o.order_number,
        sub: `${plural(n, "component")} to buy · Approved ${fmtDateTime(o.approved_at)}`,
        badge: { variant: "warning", label: `${n} to buy` },
        detail: (close) => <OrderShortageDrawer order={o} onClose={close} canRaisePurchase={canRaise} />,
      }
    })
    return {
      lowStock: stock.filter((i) => stockState(i) === "low").length,
      outStock: stock.filter((i) => stockState(i) === "out").length,
      requirementLines: needs.reduce((sum, o) => sum + shortageOf(o).length, 0),
      counts: countPurchases(buyList),
      urgent,
      needs,
    }
  }, [orders, buys.data, inv.data, canRaise])

  // each card opens the page that already shows exactly what it counts (same pattern as the Operations Admin cards)
  const tiles = [
    // stock and IQC figures (read-only: each opens the page that already lists them)
    { key: "low", stage: tile("Low Stock", PackageSearch, "At or below minimum", d.lowStock ? "amber" : "green"), value: d.lowStock, to: "/inventory?filter=low", loading: inv.isLoading },
    { key: "out", stage: tile("Out of Stock", XCircle, "Nothing available", d.outStock ? "rose" : "green"), value: d.outStock, to: "/inventory?filter=out", loading: inv.isLoading },
    canOrders && { key: "req", stage: tile("Purchase Requirements", ClipboardList, "Component lines to order", d.requirementLines ? "amber" : "green"), value: d.requirementLines, to: "/approved-orders?state=TO_ORDER" },
    { key: "iqcstatus", stage: tile("IQC Status", FlaskConical, "With IQC, awaiting inspection", d.counts.PENDING_IQC ? "violet" : "green"), value: d.counts.PENDING_IQC, to: purchaseHref("PENDING_IQC") },
  ]

  const pending = d.needs.length

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Purchase dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={canOrders ? nudge(pending) : "Purchases and supplier deliveries."}>
        <HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to="/purchase"><ShoppingCart /> Open purchase</HeroLink>
      </MktHero>

      <PurchaseTileGrid className={canOrders ? "md:grid-cols-4" : "md:grid-cols-3"}>
        {tiles.filter(Boolean).map((t) => (
          <PurchaseTile key={t.key} solid stage={t.stage} value={t.value} loading={t.loading ?? loading} to={t.to} />
        ))}
      </PurchaseTileGrid>

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Urgent Purchase Requirements */}
          {canOrders && (
            <ListPanel table className="mt-6" drill={drill} loading={loading} title={`Urgent Purchase Requirements${d.urgent.length ? ` (${d.urgent.length})` : ""}`} description="Orders waiting longest for components to be bought come first." rows={d.urgent} to="/approved-orders?state=TO_ORDER" toLabel="Open Approved Orders" emptyIcon={CheckCircle2} empty="No components pending purchase." />
          )}

          {/* Department overview (read-only); each card opens that department's main dashboard */}
          <DepartmentOverview className="mt-6" depts={["iqc", "store"]} />
        </>
      )}

      {drill.host}
    </MotionConfig>
  )
}
