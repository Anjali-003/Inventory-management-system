import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowRight, ClipboardList, PackageCheck, Truck, Warehouse } from "lucide-react"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetIncomingStockQuery } from "@/features/purchasing/purchasingApi"
import { useGetMaterialRequestsQuery } from "@/features/material-requests/materialRequestsApi"
import { Button } from "@/components/ui/button"
import DepartmentOverview from "../DepartmentOverview"
import { Greeting, ListPanel, StatRow, useDrill } from "../DashboardKit"
import { finishedRow, incomingRow, stockRow } from "../rows"

const EMPTY = []

/* readOnly: shown to another role (e.g. Purchase Manager) from its Department Overview; hides the "issue components" actions. */
export default function StoreView({ readOnly = false }) {
  const drill = useDrill()
  const navigate = useNavigate()
  const inv = useGetInventoryQuery("active")
  const fg = useGetFinishedGoodsQuery()
  const inc = useGetIncomingStockQuery()
  const requests = useGetMaterialRequestsQuery(undefined, { skip: readOnly })
  const pendingMaterialRequests = (requests.data ?? EMPTY).filter((request) => request.status !== "ISSUED")
  const loading = inv.isLoading || fg.isLoading || inc.isLoading || (!readOnly && requests.isLoading)

  const { low, waiting, packaging, dispatched } = useMemo(() => ({
    low: (inv.data ?? EMPTY).filter((i) => Number(i.available) <= Number(i.minimum_stock_level)).map(stockRow),
    waiting: (inc.data ?? EMPTY).filter((p) => p.status === "PENDING_STORE").map(incomingRow),
    packaging: (fg.data ?? EMPTY).filter((x) => x.status === "PACKAGING").map(finishedRow),
    dispatched: (fg.data ?? EMPTY).filter((x) => x.status === "DISPATCHED").map(finishedRow),
  }), [inv.data, fg.data, inc.data])

  return (
    <>
      <Greeting description="What is waiting for the store today." />
      {!readOnly && (
        <div className={`mb-4 overflow-hidden rounded-xl border ${pendingMaterialRequests.length ? "border-amber-300 bg-gradient-to-r from-amber-50 via-white to-emerald-50" : "border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50"}`}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${pendingMaterialRequests.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                <ClipboardList className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Production material requests</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {requests.isLoading ? "Checking material requests…" : pendingMaterialRequests.length
                    ? `${pendingMaterialRequests.length} request${pendingMaterialRequests.length === 1 ? " is" : "s are"} waiting for a full or partial allotment.`
                    : "No material requests are waiting. New requests from Production will appear here."}
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/store-material-requests")} className="shrink-0">
              Open Material Allotment <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <StatRow
        drill={drill}
        stats={[
          { label: "To accept into stock", value: waiting.length, icon: PackageCheck, tone: waiting.length ? "amber" : "green", loading, detail: "Approved by IQC", drill: { title: "Waiting to be accepted", description: "IQC approved these purchases. Accept them into stock.", rows: waiting, to: "/incoming-stock", toLabel: "Open Incoming Stock", empty: "Nothing waiting for the store" } },
          { label: "At or below minimum", value: low.length, icon: AlertTriangle, tone: low.length ? "amber" : "green", loading, detail: low.length ? "Needs reordering" : "All stocked up", drill: { title: "Components at or below minimum", rows: low, to: "/inventory?filter=low", toLabel: "Open Inventory", empty: "All components are above minimum" } },
          { label: "In packaging", value: packaging.length, icon: Warehouse, tone: "blue", loading, detail: "Ready to dispatch", drill: { title: "Finished goods in packaging", rows: packaging, to: "/finished-goods", toLabel: "Open Finished Goods", empty: "No batch in packaging" } },
          { label: "Dispatched", value: dispatched.length, icon: Truck, tone: "violet", loading, detail: "Waiting to be completed", drill: { title: "Dispatched batches", rows: dispatched, to: "/finished-goods", toLabel: "Open Finished Goods", empty: "No dispatched batch" } },
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
