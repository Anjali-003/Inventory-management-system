import { useCallback, useState } from "react"
import { RefreshCw } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageHeader from "@/components/PageHeader"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
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
import { toProductionOrder } from "@/features/production-dashboard/productionDashboardUtils"

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
      <PageHeader
        title={user?.name ? `Hello, ${user.name}` : "Production dashboard"}
        description="Today's production priorities, material readiness and work progress."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/production")}>
            Open production
          </Button>
          <Button variant="outline" onClick={refresh} disabled={productionQuery.isFetching || inventoryQuery.isFetching}>
            <RefreshCw className={productionQuery.isFetching || inventoryQuery.isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </PageHeader>

      {productionError && <div className="mb-4"><Notice title="Production data unavailable">{productionError}</Notice></div>}
      {inventoryError && <div className="mb-4"><Notice title="Inventory data unavailable">{inventoryError}</Notice></div>}

      <ProductionOverviewCards items={production} loading={productionLoading} />

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
