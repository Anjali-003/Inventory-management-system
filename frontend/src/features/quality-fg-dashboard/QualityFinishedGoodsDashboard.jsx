import { useCallback, useMemo } from "react"
import { ClipboardCheck, Factory, PackageCheck, RefreshCw, RotateCcw, Truck, XCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HeroButton, MktHero, MktBtn } from "@/components/saturday/kit"
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
import { InteractiveBarChart, InteractiveDonutChart } from "@/features/dashboard/components/InteractiveDashboardCharts"
import { countFinishedGoods, getQcPendingBatches, getQcFailedBatches, getQcReadyForRetest } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

const asArray = (value) => Array.isArray(value) ? value : []

const QC_CHART_CATEGORIES = [
  { key: "pending", label: "Awaiting first QC", color: "#3478d4", to: "/quality-control" },
  { key: "passed", label: "Passed QC", color: "#15966b", to: "/quality-control" },
  { key: "failed", label: "Failed / correction", color: "#dc4545", to: "/qc-failed" },
  { key: "retest", label: "Ready for retest", color: "#8358c9", to: "/qc-failed" },
]

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function qcDecisionTrend(items, days) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - index - 1))
    const isoDate = dateKey(date)
    return {
      key: isoDate,
      isoDate,
      label: days === 7
        ? date.toLocaleDateString(undefined, { weekday: "short" })
        : date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      showLabel: days === 7 || index % 5 === 0 || index === days - 1,
      fullLabel: date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      values: { passed: 0, failed: 0 },
      details: [],
    }
  })
  const byDate = new Map(points.map((point) => [point.isoDate, point]))

  items.forEach((item) => {
    const decisionHistory = item.decisionHistory || []
    decisionHistory.forEach((decision) => {
      if (!decision.decidedAt) return
      const date = new Date(decision.decidedAt)
      if (Number.isNaN(date.getTime())) return
      const point = byDate.get(dateKey(date))
      if (!point) return
      const outcome = String(decision.decision || "").toUpperCase()
      if (outcome !== "PASS" && outcome !== "FAIL") return
      const key = outcome === "PASS" ? "passed" : "failed"
      const color = outcome === "PASS" ? "#15966b" : "#dc4545"
      point.values[key] += 1
      point.details.push({
        id: `${item.id}-${decision.id}`,
        title: item.orderNumber || `Production batch #${item.id}`,
        subtitle: `${outcome} · Attempt ${Number(decision.attemptNumber || 1)} · ${item.productName || "Product unavailable"}${decision.remarks ? ` · ${decision.remarks}` : ""}`,
        color,
        to: outcome === "FAIL" ? "/qc-failed" : "/quality-control",
      })
    })
  })
  return points
}

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
  const qcChartItems = useMemo(() => {
    const retestItems = getQcReadyForRetest(qcItems)
    const failedItems = getQcFailedBatches(qcItems)
    const passedItems = qcItems.filter((item) => item.batchDecision === "PASS")
    const pendingItems = getQcPendingBatches(qcItems).filter((item) => item.latestDecision !== "FAIL")
    const values = {
      pending: pendingItems.length,
      passed: passedItems.length,
      failed: failedItems.length,
      retest: retestItems.length,
    }
    return QC_CHART_CATEGORIES.map((category) => ({ ...category, value: values[category.key] || 0 }))
  }, [qcItems])
  const qcTrendData = useMemo(() => ({
    7: qcDecisionTrend(qcItems, 7),
    30: qcDecisionTrend(qcItems, 30),
  }), [qcItems])

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

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <InteractiveDonutChart
          title="QC decision status"
          description="See batches awaiting a first decision, passed batches, failures and retests. Select a category to open its records."
          items={qcChartItems}
          loading={qcQuery.isLoading}
          emptyLabel="Completed production batches will appear here when QC data is available."
        />
        <InteractiveBarChart
          title="QC decisions over time"
          description="Recorded Pass and Fail decisions from inspection history. Select a date to review the decisions made."
          dataByPeriod={qcTrendData}
          series={[
            { key: "passed", label: "Passed decisions", color: "#15966b" },
            { key: "failed", label: "Failed decisions", color: "#dc4545" },
          ]}
          loading={qcQuery.isLoading}
          emptyLabel="No QC decisions were recorded on this date."
        />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
        <div className="min-w-0 rounded-2xl border border-[#E3E6EB] bg-gradient-to-br from-white via-white to-slate-50/80 p-5 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
          <h2 className="flex items-center gap-2.5 text-sm font-bold before:h-4 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-emerald-700 before:to-primary">What should I do next?</h2>
          <p className="mt-1 pl-[13px] text-xs leading-relaxed text-muted-foreground">Choose the task that matches the batch status. Each button opens the right workspace.</p>
          <div className="mt-4 grid gap-2">
            <MktBtn variant="primary" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/quality-control")}><ClipboardCheck /> Decide whether completed batches Pass or Fail</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/qc-failed")}><XCircle /> Record a correction for a failed batch</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/finished-goods")}><PackageCheck /> Move packed goods to dispatch or completion</MktBtn>
            <MktBtn variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left sm:h-auto" onClick={() => navigate("/production")}><Factory /> Check production progress (view only)</MktBtn>
          </div>
          <p className="mt-4 rounded-xl border border-[#E3E6EB] bg-slate-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-600">A batch enters Finished Goods only after it passes QC. A failed batch stays in QC Failed until the repair is submitted for another QC decision.</p>
        </div>
      </div>
    </>
  )
}

