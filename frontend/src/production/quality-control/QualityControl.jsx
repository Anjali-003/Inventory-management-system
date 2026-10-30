import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CheckCircle2, ClipboardCheck, RefreshCw } from "lucide-react"
import { useDispatch } from "react-redux"
import { useToast } from "@/components/toast"
import { SearchField } from "@/components/saturday/kit"
import { Button } from "@/components/ui/button"
import ListViewControls from "@/components/ListViewControls"
import { FilterTabs } from "@/components/PageKit"
import { isWithinDateRange, recordTimestamp, uniqueStringOptions } from "@/lib/listViewUtils"
import { usePermissions } from "@/core/auth/usePermissions"
import { useGetQualityControlQuery } from "@/production/quality-control/qualityControlApi"
import { qualityControlService } from "@/production/quality-control/qualityControlService"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import QcBatchSection from "./components/QcBatchSection"
import BatchDecisionConfirm from "./components/BatchDecisionConfirm"

const asArray = (value) => Array.isArray(value) ? value : []
// ?month=2026-10 (from Reports): the QC decisions of that month, as the dates from / to
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const monthRange = (key) => {
  const [y, m] = key.split("-").map(Number)
  return { from: `${key}-01`, to: `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` }
}
const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
const searchText = (item) => `${item.orderNumber || ""} ${item.productName || ""} ${item.productSku || ""} ${item.decisionRemarks || ""} ${(item.decisionHistory || []).map((attempt) => `${attempt.remarks || ""} ${attempt.reworkRemarks || ""}`).join(" ")}`.toLowerCase()

export default function QualityControl() {
  const [params] = useSearchParams()
  const linkedMonth = MONTH_RE.test(params.get("month") || "") ? params.get("month") : null
  const dispatch = useDispatch()
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("qualityControl")
  const { data: items = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetQualityControlQuery()
  const [query, setQuery] = useState("")
  const [activeView, setActiveView] = useState(() => (params.get("view") === "history" || linkedMonth ? "history" : "pending"))
  const [productFilter, setProductFilter] = useState("all")
  const [fromDate, setFromDate] = useState(() => (linkedMonth ? monthRange(linkedMonth).from : ""))
  const [toDate, setToDate] = useState(() => (linkedMonth ? monthRange(linkedMonth).to : ""))
  const [sortBy, setSortBy] = useState("newest")
  const [view, setView] = useState("table")
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState(null)
  const [remarks, setRemarks] = useState("")
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
  // the month from Reports, while the dates still match it: its first-try figure, to compare with the report
  const monthShown = linkedMonth && fromDate === monthRange(linkedMonth).from && toDate === monthRange(linkedMonth).to ? linkedMonth : null
  const firstTry = historyRows.filter((item) => Number(item.attemptNumber || 1) === 1)
  const firstTryPassed = firstTry.filter((item) => item.batchDecision === "PASS").length
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
  const switchActiveView = (nextView) => {
    setActiveView(nextView)
    if (nextView === "history" && sortBy === "waiting") setSortBy("oldest")
  }

  const refresh = useCallback(async () => {
    setActionError("")
    await refetch()
    dispatch(baseApi.util.invalidateTags(["FinishedGoods", "Orders", "Production"]))
  }, [refetch, dispatch])

  const askDecision = (item, nextDecision) => {
    if (!editable || !item || item.batchDecision) return
    setActionError("")
    setRemarks("")
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
      const { data } = await qualityControlService.decideBatch(selected.productionId || selected.id, decision, remarks)
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary">Quality &amp; production</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight text-foreground">Quality Control</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Inspect completed production batches and record one Pass or Fail decision per batch.</p>
        </div>
        <Button type="button" variant="outline" onClick={refresh} disabled={loading || isFetching} aria-label="Refresh quality control">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </header>

      {error && (
        <div role="alert" className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 sm:px-5">
          <p className="font-extrabold">Quality Control update</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      <FilterTabs
        label="Filter quality control batches"
        layoutId="quality-control-tabs"
        items={[
          { key: "pending", label: "Open for QC", value: pendingRows.length, active: activeView === "pending", onClick: () => switchActiveView("pending") },
          { key: "history", label: "QC history", value: historyRows.length, active: activeView === "history", onClick: () => switchActiveView("history") },
        ]}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <SearchField value={query} onChange={setQuery} placeholder="Search order, product or SKU..." />
          </div>
          <p className="ml-auto shrink-0 text-xs font-semibold text-slate-600">{(activeView === "pending" ? pendingRows : historyRows).length} result{(activeView === "pending" ? pendingRows : historyRows).length === 1 ? "" : "s"}</p>
          <ListViewControls view={view} onViewChange={setView} sortBy={sortBy} onSortChange={setSortBy} sortOptions={sortOptions} filters={toolbarFilters} onClearFilters={clearToolbarFilters} hasActiveFilters={productFilter !== "all" || !!fromDate || !!toDate} />
        </div>
        {monthShown && activeView === "history" && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            QC decisions in
            <button type="button" onClick={() => { setFromDate(""); setToDate("") }} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-semibold text-primary hover:bg-accent/70" aria-label={`Show every month, not only ${monthName(monthShown)}`}>
              {monthName(monthShown)} <span aria-hidden>×</span>
            </button>
            <span className="font-semibold text-foreground tabular-nums">Passed first try: {firstTryPassed} of {firstTry.length}</span>
          </p>
        )}
        {activeView === "pending" && <p className="mt-3 text-xs leading-relaxed text-slate-600">Only fully completed production batches appear here.</p>}
      </section>

      {activeView === "pending" ? (
        <QcBatchSection
          title="Open for QC"
          description="Review each completed batch and record one Pass or Fail decision. The decision applies to the entire batch."
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
          title="QC history"
          description="Review previous QC decisions, including failures, corrections and retest results."
          icon={CheckCircle2}
          kind="history"
          items={historyRows}
          loading={loading}
          query={query}
          editable={false}
          view={view}
        />
      )}

      {editable && <BatchDecisionConfirm item={selected} decision={decision} remarks={remarks} onRemarksChange={changeRemarks} busy={busy} error={actionError} onClose={closeConfirm} onConfirm={submitDecision} />}
    </div>
  )
}
