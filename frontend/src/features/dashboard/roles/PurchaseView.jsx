import { useMemo } from "react"
import { MotionConfig } from "motion/react"
import { ClipboardList, FlaskConical, PackageSearch, ShoppingCart, XCircle } from "lucide-react"
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
import { useDrill } from "../DashboardKit"
import DepartmentOverview, { shortageOf } from "../DepartmentOverview"
import UrgentPurchaseSection from "../UrgentPurchaseSection"
import IqcRejectionsSection from "../IqcRejectionsSection"

const EMPTY = []

/* Plain-language line under "Hello": only what still has to be bought. */
const nudge = (orders) => (orders ? `${plural(orders, "approved customer order")} with components to buy.` : "No components pending purchase.")

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

export default function PurchaseView() {
  const drill = useDrill()
  const { data: me } = useGetMeQuery()
  const { canEdit, canView } = usePermissions()
  const canOrders = canView("approvedOrders") // an IQC / Store viewer cannot read approved orders: those figures are left out
  const canRaise = canEdit("purchase")
  const ord = useGetApprovedOrdersQuery(undefined, { skip: !canOrders })
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery()
  const loading = (canOrders && ord.isLoading) || buys.isLoading

  const orders = ord.data ?? EMPTY

  const d = useMemo(() => {
    const buyList = buys.data ?? EMPTY
    const needs = orders.filter((o) => shortageOf(o).length > 0)
    const stock = Array.isArray(inv.data) ? inv.data : EMPTY

    // Count rejected components
    let rejCount = 0
    buyList.forEach((p) => {
      const rejs = (p.items || []).filter((i) => i.iqc_decision === "REJECTED")
      if (rejs.length > 0) rejCount += rejs.length
      else if (p.status === "REJECTED") rejCount += 1
    })

    return {
      lowStock: stock.filter((i) => stockState(i) === "low").length,
      outStock: stock.filter((i) => stockState(i) === "out").length,
      requirementLines: needs.reduce((sum, o) => sum + shortageOf(o).length, 0),
      counts: countPurchases(buyList),
      needs,
      rejCount,
    }
  }, [orders, buys.data, inv.data])

  const tiles = [
    { key: "low", stage: tile("Low Stock", PackageSearch, "At or below minimum", d.lowStock ? "amber" : "green"), value: d.lowStock, to: "/inventory?filter=low", loading: inv.isLoading },
    { key: "out", stage: tile("Out of Stock", XCircle, "Nothing available", d.outStock ? "rose" : "green"), value: d.outStock, to: "/inventory?filter=out", loading: inv.isLoading },
    canOrders && { key: "req", stage: tile("Purchase Requirements", ClipboardList, "Component lines to order", d.requirementLines ? "amber" : "green"), value: d.requirementLines, to: "/approved-orders?state=TO_ORDER" },
    { key: "iqcstatus", stage: tile("With IQC", FlaskConical, "Awaiting inspection", d.counts.PENDING_IQC ? "violet" : "green"), value: d.counts.PENDING_IQC, to: purchaseHref("PENDING_IQC") },
    { key: "rejected", stage: tile("IQC Rejected", XCircle, "Defective lots / returns", d.rejCount ? "rose" : "green"), value: d.rejCount, to: purchaseHref("REJECTED") },
  ]

  const pending = d.needs.length

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Purchase dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={canOrders ? nudge(pending) : "Purchases and supplier deliveries."}>
        <HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to="/purchase"><ShoppingCart /> Open purchase</HeroLink>
      </MktHero>

      <PurchaseTileGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.filter(Boolean).map((t) => (
          <PurchaseTile key={t.key} solid stage={t.stage} value={t.value} loading={t.loading ?? loading} to={t.to} />
        ))}
      </PurchaseTileGrid>

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Urgent Purchase Requirements: nearest delivery first, components to buy shown inline */}
          {canOrders && (
            <UrgentPurchaseSection orders={orders} canRaise={canRaise} />
          )}

          {/* IQC Rejected Components with rejection reason & slip download */}
          <IqcRejectionsSection purchases={buys.data ?? EMPTY} />

          {/* Department overview (read-only); each card opens that department's main dashboard */}
          <DepartmentOverview className="mt-6" depts={["iqc", "store"]} />
        </>
      )}

      {drill.host}
    </MotionConfig>
  )
}
