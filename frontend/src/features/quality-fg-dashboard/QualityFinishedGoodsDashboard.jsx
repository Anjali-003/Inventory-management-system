import { useCallback, useMemo } from "react"
import { ClipboardCheck, Factory, PackageCheck, RefreshCw, Truck, XCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageHeader from "@/components/PageHeader"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { errorMessage } from "@/lib/stock"
import DashboardMetricCard from "@/features/quality-fg-dashboard/components/DashboardMetricCard"
import QualityWorkQueue from "@/features/quality-fg-dashboard/components/QualityWorkQueue"
import FinishedGoodsPipeline from "@/features/quality-fg-dashboard/components/FinishedGoodsPipeline"
import ProductionReadOnlyPanel from "@/features/quality-fg-dashboard/components/ProductionReadOnlyPanel"
import { countFinishedGoods, getQcPendingBatches, getQcFailedBatches } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

const asArray = (value) => Array.isArray(value) ? value : []

export default function QualityFinishedGoodsDashboard() {
  const navigate = useNavigate()
  const { data: user } = useGetMeQuery()
  const qcQuery = useGetQualityControlQuery()
  const finishedQuery = useGetFinishedGoodsQuery()
  const productionQuery = useGetProductionQuery()

  const qcItems = asArray(qcQuery.data)
  const finishedItems = asArray(finishedQuery.data)
  const productionItems = asArray(productionQuery.data)

  const refresh = useCallback(async () => {
    await Promise.allSettled([
      qcQuery.refetch(),
      finishedQuery.refetch(),
      productionQuery.refetch(),
    ])
  }, [qcQuery.refetch, finishedQuery.refetch, productionQuery.refetch])

  const qcError = qcQuery.error ? errorMessage(qcQuery.error, "Could not load Quality Control data.") : ""
  const finishedError = finishedQuery.error ? errorMessage(finishedQuery.error, "Could not load Finished Goods data.") : ""
  const productionError = productionQuery.error ? errorMessage(productionQuery.error, "Could not load read-only Production data.") : ""
  const qcPendingCount = useMemo(() => getQcPendingBatches(qcItems).length, [qcItems])
  const qcFailedCount = useMemo(() => getQcFailedBatches(qcItems).length, [qcItems])
  const packagingCount = useMemo(() => countFinishedGoods(finishedItems, "PACKAGING"), [finishedItems])
  const dispatchedCount = useMemo(() => countFinishedGoods(finishedItems, "DISPATCHED"), [finishedItems])

  return (
    <>
      <PageHeader
        title={user?.name ? `Hello, ${user.name}` : "Quality & Finished Goods dashboard"}
        description="Make one final QC decision for completed batches, manage Finished Goods, and view production progress."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/quality-control")}><ClipboardCheck /> Open Quality Control</Button>
          <Button variant="outline" onClick={() => navigate("/finished-goods")}><PackageCheck /> Open Finished Goods</Button>
          <Button variant="outline" onClick={refresh} disabled={qcQuery.isFetching || finishedQuery.isFetching || productionQuery.isFetching}>
            <RefreshCw className={qcQuery.isFetching || finishedQuery.isFetching || productionQuery.isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </PageHeader>

      {(qcError || finishedError || productionError) && (
        <div className="mb-4 space-y-2">
          {qcError && <Notice title="Quality Control data unavailable">{qcError}</Notice>}
          {finishedError && <Notice title="Finished Goods data unavailable">{finishedError}</Notice>}
          {productionError && <Notice title="Production preview unavailable">{productionError}</Notice>}
        </div>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard index={0} to="/quality-control" icon={ClipboardCheck} tone={qcPendingCount ? "amber" : "green"} label="Pending QC decisions" value={qcPendingCount} loading={qcQuery.isLoading} detail="Fully completed batches awaiting Pass / Fail" />
        <DashboardMetricCard index={1} to="/quality-control" icon={XCircle} tone={qcFailedCount ? "red" : "green"} label="Failed batches" value={qcFailedCount} loading={qcQuery.isLoading} detail="Held out of Finished Goods" />
        <DashboardMetricCard index={2} to="/finished-goods" icon={PackageCheck} tone={packagingCount ? "amber" : "green"} label="Packaging queue" value={packagingCount} loading={finishedQuery.isLoading} detail="Passed QC and ready to dispatch" />
        <DashboardMetricCard index={3} to="/finished-goods" icon={Truck} tone={dispatchedCount ? "blue" : "green"} label="Dispatched batches" value={dispatchedCount} loading={finishedQuery.isLoading} detail="Waiting for final completion" />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <QualityWorkQueue items={qcItems} loading={qcQuery.isLoading} onOpen={() => navigate("/quality-control")} />
        </div>
        <div className="min-w-0">
          <FinishedGoodsPipeline items={finishedItems} loading={finishedQuery.isLoading} />
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ProductionReadOnlyPanel items={productionItems} loading={productionQuery.isLoading} />
        </div>
        <div className="min-w-0 rounded-[14px] border border-[#dce5e0]/90 bg-gradient-to-br from-white via-white to-slate-50/80 p-5 shadow-[0_1px_2px_rgba(22,34,30,0.035),0_10px_28px_rgba(22,34,30,0.045)]">
          <h2 className="flex items-center gap-2.5 text-sm font-bold before:h-4 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-emerald-400 before:to-primary">Useful shortcuts</h2>
          <p className="mt-1 pl-[13px] text-xs text-muted-foreground">Only actions for your role.</p>
          <div className="mt-4 grid gap-2">
            <Button className="w-full justify-start" onClick={() => navigate("/quality-control")}><ClipboardCheck /> Review pending batches and decide Pass / Fail</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/finished-goods")}><PackageCheck /> Dispatch or complete a batch</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/production")}><Factory /> View production progress (read-only)</Button>
          </div>
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Production is view-only in this workspace. Starting production and updating quantities remain restricted to the Production role.</p>
        </div>
      </div>
    </>
  )
}

