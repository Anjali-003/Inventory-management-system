import { useCallback, useMemo } from "react"
import { AlertTriangle, ClipboardCheck, Factory, PackageCheck, RefreshCw, RotateCcw, Truck } from "lucide-react"
import { useGetMeQuery } from "@/core/auth/authApi"
import { useGetProductionQuery } from "@/production/production/productionApi"
import { useGetQualityControlQuery } from "@/production/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/production/finished-goods/finishedGoodsApi"
import { useGetActivityQuery } from "@/core/activity/activityApi"
import ActivityFeed from "@/core/activity/ActivityFeed"
import { getQcFailedBatches, getQcPendingBatches, getQcReadyForRetest } from "@/production/dashboards/qualityFgDashboardUtils"
import { isProductionCompleted } from "@/production/production/productionWorkflow"
import { errorMessage, fmtQty } from "@/lib/stock"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Greeting, Line, ListPanel, Panel, StatRow, useDrill } from "@/core/dashboard/DashboardKit"

const EMPTY = []
const WORK_ACTIVITY_RESOURCES = new Set(["production", "quality-control", "qc-failed", "finished-goods"])
const arrayOf = (value) => Array.isArray(value) ? value : EMPTY
const activityTime = (item) => new Date(item.billedAt || item.createdAt || 0).getTime() || 0
const localDateKey = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
const isToday = (value, todayKey) => localDateKey(value) === todayKey

function getTodayQcDecisions(items, todayKey) {
  const decisions = []

  for (const item of items) {
    const history = arrayOf(item.decisionHistory)
    if (history.length > 0) {
      for (const entry of history) {
        if (isToday(entry.decidedAt, todayKey)) decisions.push(entry)
      }
      continue
    }

    const decision = item.latestDecision || item.batchDecision
    if (decision && isToday(item.decisionAt, todayKey)) {
      decisions.push({ decision, decidedAt: item.decisionAt })
    }
  }

  return decisions
}

