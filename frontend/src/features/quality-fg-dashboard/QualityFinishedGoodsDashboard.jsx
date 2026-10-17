import { useCallback, useMemo } from "react"
import { ClipboardCheck, Factory, PackageCheck, RefreshCw, RotateCcw, Truck, XCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HeroButton, MktHero, MktBtn } from "@/features/marketing-orders/mktKit"
import { Notice } from "@/components/feedback"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { errorMessage } from "@/lib/stock"
import DashboardMetricCard from "@/features/quality-fg-dashboard/components/DashboardMetricCard"
import QualityWorkQueue from "@/features/quality-fg-dashboard/components/QualityWorkQueue"
import FinishedGoodsPipeline from "@/features/quality-fg-dashboard/components/FinishedGoodsPipeline"
import ProductionReadOnlyPanel from "@/features/quality-fg-dashboard/components/ProductionReadOnlyPanel"
import { countFinishedGoods, getQcPendingBatches, getQcFailedBatches, getQcReadyForRetest } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

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
  const qcRetestCount = useMemo(() => getQcReadyForRetest(qcItems).length, [qcItems])
  const packagingCount = useMemo(() => countFinishedGoods(finishedItems, "PACKAGING"), [finishedItems])
  const dispatchedCount = useMemo(() => countFinishedGoods(finishedItems, "DISPATCHED"), [finishedItems])

  return (
    <>
      <MktHero
        eyebrow="Quality & release dashboard"
        title={user?.name ? `Hello, ${user.name}` : "Quality & Finished Goods"}
        description="See which completed batches need a QC decision, which batches need correction, and which finished goods need to move forward."
      >
        <HeroButton onClick={() => navigate("/quality-control")}><ClipboardCheck /> Open Quality Control</HeroButton>
        <HeroButton variant="glass" onClick={() => navigate("/finished-goods")}><PackageCheck /> Open Finished Goods</HeroButton>
        <HeroButton variant="glass" onClick={refresh} disabled={qcQuery.isFetching || finishedQuery.isFetching || productionQuery.isFetching}>
          <RefreshCw className={qcQuery.isFetching || finishedQuery.isFetching || productionQuery.isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {(qcError || finishedError || productionError) && (
        <div className="mb-4 space-y-2">
          {qcError && <Notice title="Quality Control data unavailable">{qcError}</Notice>}
          {finishedError && <Notice title="Finished Goods data unavailable">{finishedError}</Notice>}
          {productionError && <Notice title="Production preview unavailable">{productionError}</Notice>}
        </div>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard index={0} to="/quality-control" icon={ClipboardCheck} tone={qcPendingCount ? "amber" : "green"} label="Pending QC decisions" value={qcPendingCount} loading={qcQuery.isLoading} detail="Fully completed batches awaiting Pass / Fail" />
        <DashboardMetricCard index={1} to="/qc-failed" icon={XCircle} tone={qcFailedCount ? "red" : "green"} label="Failed / needs correction" value={qcFailedCount} loading={qcQuery.isLoading} detail="Open QC Failed to record the repair" />
        <DashboardMetricCard index={2} to="/qc-failed" icon={RotateCcw} tone={qcRetestCount ? "blue" : "green"} label="Ready for QC retest" value={qcRetestCount} loading={qcQuery.isLoading} detail="Open QC Failed to review submitted repairs" />
        <DashboardMetricCard index={3} to="/finished-goods" icon={PackageCheck} tone={packagingCount ? "amber" : "green"} label="Packaging queue" value={packagingCount} loading={finishedQuery.isLoading} detail="Passed QC and ready to dispatch" />
        <DashboardMetricCard index={4} to="/finished-goods" icon={Truck} tone={dispatchedCount ? "blue" : "green"} label="Dispatched batches" value={dispatchedCount} loading={finishedQuery.isLoading} detail="Waiting for final completion" />
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
        <div className="min-w-0 rounded-2xl border border-[#dce5e0] bg-gradient-to-br from-white via-white to-slate-50/80 p-5 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
          <h2 className="flex items-center gap-2.5 text-sm font-bold before:h-4 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-emerald-400 before:to-primary">What should I do next?</h2>
          <p className="mt-1 pl-[13px] text-xs leading-relaxed text-muted-foreground">Choose the task that matches the batch status. Each button opens the right workspace.</p>
          <div className="mt-4 grid gap-2">
            <MktBtn variant="primary" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/quality-control")}><ClipboardCheck /> Decide whether completed batches Pass or Fail</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/qc-failed")}><XCircle /> Record a correction for a failed batch</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/finished-goods")}><PackageCheck /> Move packed goods to dispatch or completion</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/production")}><Factory /> Check production progress (view only)</MktBtn>
          </div>
          <p className="mt-4 rounded-xl border border-[#dce5e0] bg-slate-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-600">A batch enters Finished Goods only after it passes QC. A failed batch stays in QC Failed until the repair is submitted for another QC decision.</p>
        </div>
      </div>
    </>
  )
}

