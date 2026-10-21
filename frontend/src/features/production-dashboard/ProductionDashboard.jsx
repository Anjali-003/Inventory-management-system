import { useCallback, useMemo, useState } from "react"
import { Factory, RefreshCw } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HeroButton, MktHero } from "@/features/marketing-orders/mktKit"
import { Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import MaterialCheckModal from "@/features/orders/components/MaterialCheckModal"
import StartProductionModal from "@/features/orders/components/StartProductionModal"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { errorMessage } from "@/lib/stock"
import ProductionOverviewCards from "@/features/production-dashboard/components/ProductionOverviewCards"
import ProductionWorkQueue from "@/features/production-dashboard/components/ProductionWorkQueue"
import MaterialShortagesPanel from "@/features/production-dashboard/components/MaterialShortagesPanel"
import ProductionProgressPanel from "@/features/production-dashboard/components/ProductionProgressPanel"
import StockWatchPanel from "@/features/production-dashboard/components/StockWatchPanel"
import RecentProductionActivity from "@/features/production-dashboard/components/RecentProductionActivity"
import { toProductionOrder, inProduction, isStartable } from "@/features/production-dashboard/productionDashboardUtils"
import { InteractiveBarChart, InteractiveDonutChart } from "@/features/dashboard/components/InteractiveDashboardCharts"

const PRODUCTION_CHART_CATEGORIES = [
  { key: "active", label: "In production", color: "#3478d4", to: "/production" },
  { key: "ready", label: "Ready to start", color: "#0d9488", to: "/production" },
  { key: "completed", label: "Production complete", color: "#15966b", to: "/quality-control" },
  { key: "shortage", label: "Material shortage", color: "#e87927", to: "/inventory?filter=low" },
  { key: "rework", label: "Rework needed / underway", color: "#dc4545", to: "/qc-failed" },
  { key: "retest", label: "Ready for QC retest", color: "#8358c9", to: "/qc-failed" },
  { key: "review", label: "Waiting for review", color: "#d1a025", to: "/production" },
]

function productionCategory(item) {
  if (item.rework_status === "READY_FOR_QC") return "retest"
  if (item.qc_decision === "FAIL" || ["IN_PROGRESS", "NEEDS_REWORK"].includes(item.rework_status)) return "rework"
  if (item.status === "COMPLETED") return "completed"
  if (item.status === "IN_PRODUCTION" && inProduction(item) > 0) return "active"
  if (isStartable(item) && item.material_status === "SHORTAGE") return "shortage"
  if (isStartable(item) && item.material_status === "COVERED") return "ready"
  return "review"
}

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function productionMilestones(items, days) {
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
      values: { started: 0, completed: 0 },
      details: [],
    }
  })
  const byDate = new Map(points.map((point) => [point.isoDate, point]))

  items.forEach((item) => {
    const identity = item.id ?? item.order_item_id ?? item.order_number
    const addMilestone = (timestamp, key, label, color, subtitle) => {
      if (!timestamp) return
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) return
      const point = byDate.get(dateKey(date))
      if (!point) return
      point.values[key] += 1
      point.details.push({
        id: `${identity}-${key}`,
        title: item.order_number || `Production batch #${identity}`,
        subtitle: `${label} · ${item.product_name || "Product unavailable"}${subtitle ? ` · ${subtitle}` : ""}`,
        color,
        to: "/production",
      })
    }
    addMilestone(item.started_at, "started", "Started", "#3478d4")
    addMilestone(item.completed_at, "completed", "Completed", "#15966b", `${Number(item.quantity_completed || 0).toLocaleString()} units`)
  })
  return points
}

