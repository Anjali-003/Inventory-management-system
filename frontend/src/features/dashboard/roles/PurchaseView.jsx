import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ClipboardList, FlaskConical, PackageSearch, ShoppingCart, XCircle } from "lucide-react"
import { pageButtonClass } from "@/components/PageKit"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { stockState } from "@/features/inventory/components/StockBadge"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { plural } from "@/features/marketing-orders/orderParts"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { countPurchases, purchaseHref } from "@/features/purchasing/purchaseKit"
import { Greeting, StatRow, useDrill } from "../DashboardKit"
import DepartmentOverview, { shortageOf } from "../DepartmentOverview"
import UrgentPurchaseSection from "../UrgentPurchaseSection"
import IqcRejectionsSection from "../IqcRejectionsSection"
import WaitingForYou from "@/features/dashboard/WaitingForYou"

const EMPTY = []

/* Plain-language line under "Hello": only what still has to be bought. */
const nudge = (orders) => (orders ? `${plural(orders, "approved customer order")} with components to buy.` : "No components pending purchase.")

export default function PurchaseView() {
  const drill = useDrill()
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

  const stats = [
    canOrders && { label: "Components to buy", value: d.requirementLines, icon: ClipboardList, tone: d.requirementLines ? "amber" : "green", loading,
      detail: d.requirementLines ? `For ${plural(d.needs.length, "approved order")}` : "Nothing to buy", to: "/purchase-requests" },
    { label: "Low stock", value: d.lowStock, icon: PackageSearch, tone: d.lowStock ? "amber" : "green", loading: inv.isLoading, detail: "At or below the minimum", to: "/inventory?filter=low" },
    { label: "Out of stock", value: d.outStock, icon: XCircle, tone: d.outStock ? "red" : "green", loading: inv.isLoading, detail: d.outStock ? "Nothing left in the Store" : "Every part in stock", to: "/inventory?filter=out" },
    { label: "With IQC", value: d.counts.PENDING_IQC, icon: FlaskConical, tone: "blue", loading, detail: "Waiting for inspection", to: purchaseHref("PENDING_IQC") },
    { label: "IQC rejected", value: d.rejCount, icon: XCircle, tone: d.rejCount ? "red" : "green", loading, detail: d.rejCount ? "Defective lots to return" : "Nothing rejected", to: purchaseHref("REJECTED") },
  ]

  const pending = d.needs.length

  return (
    <>
      <Greeting description={canOrders ? nudge(pending) : "Purchases and supplier deliveries."}>
        {/* the purchase manager's way into one combined order for every pending request */}
        <Link to={canOrders ? "/purchase-requests" : "/purchase"} className={pageButtonClass("primary")}>
          <ShoppingCart /> {canOrders ? `Purchase requests${pending ? ` (${pending})` : ""}` : "Open purchase"}
        </Link>
      </Greeting>

      <StatRow drill={drill} stats={stats} />
      <WaitingForYou className="mt-4" />

      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Urgent Purchase Requirements: nearest delivery first, components to buy shown inline */}
          {canOrders && (
            <UrgentPurchaseSection orders={orders} canRaise={canRaise} />
          )}

          {/* IQC Rejected Components with rejection reason & slip download */}
          <IqcRejectionsSection purchases={buys.data ?? EMPTY} />

          {/* Department overview (read-only); each card opens that department's main dashboard */}
          <DepartmentOverview className="mt-4" depts={["iqc", "store"]} />
        </>
      )}

      {drill.host}
    </>
  )
}
