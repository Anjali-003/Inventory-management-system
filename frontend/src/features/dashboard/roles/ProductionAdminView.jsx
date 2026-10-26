import { useCallback, useMemo } from "react"
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Warehouse,
  XCircle,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HeroButton, MktHero } from "@/features/marketing-orders/mktKit"
import { Notice } from "@/components/feedback"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { stockState } from "@/features/inventory/components/StockBadge"
import { useGetProductionQuery, useGetQCFailedQuery } from "@/features/production/productionApi"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { errorMessage } from "@/lib/stock"
import DashboardMetricCard from "@/features/quality-fg-dashboard/components/DashboardMetricCard"
import { InteractiveDonutChart } from "@/features/dashboard/components/InteractiveDashboardCharts"
import {
  getActiveProduction,
  getAwaitingAllotmentCount,
} from "@/features/production-dashboard/productionDashboardUtils"
import {
  getQcPendingBatches,
  getQcReadyForRetest,
  countFinishedGoods,
} from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"
import {
  isApprovedForProduction,
  isProductionCompleted,
  readyToStartQuantity,
} from "@/features/production/productionWorkflow"
import WaitingForYou from "@/features/dashboard/WaitingForYou"

const asArray = (value) => Array.isArray(value) ? value : []

/** Overview shared across Production, QC, Finished Goods, and component stock. */
export default function ProductionAdminView() {
  const navigate = useNavigate()
  const { data: user } = useGetMeQuery()
  const production = useGetProductionQuery()
  const qc = useGetQualityControlQuery()
  const qcFailed = useGetQCFailedQuery()
  const finishedGoods = useGetFinishedGoodsQuery()
  const inventory = useGetInventoryQuery()

  const productionItems = asArray(production.data)
  const qcItems = asArray(qc.data)
  const failedItems = asArray(qcFailed.data)
  const finishedItems = asArray(finishedGoods.data)
  const inventoryItems = asArray(inventory.data)

  const refresh = useCallback(() => {
    return Promise.allSettled([
      production.refetch(),
      qc.refetch(),
      qcFailed.refetch(),
      finishedGoods.refetch(),
      inventory.refetch(),
    ])
  }, [production.refetch, qc.refetch, qcFailed.refetch, finishedGoods.refetch, inventory.refetch])

  const metrics = useMemo(() => {
    const active = getActiveProduction(productionItems).length
    const awaitingAllotment = getAwaitingAllotmentCount(productionItems)
    const readyToStart = productionItems.filter((item) =>
      !isProductionCompleted(item) && isApprovedForProduction(item) && readyToStartQuantity(item) > 0,
    ).length
    const pendingQc = getQcPendingBatches(qcItems).length
    const readyForRetest = getQcReadyForRetest(qcItems).length
    const lowStock = inventoryItems.filter((item) => ["low", "out"].includes(stockState(item))).length
    return {
      active,
      awaitingAllotment,
      readyToStart,
      pendingQc,
      failed: failedItems.length,
      readyForRetest,
      toPack: countFinishedGoods(finishedItems, "PACKAGING"),
      packed: countFinishedGoods(finishedItems, "PACKED"),
      lowStock,
    }
  }, [productionItems, qcItems, failedItems, finishedItems, inventoryItems])

  const chartItems = useMemo(() => [
    { key: "awaiting", label: "Awaiting material allotment", value: metrics.awaitingAllotment, color: "#e87927", to: "/production" },
    { key: "ready", label: "Ready to start", value: metrics.readyToStart, color: "#0d9488", to: "/production" },
    { key: "active", label: "In production", value: metrics.active, color: "#3478d4", to: "/production" },
    { key: "qc", label: "Awaiting QC", value: metrics.pendingQc, color: "#8358c9", to: "/quality-control" },
    { key: "failed", label: "QC failed / rework", value: metrics.failed, color: "#dc4545", to: "/qc-failed" },
    { key: "pack", label: "Ready for packing", value: metrics.toPack, color: "#15966b", to: "/finished-goods" },
    { key: "stock", label: "Low / out of stock", value: metrics.lowStock, color: "#d1a025", to: "/inventory" },
  ], [metrics])

  const loading = production.isLoading || qc.isLoading || qcFailed.isLoading || finishedGoods.isLoading || inventory.isLoading
  const errors = [
    production.error && ["Production", errorMessage(production.error, "Could not load production data.")],
    qc.error && ["Quality Control", errorMessage(qc.error, "Could not load QC data.")],
    qcFailed.error && ["QC Failed", errorMessage(qcFailed.error, "Could not load rework data.")],
    finishedGoods.error && ["Finished Goods", errorMessage(finishedGoods.error, "Could not load Finished Goods data.")],
    inventory.error && ["Inventory", errorMessage(inventory.error, "Could not load inventory data.")],
  ].filter(Boolean)
  const refreshing = production.isFetching || qc.isFetching || qcFailed.isFetching || finishedGoods.isFetching || inventory.isFetching

  return (
    <>
      <MktHero
        eyebrow="Production Admin dashboard"
        title={user?.name ? `Hello, ${user.name}` : "Production Admin"}
        description="One overview for production progress, quality decisions, finished goods and component stock."
      >
        <HeroButton onClick={() => navigate("/production")}><Factory /> Production</HeroButton>
        <HeroButton variant="glass" onClick={() => navigate("/quality-control")}><ClipboardCheck /> Quality Control</HeroButton>
        <HeroButton variant="glass" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>
      <WaitingForYou className="mb-4" />

      {errors.length > 0 && (
        <div className="mb-4 space-y-2">
          {errors.map(([title, message]) => <Notice key={title} title={`${title} data unavailable`}>{message}</Notice>)}
        </div>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardMetricCard index={0} to="/production" icon={Factory} tone="blue" label="Active production" value={metrics.active} loading={loading} detail="Runs currently being built" />
        <DashboardMetricCard index={1} to="/production" icon={PackagePlus} tone={metrics.awaitingAllotment ? "amber" : "green"} label="Awaiting material allotment" value={metrics.awaitingAllotment} loading={loading} detail="Product lines still waiting for Store" />
        <DashboardMetricCard index={2} to="/production" icon={CheckCircle2} tone="green" label="Ready to start" value={metrics.readyToStart} loading={loading} detail="Materials have been allotted" />
        <DashboardMetricCard index={3} to="/quality-control" icon={ClipboardCheck} tone={metrics.pendingQc ? "blue" : "green"} label="Awaiting QC" value={metrics.pendingQc} loading={loading} detail="Completed batches needing a decision" />
        <DashboardMetricCard index={4} to="/qc-failed" icon={RotateCcw} tone={metrics.failed || metrics.readyForRetest ? "red" : "green"} label="QC failed / retest" value={metrics.failed + metrics.readyForRetest} loading={loading} detail={`${metrics.failed} failed · ${metrics.readyForRetest} ready for retest`} />
        <DashboardMetricCard index={5} to="/finished-goods" icon={PackageCheck} tone={metrics.toPack ? "amber" : "green"} label="Ready for packing" value={metrics.toPack} loading={loading} detail={`${metrics.packed} already packed`} />
        <DashboardMetricCard index={6} to="/inventory" icon={Boxes} tone={metrics.lowStock ? "red" : "green"} label="Low / out of stock" value={metrics.lowStock} loading={loading} detail="Review component balances" />
      </div>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
        <InteractiveDonutChart
          title="Work across departments"
          description="Select a category to open its live queue. Counts are current work items, not unique orders."
          items={chartItems}
          loading={loading}
          emptyLabel="There are no active work items in these queues right now."
        />

        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E3E6EB] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
          <div className="border-b bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-5 py-4">
            <h2 className="font-bold tracking-tight">Quick actions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Jump directly to the work that needs attention.</p>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            <button type="button" onClick={() => navigate("/production")} className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Factory className="size-5" /></span>
              <span><span className="block text-sm font-semibold">Manage production</span><span className="block text-xs text-muted-foreground">Material requests and production updates</span></span>
            </button>
            <button type="button" onClick={() => navigate("/quality-control")} className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800"><ClipboardCheck className="size-5" /></span>
              <span><span className="block text-sm font-semibold">Quality Control</span><span className="block text-xs text-muted-foreground">Record quality decisions</span></span>
            </button>
            <button type="button" onClick={() => navigate("/qc-failed")} className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-800"><XCircle className="size-5" /></span>
              <span><span className="block text-sm font-semibold">QC failed / retest</span><span className="block text-xs text-muted-foreground">Track corrections and retesting</span></span>
            </button>
            <button type="button" onClick={() => navigate("/finished-goods")} className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800"><PackageCheck className="size-5" /></span>
              <span><span className="block text-sm font-semibold">Finished Goods</span><span className="block text-xs text-muted-foreground">Packing, handover and dispatch</span></span>
            </button>
            <button type="button" onClick={() => navigate("/inventory")} className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:col-span-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Warehouse className="size-5" /></span>
              <span><span className="block text-sm font-semibold">Component inventory</span><span className="block text-xs text-muted-foreground">Review and update component stock</span></span>
              <AlertTriangle className="ml-auto size-4 text-amber-700" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