export default function ProductionDashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: user } = useGetMeQuery()
  const productionQuery = useGetProductionQuery()
  const inventoryQuery = useGetInventoryQuery("active")
  const [checkFor, setCheckFor] = useState(null)
  const [startFor, setStartFor] = useState(null)

  const production = Array.isArray(productionQuery.data) ? productionQuery.data : []
  const inventory = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : []
  const productionLoading = productionQuery.isLoading
  const inventoryLoading = inventoryQuery.isLoading
  const statusChartItems = useMemo(() => {
    const counts = new Map(PRODUCTION_CHART_CATEGORIES.map((category) => [category.key, 0]))
    production.forEach((item) => {
      const key = productionCategory(item)
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return PRODUCTION_CHART_CATEGORIES.map((category) => ({ ...category, value: counts.get(category.key) || 0 }))
  }, [production])
  const trendData = useMemo(() => ({
    7: productionMilestones(production, 7),
    30: productionMilestones(production, 30),
  }), [production])

  const refresh = useCallback(async () => {
    await Promise.allSettled([productionQuery.refetch(), inventoryQuery.refetch()])
  }, [productionQuery.refetch, inventoryQuery.refetch])

  const handleStarted = async (quantity, orderNumber) => {
    setStartFor(null)
    toast.success(`${quantity} unit(s) started for ${orderNumber}`)
    await refresh()
  }

  const startFromCheck = (order) => {
    setCheckFor(null)
    setStartFor(order)
  }

  const productionError = productionQuery.error
    ? errorMessage(productionQuery.error, "Could not load production tasks.")
    : ""
  const inventoryError = inventoryQuery.error
    ? errorMessage(inventoryQuery.error, "Could not load inventory stock levels.")
    : ""

  return (
    <>
      <MktHero
        eyebrow="Production dashboard"
        title={user?.name ? `Hello, ${user.name}` : "Production overview"}
        description="See what is running, what is blocked by missing materials, and which batches need a correction or QC retest."
      >
        <HeroButton onClick={() => navigate("/production")}><Factory /> Open production</HeroButton>
        <HeroButton variant="glass" onClick={refresh} disabled={productionQuery.isFetching || inventoryQuery.isFetching}>
          <RefreshCw className={productionQuery.isFetching || inventoryQuery.isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {productionError && <div className="mb-4"><Notice title="Production data unavailable">{productionError}</Notice></div>}
      {inventoryError && <div className="mb-4"><Notice title="Inventory data unavailable">{inventoryError}</Notice></div>}

      <ProductionOverviewCards items={production} loading={productionLoading} />

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        <InteractiveDonutChart
          title="Production status"
          description="How each product batch is progressing. Select a category to open the related workspace."
          items={statusChartItems}
          loading={productionLoading}
          emptyLabel="Production batches will appear here when orders are available."
        />
        <InteractiveBarChart
          title="Production milestones"
          description="Recorded batch starts and completions by day. Select a bar to see the batches behind it."
          dataByPeriod={trendData}
          series={[
            { key: "started", label: "Batches started", color: "#3478d4" },
            { key: "completed", label: "Batches completed", color: "#15966b" },
          ]}
          loading={productionLoading}
          emptyLabel="No starts or completions were recorded on this date."
        />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ProductionWorkQueue
            items={production}
            loading={productionLoading}
            onCheck={(item) => setCheckFor(toProductionOrder(item))}
            onStart={(item) => setStartFor(toProductionOrder(item))}
          />
        </div>
        <div className="min-w-0">
          <MaterialShortagesPanel
            items={production}
            loading={productionLoading}
            onCheck={(item) => setCheckFor(toProductionOrder(item))}
          />
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ProductionProgressPanel items={production} loading={productionLoading} />
        </div>
        <div className="min-w-0">
          <StockWatchPanel items={inventory} loading={inventoryLoading} />
        </div>
      </div>

      <div className="mt-4">
        <RecentProductionActivity items={production} loading={productionLoading} />
      </div>

      {checkFor && (
        <MaterialCheckModal
          order={checkFor}
          onClose={() => setCheckFor(null)}
          onStart={startFromCheck}
          partialProduction
        />
      )}
      {startFor && (
        <StartProductionModal
          order={startFor}
          onClose={() => setStartFor(null)}
          onStarted={handleStarted}
        />
      )}
    </>
  )
}
