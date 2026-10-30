import { useCallback, useState } from "react"
import { useDispatch } from "react-redux"
import { RefreshCw } from "lucide-react"
import { useGetQCFailedQuery } from "@/production/production/productionApi"
import { qcFailedService } from "@/production/production/qcFailedService"
import { baseApi } from "@/api/baseApi"
import ReworkWorkspace from "@/production/production/components/ReworkWorkspace"
import ReworkSubmitModal from "@/production/production/components/ReworkSubmitModal"
import { errorMessage } from "@/lib/stock"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/core/auth/usePermissions"

export default function QCFailed() {
  const toast = useToast()
  const dispatch = useDispatch()
  const { canEdit } = usePermissions()
  const editable = canEdit("qcFailed")
  const { data: items = [], isLoading: loading, error: loadError, refetch } = useGetQCFailedQuery()
  const [actionError, setActionError] = useState("")
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load QC recovery batches.") : "")
  const [busy, setBusy] = useState(false)
  const [submitFor, setSubmitFor] = useState(null)
  const [remarks, setRemarks] = useState("")
  const [submitError, setSubmitError] = useState("")

  const load = useCallback(async () => {
    setActionError("")
    dispatch(baseApi.util.invalidateTags(["Production", "QualityControl", "FinishedGoods", "Orders"]))
    await refetch()
  }, [dispatch, refetch])

  const openSubmit = (item) => {
    if (!editable || !item?.id || busy) return
    setSubmitError("")
    setRemarks("")
    setSubmitFor(item)
  }

  const closeSubmit = () => {
    if (busy) return
    setSubmitFor(null)
    setRemarks("")
    setSubmitError("")
  }

  const submitRework = async () => {
    if (!submitFor || !remarks.trim() || busy) return
    try {
      setBusy(true)
      setSubmitError("")
      // A failed batch can be repaired and submitted in one action.
      if (submitFor.rework_status === "NEEDS_REWORK") {
        await qcFailedService.startRework(submitFor.id)
        // Keep retry state accurate if the submission request below fails.
        setSubmitFor((current) => current ? { ...current, rework_status: "IN_PROGRESS" } : current)
      }
      const { data } = await qcFailedService.submitRework(submitFor.id, remarks)
      setSubmitFor(null)
      setRemarks("")
      toast.success(data?.message || "Batch submitted to Quality Control")
      await load()
    } catch (err) {
      console.error(err)
      setSubmitError(err.response?.data?.message || "Failed to submit rework to Quality Control.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 space-y-4 pb-8">
      <header className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary">Quality &amp; production</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight text-foreground">QC Rework</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Correct batches that failed QC and send them back for another inspection.</p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading} aria-label="Refresh QC rework batches">
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </header>

      {error && <Notice title="Something went wrong">{error}</Notice>}

      <ReworkWorkspace
        items={items}
        loading={loading}
        editable={editable}
        busy={busy}
        onSubmitRework={openSubmit}
      />

      {editable && submitFor && (
        <ReworkSubmitModal
          item={submitFor}
          remarks={remarks}
          onRemarksChange={setRemarks}
          busy={busy}
          error={submitError}
          onClose={closeSubmit}
          onSubmit={submitRework}
        />
      )}
    </div>
  )
}
