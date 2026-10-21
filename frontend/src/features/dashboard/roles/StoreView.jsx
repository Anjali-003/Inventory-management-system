import { useMemo } from "react"
import { AlertTriangle, PackageCheck, Truck, Warehouse } from "lucide-react"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetIncomingStockQuery } from "@/features/purchasing/purchasingApi"
import IssueComponentsPanel from "@/features/notifications/IssueComponentsPanel"
import DepartmentOverview from "../DepartmentOverview"
import { Greeting, ListPanel, StatRow, useDrill } from "../DashboardKit"
import { finishedRow, incomingRow, stockRow } from "../rows"

const EMPTY = []

/* readOnly: shown to another role (e.g. Purchase Manager) from its Department Overview; hides the "issue components" actions. */
export default function StoreView({ readOnly = false }) {
  const drill = useDrill()
  const inv = useGetInventoryQuery("active")
  const fg = useGetFinishedGoodsQuery()
  const inc = useGetIncomingStockQuery()
  const loading = inv.isLoading || fg.isLoading || inc.isLoading

  const { low, waiting, packaging, dispatched } = useMemo(() => ({
    low: (inv.data ?? EMPTY).filter((i) => Number(i.available) <= Number(i.minimum_stock_level)).map(stockRow),
    waiting: (inc.data ?? EMPTY).filter((p) => p.status === "PENDING_STORE").map(incomingRow),
    packaging: (fg.data ?? EMPTY).filter((x) => x.status === "PACKAGING").map(finishedRow),
    dispatched: (fg.data ?? EMPTY).filter((x) => x.status === "DISPATCHED").map(finishedRow),
  }), [inv.data, fg.data, inc.data])

  return (
    <>
      <Greeting description="What is waiting for the store today." />
      {!readOnly && <IssueComponentsPanel />}
      <StatRow
        drill={drill}
        stats={[
          { label: "To accept into stock", value: waiting.length, icon: PackageCheck, tone: waiting.length ? "amber" : "green", loading, detail: "Approved by IQC", to: "/store-status?status=ACCEPT" },
          { label: "At or below minimum", value: low.length, icon: AlertTriangle, tone: low.length ? "amber" : "green", loading, detail: low.length ? "Needs reordering" : "All stocked up", to: "/store-status?status=LOW" },
          { label: "In packaging", value: packaging.length, icon: Warehouse, tone: "blue", loading, detail: "Ready to dispatch", to: "/store-status?status=PACKAGING" },
          { label: "Dispatched", value: dispatched.length, icon: Truck, tone: "violet", loading, detail: "Waiting to be completed", to: "/store-status?status=DISPATCHED" },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListPanel drill={drill} loading={loading} title="Incoming stock to accept" description="IQC-approved purchases." rows={waiting} to="/incoming-stock" toLabel="Open Incoming Stock" emptyIcon={PackageCheck} empty="Nothing waiting for the store" />
        <ListPanel drill={drill} loading={loading} title="Components to reorder" description="Available stock is at or below the minimum." rows={low} to="/inventory?filter=low" toLabel="Open Inventory" emptyIcon={PackageCheck} empty="All components are above minimum" />
        <ListPanel drill={drill} loading={loading} className="lg:col-span-2" title="Finished goods in packaging" description="Mark them dispatched from the Finished Goods page." rows={packaging} to="/finished-goods" toLabel="Open Finished Goods" emptyIcon={Warehouse} empty="No batch in packaging" />
      </div>
      <DepartmentOverview className="mt-4" depts={["iqc", "purchase"]} />
      {drill.host}
    </>
  )
}