/** Production Admin overview. Keeps the dashboard focused on the four workflow queues and dispatch readiness. */
export default function ProductionAdminView() {
  const { data: user } = useGetMeQuery()
  const production = useGetProductionQuery()
  const qc = useGetQualityControlQuery()
  const finishedGoods = useGetFinishedGoodsQuery()
  const activity = useGetActivityQuery({ limit: 60 })
  const drill = useDrill()

  const productionItems = arrayOf(production.data)
  const qcItems = arrayOf(qc.data)
  const finishedItems = arrayOf(finishedGoods.data)

  const { refetch: refetchProduction } = production
  const { refetch: refetchQc } = qc
  const { refetch: refetchFinishedGoods } = finishedGoods
  const { refetch: refetchActivity } = activity
  const refresh = useCallback(
    () => Promise.allSettled([refetchProduction(), refetchQc(), refetchFinishedGoods(), refetchActivity()]),
    [refetchProduction, refetchQc, refetchFinishedGoods, refetchActivity]
  )

  const metrics = useMemo(() => {
    const openProduction = productionItems.filter((item) => !isProductionCompleted(item)).length
    const awaitingQc = getQcPendingBatches(qcItems).length
    const readyForRetest = getQcReadyForRetest(qcItems).length
    // batches whose latest QC decision is FAIL, back with Production (the QC dashboard's count; GET /qc-failed lists every production line)
    const failedCount = getQcFailedBatches(qcItems).length
    const awaitingDispatch = finishedItems.filter((item) => item.status === "BILLED")
    const activeFinishedGoods = finishedItems.filter((item) => item.status !== "DELIVERED")
    return {
      openProduction,
      awaitingQc,
      qcFailed: failedCount + readyForRetest,
      failedCount,
      readyForRetest,
      activeFinishedGoods: activeFinishedGoods.length,
      awaitingDispatch: awaitingDispatch.length,
      awaitingDispatchItems: [...awaitingDispatch].sort((a, b) => activityTime(b) - activityTime(a)),
    }
  }, [productionItems, qcItems, finishedItems])

  const activityItems = useMemo(() => arrayOf(activity.data)
    .filter((item) => WORK_ACTIVITY_RESOURCES.has(item.resource))
    .slice(0, 5), [activity.data])

  const todayKey = localDateKey(new Date())
  const todayQcDecisions = getTodayQcDecisions(qcItems, todayKey)
  const todayProgress = [
    {
      key: "production",
      label: "Product lines finished",
      value: production.isLoading || production.error ? null : productionItems.filter((item) =>
        isProductionCompleted(item) && isToday(item.completed_at, todayKey),
      ).length,
      description: "Full product lines completed today",
      icon: Factory,
      tone: "blue",
      to: "/production",
    },
    {
      key: "qc",
      label: "QC decisions",
      value: qc.isLoading || qc.error ? null : todayQcDecisions.length,
      description: "Pass/fail decisions recorded today",
      icon: ClipboardCheck,
      tone: "cyan",
      to: "/quality-control",
    },
    {
      key: "qc-failed",
      label: "QC failures",
      value: qc.isLoading || qc.error ? null : todayQcDecisions.filter((item) => String(item.decision || "").toUpperCase() === "FAIL").length,
      description: "Failures recorded today",
      icon: AlertTriangle,
      tone: "red",
      to: "/qc-failed",
    },
    {
      key: "dispatch",
      label: "Given out",
      value: finishedGoods.isLoading || finishedGoods.error ? null : finishedItems.filter((item) => isToday(item.dispatchedAt, todayKey)).length,
      description: "Finished Goods dispatched today",
      icon: Truck,
      tone: "green",
      to: "/finished-goods",
    },
  ]

  // the one thing to do first: a QC decision holds a finished batch, a failure holds the order, then what to send out
  const nudge = metrics.awaitingQc ? `${metrics.awaitingQc} finished batch${metrics.awaitingQc === 1 ? " is" : "es are"} waiting for a QC decision.`
    : metrics.failedCount ? `${metrics.failedCount} batch${metrics.failedCount === 1 ? "" : "es"} failed QC and ${metrics.failedCount === 1 ? "is" : "are"} back with Production.`
    : metrics.awaitingDispatch ? `${metrics.awaitingDispatch} billed order${metrics.awaitingDispatch === 1 ? " is" : "s are"} waiting to go out.`
    : "Production, QC and Finished Goods are all moving."

  const refreshing = [production, qc, finishedGoods].some((source) => source.isFetching) || activity.isFetching
  const errors = [
    production.error && ["Production", errorMessage(production.error, "Could not load production data.")],
    qc.error && ["Quality Control", errorMessage(qc.error, "Could not load QC data.")],
    finishedGoods.error && ["Finished Goods", errorMessage(finishedGoods.error, "Could not load Finished Goods data.")],
  ].filter(Boolean)

  return (
    <>
      <Greeting description={nudge}>
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
            value: qc.isLoading ? null : metrics.qcFailed,
            icon: RotateCcw,
            tone: metrics.qcFailed ? "red" : "green",
            loading: qc.isLoading,
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

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
        <ListPanel drill={drill} className="lg:col-span-2" loading={finishedGoods.isLoading} title="Waiting to go out" description="Billed, the Store gives them out once paid."
          to="/finished-goods" toLabel="Finished Goods" empty="Nothing is waiting to go out."
          rows={metrics.awaitingDispatchItems.map((item) => ({
            id: `fg${item.id}`,
            title: item.orderNumber || `Order #${item.orderId}`,
            sub: [item.customerName || item.bill?.customerName, item.lines?.map((line) => line.name).join(", ") || item.productName, item.bill?.billNumber].filter(Boolean).join(" · "),
            right: `${fmtQty(item.quantity)} units`,
            badge: item.bill?.due > 0 ? { variant: "warning", label: "Not paid" } : { variant: "success", label: "Paid" },
            to: "/finished-goods",
          }))} />
        <Panel title="Today" description="Work recorded so far today.">
          {todayProgress.map((item) => <Line key={item.key} label={item.label} sub={item.description} value={item.value === null ? "—" : item.value} bad={item.key === "qc-failed" && item.value > 0} to={item.to} />)}
        </Panel>
      </div>

      <Panel flush className="mt-4" title="Recent activity" description="Production, QC, QC Failed and Finished Goods actions.">
        {activity.isLoading ? (
          <div className="space-y-3 px-5 pb-5">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : activity.error ? (
          <div className="px-5 pb-5"><Notice title="Activity unavailable">{errorMessage(activity.error, "Could not load workflow activity.")}</Notice></div>
        ) : (
          <ActivityFeed items={activityItems} meId={user?.id} />
        )}
      </Panel>
      {drill.host}
    </>
  )
}
