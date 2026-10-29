import { useMemo } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, ClipboardCheck, Factory, RefreshCw, RotateCcw, XCircle } from "lucide-react"
import { Notice } from "@/components/feedback"
import { PageButton, pageButtonClass } from "@/components/PageKit"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { inProductionQuantity, isProductionCompleted, isVisibleToProduction } from "@/features/production/productionWorkflow"
import { Greeting, Line, ListPanel, Panel, StatRow, useDrill } from "@/features/dashboard/DashboardKit"
import { errorMessage, fmtQty } from "@/lib/stock"
import { getQcFailedBatches, getQcPendingBatches, getQcReadyForRetest } from "@/features/quality-fg-dashboard/qualityFgDashboardUtils"

const EMPTY = []
const asArray = (value) => (Array.isArray(value) ? value : EMPTY)
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const isToday = (at) => at && new Date(at).toDateString() === new Date().toDateString()
const time = (at) => new Date(at || 0).getTime() || 0
// where finished goods are after QC, in the order they move (the Store's and Marketing's steps)
const AFTER_QC = [
  ["HANDED_OVER", "With the Store to receive"],
  ["IN_STORE", "In stock, to be billed"],
  ["BILLED", "Billed, to be given out"],
]
const batchRow = (item, extra) => ({
  id: `qc${item.id}`,
  title: item.orderNumber || `Production #${item.id}`,
  sub: [item.productName, item.productSku].filter(Boolean).join(" · "),
  right: `${fmtQty(Number(item.quantityCompleted || 0))} units`,
  to: "/quality-control",
  ...extra,
})

