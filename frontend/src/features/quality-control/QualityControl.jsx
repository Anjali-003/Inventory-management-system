import { useCallback, useMemo, useState } from "react"
import { CheckCircle2, ClipboardCheck, PackageCheck, RefreshCw, XCircle } from "lucide-react"
import { useDispatch } from "react-redux"
import { useToast } from "@/components/toast"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi"
import { qualityControlService } from "@/features/quality-control/qualityControlService"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import QcBatchSection from "./components/QcBatchSection"
import BatchDecisionConfirm from "./components/BatchDecisionConfirm"

const asArray = (value) => Array.isArray(value) ? value : []
const searchText = (item) => `${item.orderNumber || ""} ${item.productName || ""} ${item.productSku || ""}`.toLowerCase()

export default function QualityControl() {
  const dispatch = useDispatch()
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("qualityControl")
  const { data: items = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetQualityControlQuery()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  const rows = asArray(items)
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load completed production batches.") : "")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((item) => !q || searchText(item).includes(q))
  }, [rows, query])
  const pendingRows = useMemo(() => filtered.filter((item) => !item.batchDecision), [filtered])
  const historyRows = useMemo(() => filtered.filter((item) => Boolean(item.batchDecision)), [filtered])
  const counts = useMemo(() => ({
    pending: rows.filter((item) => !item.batchDecision).length,
    passed: rows.filter((item) => item.batchDecision === "PASS").length,
    failed: rows.filter((item) => item.batchDecision === "FAIL").length,
    released: rows.filter((item) => item.batchDecision === "PASS" && item.finishedGoodsId).length,
  }), [rows])

  const refresh = useCallback(async () => {
    setActionError("")
    await refetch()
    dispatch(baseApi.util.invalidateTags(["FinishedGoods", "Orders", "Production"]))
  }, [refetch, dispatch])

  const askDecision = (item, nextDecision) => {
    if (!editable || !item || item.batchDecision) return
    setActionError("")
    setSelected(item)
    setDecision(nextDecision)
  }

  const closeConfirm = () => {
    if (!busy) {
      setSelected(null)
      setDecision(null)
    }
  }

  const submitDecision = async () => {
    if (!selected || !decision || busy) return
    try {
      setBusy(true)
      setActionError("")
      const { data } = await qualityControlService.decideBatch(selected.id, decision)
      setSelected(null)
      setDecision(null)
      toast.success(data?.message || (decision === "PASS" ? "Batch passed QC" : "Batch marked as failed"))
      dispatch(baseApi.util.invalidateTags(["FinishedGoods", "Orders", "Production"]))
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
      <PageHeader
        title="Quality Control"
        description="Make one final Pass or Fail decision for each fully completed production batch."
      >
        <Button variant="outline" onClick={refresh} disabled={loading || isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && <Notice title="Quality Control update">{error}</Notice>}

      <Card className="min-w-0 overflow-hidden">
        <StatStrip
          cols="grid-cols-2 md:grid-cols-4"
          layoutId="qc-batch-summary"
          items={[
            { key: "pending", label: "Pending QC", value: loading ? "—" : counts.pending, hint: "Completed batches", tone: "warning" },
            { key: "passed", label: "Passed batches", value: loading ? "—" : counts.passed, hint: "Released / approved", tone: "success" },
            { key: "failed", label: "Failed batches", value: loading ? "—" : counts.failed, hint: "Held out of Finished Goods", tone: "danger" },
            { key: "released", label: "Sent to Finished Goods", value: loading ? "—" : counts.released, hint: "Ready for packaging", tone: "info" },
          ]}
        />
        <div className="border-t p-3 sm:p-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or SKU..." />
          <p className="mt-2 text-xs text-muted-foreground">Only batches where completed production meets the full ordered quantity are listed.</p>
        </div>
      </Card>

      <QcBatchSection
        title="Pending batches for QC"
        description="Review the completed batch, then choose Pass or Fail. The decision applies to the whole batch."
        icon={ClipboardCheck}
        kind="pending"
        items={pendingRows}
        loading={loading}
        query={query}
        editable={editable}
        onDecide={askDecision}
      />

      <QcBatchSection
        title="Previous QC tests"
        description="A history of previous batch decisions. Passed batches go to Finished Goods; failed batches stay here."
        icon={CheckCircle2}
        kind="history"
        items={historyRows}
        loading={loading}
        query={query}
        editable={false}
      />

      {editable && <BatchDecisionConfirm item={selected} decision={decision} busy={busy} error={actionError} onClose={closeConfirm} onConfirm={submitDecision} />}
    </div>
  )
}
