import { useCallback, useMemo } from "react"
import { Activity, ClipboardCheck, Factory, PackageCheck, RefreshCw, RotateCcw, Truck } from "lucide-react"
import { Link } from "react-router-dom"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetProductionQuery, useGetQCFailedQuery } from "@/features/production/productionApi"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetActivityQuery } from "@/features/activity/activityApi"
import ActivityFeed from "@/features/activity/ActivityFeed"
import { getQcPendingBatches, getQcReadyForRetest } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"
import { isProductionCompleted } from "@/features/production/productionWorkflow"
import { errorMessage, fmtQty } from "@/lib/stock"
import { Notice, EmptyState } from "@/components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Greeting, StatRow, useDrill } from "@/features/dashboard/DashboardKit"

const EMPTY = []
const WORK_ACTIVITY_RESOURCES = new Set(["production", "quality-control", "qc-failed", "finished-goods"])
const arrayOf = (value) => Array.isArray(value) ? value : EMPTY
const activityTime = (item) => new Date(item.billedAt || item.createdAt || 0).getTime() || 0

/** Production Admin overview. Keeps the dashboard focused on the four workflow queues and dispatch readiness. */
export default function ProductionAdminView() {
  const { data: user } = useGetMeQuery()
  const production = useGetProductionQuery()
  const qc = useGetQualityControlQuery()
  const qcFailed = useGetQCFailedQuery()
  const finishedGoods = useGetFinishedGoodsQuery()
  const activity = useGetActivityQuery({ limit: 60 })
  const drill = useDrill()

  const productionItems = arrayOf(production.data)
  const qcItems = arrayOf(qc.data)
  const failedItems = arrayOf(qcFailed.data)
  const finishedItems = arrayOf(finishedGoods.data)

  const refresh = useCallback(() => Promise.allSettled([
    production.refetch(),
    qc.refetch(),
    qcFailed.refetch(),
    finishedGoods.refetch(),
    activity.refetch(),
  ]), [production.refetch, qc.refetch, qcFailed.refetch, finishedGoods.refetch, activity.refetch])

  const metrics = useMemo(() => {
    const openProduction = productionItems.filter((item) => !isProductionCompleted(item)).length
    const awaitingQc = getQcPendingBatches(qcItems).length
    const readyForRetest = getQcReadyForRetest(qcItems).length
    const awaitingDispatch = finishedItems.filter((item) => item.status === "BILLED")
    const activeFinishedGoods = finishedItems.filter((item) => item.status !== "DELIVERED")
    return {
      openProduction,
      awaitingQc,
      qcFailed: failedItems.length + readyForRetest,
      failedCount: failedItems.length,
      readyForRetest,
      activeFinishedGoods: activeFinishedGoods.length,
      awaitingDispatch: awaitingDispatch.length,
      awaitingDispatchItems: [...awaitingDispatch].sort((a, b) => activityTime(b) - activityTime(a)),
    }
  }, [productionItems, qcItems, failedItems, finishedItems])

  const activityItems = useMemo(() => arrayOf(activity.data)
    .filter((item) => WORK_ACTIVITY_RESOURCES.has(item.resource))
    .slice(0, 5), [activity.data])

  const refreshing = [production, qc, qcFailed, finishedGoods].some((source) => source.isFetching) || activity.isFetching
  const errors = [
    production.error && ["Production", errorMessage(production.error, "Could not load production data.")],
    qc.error && ["Quality Control", errorMessage(qc.error, "Could not load QC data.")],
    qcFailed.error && ["QC Failed", errorMessage(qcFailed.error, "Could not load QC Failed data.")],
    finishedGoods.error && ["Finished Goods", errorMessage(finishedGoods.error, "Could not load Finished Goods data.")],
  ].filter(Boolean)

  return (
    <>
      <Greeting description="Follow production, quality checks and finished goods through to dispatch. Click a card to open its work queue.">
        <Button type="button" variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </Greeting>

      {errors.length > 0 && (
        <div className="mb-4 space-y-2">
          {errors.map(([title, message]) => <Notice key={title} title={`${title} data unavailable`}>{message}</Notice>)}
        </div>
      )}

      <StatRow
        drill={drill}
        stats={[
          {
            label: "Production",
            value: production.isLoading ? null : metrics.openProduction,
            icon: Factory,
            tone: "blue",
            loading: production.isLoading,
            detail: "Product lines not yet completed",
            to: "/production",
          },
          {
            label: "Awaiting QC",
            value: qc.isLoading ? null : metrics.awaitingQc,
            icon: ClipboardCheck,
            tone: "violet",
            loading: qc.isLoading,
            detail: "Completed batches needing a check",
            to: "/quality-control",
          },
          {
            label: "QC Failed / Retest",
            value: qcFailed.isLoading || qc.isLoading ? null : metrics.qcFailed,
            icon: RotateCcw,
            tone: metrics.qcFailed ? "red" : "green",
            loading: qcFailed.isLoading || qc.isLoading,
            detail: `${metrics.failedCount} failed · ${metrics.readyForRetest} ready for retest`,
            to: "/qc-failed",
          },
          {
            label: "Finished Goods",
            value: finishedGoods.isLoading ? null : metrics.activeFinishedGoods,
            icon: PackageCheck,
            tone: metrics.awaitingDispatch ? "amber" : "green",
            loading: finishedGoods.isLoading,
            detail: `${metrics.awaitingDispatch} awaiting dispatch`,
            to: "/finished-goods",
          },
        ]}
      />

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="items-center">
            <div>
              <CardTitle className="flex items-center gap-2"><Truck className="size-5 text-amber-600" /> Awaiting dispatch</CardTitle>
              <CardDescription>Finished goods that have been billed and are ready to be sent out.</CardDescription>
            </div>
            <Link to="/finished-goods" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View more <span aria-hidden>→</span>
            </Link>
          </CardHeader>
          {finishedGoods.isLoading ? (
            <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : metrics.awaitingDispatchItems.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing is waiting for dispatch" description="Billed finished goods will appear here when they are ready to go out." />
          ) : (
            <div className="divide-y">
              {metrics.awaitingDispatchItems.slice(0, 5).map((item) => (
                <Link key={item.id} to="/finished-goods" className="flex min-w-0 items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.orderNumber || `Order #${item.orderId}`}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.productName || item.lines?.map((line) => line.name).join(" · ") || "Finished goods"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.bill?.billNumber ? `Bill ${item.bill.billNumber} · ` : ""}{fmtQty(item.quantity)} units</span>
                  </span>
                  <Badge variant="warning" className="shrink-0">Awaiting dispatch</Badge>
                </Link>
              ))}
            </div>
          )}
          {metrics.awaitingDispatchItems.length > 5 && (
            <div className="border-t px-5 py-3 text-right">
              <Link to="/finished-goods" className="text-sm font-semibold text-primary hover:underline">View all {metrics.awaitingDispatchItems.length} items →</Link>
            </div>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="items-center">
            <div>
              <CardTitle className="flex items-center gap-2"><Activity className="size-5 text-emerald-700" /> Recent workflow activity</CardTitle>
              <CardDescription>Only Production, QC, QC Failed and Finished Goods actions.</CardDescription>
            </div>
          </CardHeader>
          {activity.isLoading ? (
            <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : activity.error ? (
            <div className="p-4"><Notice title="Activity unavailable">{errorMessage(activity.error, "Could not load workflow activity.")}</Notice></div>
          ) : (
            <ActivityFeed items={activityItems} meId={user?.id} />
          )}
        </Card>
      </div>
      {drill.host}
    </>
  )
}
