import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShoppingCart, XCircle } from "lucide-react"
import { useGetOrderApprovalsQuery } from "@/features/order-approvals/orderApprovalsApi"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { Greeting, ListPanel, StatRow, useDrill } from "../DashboardKit"
import { orderRow, purchaseRow, stockRow } from "../rows"

const EMPTY = []

export default function OperationsView() {
  const drill = useDrill()
  const appr = useGetOrderApprovalsQuery()
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery("active")
  const loading = appr.isLoading || buys.isLoading || inv.isLoading

  const d = useMemo(() => {
    const orders = appr.data ?? EMPTY
    const rows = (s) => orders.filter((o) => o.approval_status === s).map(orderRow)
    return {
      pending: rows("PENDING_APPROVAL"),
      approved: rows("APPROVED"),
      rejected: rows("REJECTED"),
      inProgress: (buys.data ?? EMPTY).filter((p) => p.status !== "STORED" && p.status !== "REJECTED").map(purchaseRow),
      low: (inv.data ?? EMPTY).filter((i) => Number(i.available) <= Number(i.minimum_stock_level)).map(stockRow),
    }
  }, [appr.data, buys.data, inv.data])

  return (
    <>
      <Greeting description="Orders waiting for your decision, and how purchase and stock are doing." />
      <StatRow
        drill={drill}
        stats={[
          { label: "Waiting for approval", value: d.pending.length, icon: ClipboardCheck, tone: d.pending.length ? "amber" : "green", loading, detail: "Your queue", drill: { title: "Waiting for approval", description: "Open the Orders page to approve or reject.", rows: d.pending, to: "/order-approvals", toLabel: "Open Order Approvals", empty: "Nothing waiting for approval" } },
          { label: "Approved", value: d.approved.length, icon: CheckCircle2, tone: "green", loading, detail: "Sent on", drill: { title: "Approved orders", rows: d.approved, to: "/order-approvals", toLabel: "Open Order Approvals", empty: "No approved order yet" } },
          { label: "Purchases in progress", value: d.inProgress.length, icon: ShoppingCart, tone: "blue", loading, detail: "Not in stock yet", drill: { title: "Purchases in progress", rows: d.inProgress, to: "/purchase", toLabel: "Open Purchase", empty: "No purchase in progress" } },
          { label: "At or below minimum", value: d.low.length, icon: AlertTriangle, tone: d.low.length ? "amber" : "green", loading, detail: d.low.length ? "Needs reordering" : "All stocked up", drill: { title: "Components at or below minimum", rows: d.low, to: "/inventory?filter=low", toLabel: "Open Inventory", empty: "All components are above minimum" } },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListPanel drill={drill} loading={loading} title="Waiting for approval" description="Newest first." rows={d.pending} to="/order-approvals" toLabel="Open Order Approvals" emptyIcon={ClipboardCheck} empty="Nothing waiting for approval" />
        <ListPanel drill={drill} loading={loading} title="Purchases in progress" description="Where the missing components are." rows={d.inProgress} to="/purchase" toLabel="Open Purchase" emptyIcon={ShoppingCart} empty="No purchase in progress" />
        <ListPanel drill={drill} loading={loading} title="Rejected orders" description="With the reason you gave." rows={d.rejected} to="/order-approvals" toLabel="Open Order Approvals" emptyIcon={XCircle} empty="Nothing rejected" />
        <ListPanel drill={drill} loading={loading} title="Components to reorder" description="Available stock is at or below the minimum." rows={d.low} to="/inventory?filter=low" toLabel="Open Inventory" emptyIcon={CheckCircle2} empty="All components are above minimum" />
      </div>
      {drill.host}
    </>
  )
}