/*
  QC & Finished Goods dashboard, in the one dashboard look (the Super Admin's): "Hello" and the next thing to do,
  the figures (what waits for a decision, what is back with Production, what was decided today), then the batches to
  decide, the ones that failed, what is being made (coming to QC next) and where passed goods are now.
  `readOnly`: the Super Admin looking at this team's screen.
*/
export default function QualityFinishedGoodsDashboard() {
  const drill = useDrill()
  const qcQuery = useGetQualityControlQuery()
  const finishedQuery = useGetFinishedGoodsQuery()
  const productionQuery = useGetProductionQuery()

  const qcItems = asArray(qcQuery.data)
  const finishedItems = asArray(finishedQuery.data)
  const productionItems = asArray(productionQuery.data)

  const d = useMemo(() => {
    const pending = getQcPendingBatches(qcItems).sort((a, b) => time(a.completedAt) - time(b.completedAt))
    const retest = getQcReadyForRetest(qcItems)
    const failed = getQcFailedBatches(qcItems)
    const decidedToday = qcItems.flatMap((i) => asArray(i.decisionHistory)).filter((x) => isToday(x.decidedAt))
    const coming = productionItems.filter((i) => isVisibleToProduction(i) && !isProductionCompleted(i) && inProductionQuantity(i) > 0)
    return {
      // a retest is a decision too: it goes first, its batch has waited longest
      toDecide: [
        ...retest.map((i) => batchRow(i, { badge: { variant: "info", label: `Retest ${Number(i.attemptNumber || 2)}` } })),
        ...pending.map((i) => batchRow(i, { badge: { variant: "warning", label: "Decide" } })),
      ],
      pending, retest, failed,
      failedRows: failed.map((i) => batchRow(i, {
        to: "/qc-failed",
        badge: i.reworkStatus === "IN_PROGRESS" ? { variant: "info", label: "Being fixed" } : { variant: "danger", label: "To fix" },
      })),
      decidedToday: decidedToday.length,
      failedToday: decidedToday.filter((x) => String(x.decision || "").toUpperCase() === "FAIL").length,
      comingRows: coming.map((i) => ({
        id: `p${i.order_item_id}`,
        title: i.order_number,
        sub: [i.customer_name, i.product_name].filter(Boolean).join(" · "),
        right: `${fmtQty(Number(i.quantity_completed || 0))} of ${fmtQty(Number(i.ordered_quantity || 0))} made`,
        to: "/production?tab=making",
      })),
    }
  }, [qcItems, productionItems])

  const after = useMemo(() => Object.fromEntries(AFTER_QC.map(([status]) => [status, finishedItems.filter((f) => f.status === status).length])), [finishedItems])
  const fetching = qcQuery.isFetching || finishedQuery.isFetching || productionQuery.isFetching
  const refresh = () => Promise.allSettled([qcQuery.refetch(), finishedQuery.refetch(), productionQuery.refetch()])
  const errors = [
    qcQuery.error && ["Quality Control", errorMessage(qcQuery.error, "Could not load Quality Control data.")],
    finishedQuery.error && ["Finished Goods", errorMessage(finishedQuery.error, "Could not load Finished Goods data.")],
    productionQuery.error && ["Production", errorMessage(productionQuery.error, "Could not load Production data.")],
  ].filter(Boolean)

  const decide = d.toDecide.length
  const nudge = qcQuery.isLoading ? "Loading…"
    : decide ? `${plural(decide, "batch", "batches")} ${decide === 1 ? "is" : "are"} waiting for your Pass or Fail.`
    : d.failed.length ? `Nothing to decide. ${plural(d.failed.length, "failed batch", "failed batches")} ${d.failed.length === 1 ? "is" : "are"} back with Production.`
    : "Nothing is waiting for a QC decision."

  return (
    <>
      <Greeting description={nudge}>
        <PageButton onClick={refresh} disabled={fetching} aria-label="Refresh"><RefreshCw className={fetching ? "animate-spin" : ""} /> Refresh</PageButton>
        <Link to="/quality-control" className={pageButtonClass("primary")}><ClipboardCheck /> Open Quality Check</Link>
      </Greeting>

      {errors.length > 0 && (
        <div className="mb-4 space-y-2">{errors.map(([title, message]) => <Notice key={title} title={`${title} data unavailable`}>{message}</Notice>)}</div>
      )}

      <StatRow drill={drill} stats={[
        { label: "Waiting for your decision", value: d.pending.length, icon: ClipboardCheck, tone: d.pending.length ? "amber" : "green", loading: qcQuery.isLoading,
          detail: d.pending.length ? "Finished batches: Pass or Fail" : "Nothing to decide", to: "/quality-control" },
        { label: "Ready for retest", value: d.retest.length, icon: RotateCcw, tone: d.retest.length ? "amber" : "green", loading: qcQuery.isLoading,
          detail: d.retest.length ? "Fixed by Production, check again" : "Nothing to retest", to: "/qc-failed" },
        { label: "Failed, with Production", value: d.failed.length, icon: XCircle, tone: d.failed.length ? "red" : "green", loading: qcQuery.isLoading,
          detail: d.failed.length ? "Being fixed before a retest" : "No failed batch", to: "/qc-failed" },
        { label: "Decided today", value: d.decidedToday, icon: CheckCircle2, tone: "blue", loading: qcQuery.isLoading,
          detail: d.failedToday ? `${d.failedToday} failed` : "No failures today", to: "/quality-control" },
        { label: "Being made", value: d.comingRows.length, icon: Factory, tone: "blue", loading: productionQuery.isLoading,
          detail: "Coming to QC next", to: "/production?tab=making" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ListPanel drill={drill} className="lg:col-span-2" loading={qcQuery.isLoading} title="Decide Pass or Fail" description="Retests first, then the batch finished longest ago."
          rows={d.toDecide} to="/quality-control" toLabel="Quality Check" empty="No batch is waiting for a decision." />
        <Panel title="After QC" description="Where the passed goods are now." to="/finished-goods" toLabel="Finished Goods">
          {AFTER_QC.map(([status, label]) => <Line key={status} label={label} value={finishedQuery.isLoading ? "…" : after[status]} to={`/finished-goods?status=${status}`} />)}
        </Panel>
        <ListPanel drill={drill} className="lg:col-span-2" loading={qcQuery.isLoading} title="Failed, back with Production" description="Fixed by Production, then they come back to you for a retest."
          rows={d.failedRows} to="/qc-failed" toLabel="QC Failed" empty="No failed batch." />
        <ListPanel drill={drill} loading={productionQuery.isLoading} title="Being made" description="Coming to QC next (view only)."
          rows={d.comingRows} to="/production?tab=making" toLabel="Production" empty="Nothing is being made right now." />
      </div>
      {drill.host}
    </>
  )
}
