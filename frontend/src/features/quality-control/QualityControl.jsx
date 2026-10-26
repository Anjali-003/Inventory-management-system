import { useCallback, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, ClipboardCheck, PackageCheck, RefreshCw, XCircle } from "lucide-react"
import { useDispatch } from "react-redux"
import { useToast } from "@/components/toast"
import { HeroButton, MktHero, SearchField } from "@/features/marketing-orders/mktKit"
import ListViewControls from "@/components/ListViewControls"
import { isWithinDateRange, recordTimestamp, uniqueStringOptions } from "@/lib/listViewUtils"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { qualityControlService } from "@/features/quality-control/qualityControlService"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import QcBatchSection from "./components/QcBatchSection"
import BatchDecisionConfirm from "./components/BatchDecisionConfirm"

const asArray = (value) => Array.isArray(value) ? value : []
const searchText = (item) => `${item.orderNumber || ""} ${item.productName || ""} ${item.productSku || ""} ${item.decisionRemarks || ""} ${(item.decisionHistory || []).map((attempt) => `${attempt.remarks || ""} ${attempt.reworkRemarks || ""}`).join(" ")}`.toLowerCase()

export default function QualityControl() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("qualityControl")
  const { data: items = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetQualityControlQuery()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get("q") || "") // ?q=<product> from Reports
  const [activeView, setActiveView] = useState("pending")
  const [productFilter, setProductFilter] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [view, setView] = useState("table")
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState(null)
  const [remarks, setRemarks] = useState("")
  const [sample, setSample] = useState({ size: "", failed: "" })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  const rows = asArray(items)
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load completed production batches.") : "")
  const productOptions = useMemo(() => uniqueStringOptions(rows, (item) => item.productName), [rows])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((item) => {
      if (productFilter !== "all" && item.productName !== productFilter) return false
      return !q || searchText(item).includes(q)
    })
  }, [rows, query, productFilter])
  const pendingRows = useMemo(() => filtered.filter((item) => !item.batchDecision && isWithinDateRange(item.completedAt, fromDate, toDate)).sort((a, b) => {
    if (sortBy === "retest") return Number(b.attemptNumber || 1) - Number(a.attemptNumber || 1)
    const at = recordTimestamp(a.completedAt)
    const bt = recordTimestamp(b.completedAt)
    return sortBy === "oldest" || sortBy === "waiting" ? at - bt : bt - at
  }), [filtered, fromDate, toDate, sortBy])
  const allHistoryRows = useMemo(() => filtered.flatMap((item) => {
    const attempts = Array.isArray(item.decisionHistory) ? item.decisionHistory : []
    if (attempts.length) {
      return attempts.map((attempt) => ({
        ...item,
        id: `${item.id}-attempt-${attempt.attemptNumber}`,
        productionId: item.id,
        batchDecision: attempt.decision,
        attemptNumber: attempt.attemptNumber,
        decisionRemarks: attempt.remarks,
        decisionAt: attempt.decidedAt,
        decisionByName: attempt.decidedByName,
        reworkStatus: attempt.reworkStatus,
        reworkRemarks: attempt.reworkRemarks,
        reworkStartedAt: attempt.reworkStartedAt,
        reworkSubmittedAt: attempt.reworkSubmittedAt,
      }))
    }
    // Preserve visibility of older batches released before batch-decision history existed.
    return item.batchDecision ? [{ ...item, id: `${item.id}-legacy`, productionId: item.id, attemptNumber: 1 }] : []
  }), [filtered])
  const historyRows = useMemo(() => allHistoryRows
    .filter((item) => isWithinDateRange(item.decisionAt || item.completedAt, fromDate, toDate))
    .sort((a, b) => {
      if (sortBy === "retest") return Number(b.attemptNumber || 1) - Number(a.attemptNumber || 1)
      const at = recordTimestamp(a.decisionAt || a.completedAt)
      const bt = recordTimestamp(b.decisionAt || b.completedAt)
      return sortBy === "oldest" || sortBy === "waiting" ? at - bt : bt - at
    }), [allHistoryRows, fromDate, toDate, sortBy])
  const clearToolbarFilters = () => { setProductFilter("all"); setFromDate(""); setToDate("") }
  const toolbarFilters = [
    { key: "product", label: "Product", value: productFilter, options: productOptions, onChange: setProductFilter },
    { key: "from-date", label: activeView === "pending" ? "Completed date from" : "Decision date from", type: "date", value: fromDate, onChange: setFromDate },
    { key: "to-date", label: activeView === "pending" ? "Completed date to" : "Decision date to", type: "date", value: toDate, onChange: setToDate },
  ]
  const sortOptions = activeView === "pending" ? [
    { value: "newest", label: "Recently completed first" },
    { value: "oldest", label: "Oldest completed first" },
    { value: "waiting", label: "Waiting longest" },
    { value: "retest", label: "Highest retest attempt" },
  ] : [
    { value: "newest", label: "Most recent QC decision" },
    { value: "oldest", label: "Oldest QC decision first" },
    { value: "retest", label: "Highest retest attempt" },
  ]
  const counts = useMemo(() => ({
    pending: rows.filter((item) => !item.batchDecision).length,
    passed: rows.filter((item) => item.latestDecision === "PASS" || item.legacyFinishedGoodsPass).length,
    failed: rows.filter((item) => item.latestDecision === "FAIL" && item.reworkStatus !== "READY_FOR_QC").length,
    released: rows.filter((item) => item.finishedGoodsId).length,
  }), [rows])

  const switchActiveView = (nextView) => {
    setActiveView(nextView)
    if (nextView === "history" && sortBy === "waiting") setSortBy("oldest")
  }

  const summaryCards = [
    { key: "pending", label: "Pending QC", value: counts.pending, hint: "Completed batches awaiting decision", icon: ClipboardCheck, tone: "amber" },
    { key: "passed", label: "Passed batches", value: counts.passed, hint: "Latest decision is Pass", icon: CheckCircle2, tone: "green" },
    { key: "failed", label: "Failed batches", value: counts.failed, hint: "Require rework or retest", icon: XCircle, tone: "rose" },
    { key: "released", label: "Sent to Finished Goods", value: counts.released, hint: "Released for packaging", icon: PackageCheck, tone: "teal" },
  ]

  const refresh = useCallback(async () => {
    setActionError("")
    await refetch()
    dispatch(baseApi.util.invalidateTags(["FinishedGoods", "Orders", "Production"]))
  }, [refetch, dispatch])

  const askDecision = (item, nextDecision) => {
    if (!editable || !item || item.batchDecision) return
    setActionError("")
    setRemarks("")
    setSample({ size: "", failed: nextDecision === "PASS" ? "0" : "" })
    setSelected(item)
    setDecision(nextDecision)
  }

  const closeConfirm = () => {
    if (!busy) {
      setSelected(null)
      setDecision(null)
      setRemarks("")
    }
  }

  const changeRemarks = (value) => {
    setRemarks(value)
    if (actionError) setActionError("")
  }

  const submitDecision = async () => {
    if (!selected || !decision || busy) return
    try {
      setBusy(true)
      setActionError("")
      const { data } = await qualityControlService.decideBatch(selected.productionId || selected.id, decision, remarks, sample)
      setSelected(null)
      setDecision(null)
      setRemarks("")
      toast.success(data?.message || (decision === "PASS" ? "Batch passed QC" : "Batch marked as failed"))
      dispatch(baseApi.util.invalidateTags(["QualityControl", "FinishedGoods", "Orders", "Production"]))
      await refetch()
    } catch (err) {
      console.error(err)
      setActionError(err.response?.data?.message || "Could not save the batch QC decision.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MktHero
        eyebrow="Quality & release"
        title="Quality Check (QC)"
        description="Check random sample pieces of every finished batch. One bad piece fails the whole batch and it goes back to Production."
      >
        <HeroButton variant="glass" onClick={refresh} disabled={loading || isFetching} aria-label="Refresh quality control">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && (
        <div role="alert" className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 sm:px-5">
          <p className="font-extrabold">Quality Control update</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ key, label, value, hint, icon: Icon, tone }) => {
          const toneStyles = {
            amber: { edge: "bg-gradient-to-r from-amber-700 to-orange-800", icon: "bg-gradient-to-br from-amber-700 to-orange-800", text: "text-amber-800" },
            green: { edge: "bg-gradient-to-r from-emerald-700 to-teal-800", icon: "bg-gradient-to-br from-emerald-700 to-teal-800", text: "text-emerald-800" },
            rose: { edge: "bg-gradient-to-r from-rose-600 to-red-800", icon: "bg-gradient-to-br from-rose-600 to-red-800", text: "text-rose-800" },
            teal: { edge: "bg-gradient-to-r from-teal-700 to-cyan-800", icon: "bg-gradient-to-br from-teal-700 to-cyan-800", text: "text-teal-800" },
          }[tone]
          const openSummary = () => {
            if (key === "pending") switchActiveView("pending")
            else if (key === "passed") switchActiveView("history")
            else if (key === "failed") navigate("/qc-failed")
            else navigate("/finished-goods")
          }
          return (
            <button
              key={key}
              type="button"
              onClick={openSummary}
              aria-label={`${label}: ${loading ? "loading" : value}. Open related work.`}
              className="group relative min-w-0 overflow-hidden rounded-2xl border border-[#E3E6EB] bg-white p-4 text-left shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#CDD2DA] hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-5"
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${toneStyles.edge}`} />
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug text-slate-700 sm:text-sm">{label}</p>
                  <p className={`mt-3 text-3xl font-extrabold leading-none tabular-nums sm:text-4xl ${toneStyles.text}`}>{loading ? "—" : value}</p>
                </div>
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105 sm:size-11 ${toneStyles.icon}`}>
                  <Icon className="size-5 sm:size-6" aria-hidden />
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-snug text-slate-600 sm:text-xs">{hint}</p>
              <span className="mt-3 inline-flex items-center text-[11px] font-semibold text-primary">Open details <span aria-hidden className="ml-1">→</span></span>
            </button>
          )
        })}
      </section>

      <section aria-label="Quality Control views" className="grid min-w-0 grid-cols-1 gap-2 rounded-2xl border border-[#E3E6EB] bg-white p-1.5 sm:grid-cols-2 sm:p-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "pending"}
          onClick={() => switchActiveView("pending")}
          className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${activeView === "pending" ? "border-emerald-700 bg-emerald-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:bg-emerald-50"}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ClipboardCheck className="size-5 shrink-0" aria-hidden />
            <span className="text-sm font-extrabold sm:text-base">Pending batches for QC</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${activeView === "pending" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>{pendingRows.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "history"}
          onClick={() => switchActiveView("history")}
          className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${activeView === "history" ? "border-emerald-700 bg-emerald-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:bg-emerald-50"}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <span className="text-sm font-extrabold sm:text-base">Previous QC tests</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${activeView === "history" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>{historyRows.length}</span>
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E3E6EB] bg-white p-3 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <SearchField value={query} onChange={setQuery} placeholder="Search order, product or SKU..." />
          </div>
          <p className="ml-auto shrink-0 text-xs font-semibold text-slate-600">{(activeView === "pending" ? pendingRows : historyRows).length} result{(activeView === "pending" ? pendingRows : historyRows).length === 1 ? "" : "s"}</p>
          <ListViewControls view={view} onViewChange={setView} sortBy={sortBy} onSortChange={setSortBy} sortOptions={sortOptions} filters={toolbarFilters} onClearFilters={clearToolbarFilters} hasActiveFilters={productFilter !== "all" || !!fromDate || !!toDate} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">Only batches where completed production meets the full ordered quantity are listed.</p>
      </section>

      {activeView === "pending" ? (
        <QcBatchSection
          title="Pending batches for QC"
          description="Review the completed batch, then choose Pass or Fail. The decision applies to the whole batch. Retest batches include the original failure and repair notes."
          icon={ClipboardCheck}
          kind="pending"
          items={pendingRows}
          loading={loading}
          query={query}
          editable={editable}
          onDecide={askDecision}
          view={view}
        />
      ) : (
        <QcBatchSection
          title="Previous QC tests"
          description="Every QC attempt remains here, including the original failure remark, repair notes and the final release decision."
          icon={CheckCircle2}
          kind="history"
          items={historyRows}
          loading={loading}
          query={query}
          editable={false}
          view={view}
        />
      )}

      {editable && <BatchDecisionConfirm item={selected} decision={decision} remarks={remarks} onRemarksChange={changeRemarks} sample={sample} onSampleChange={(next) => { setSample(next); if (actionError) setActionError("") }} busy={busy} error={actionError} onClose={closeConfirm} onConfirm={submitDecision} />}
    </div>
  )
}
