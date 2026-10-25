import { CheckCircle2, X, XCircle } from "lucide-react"
import { MktBtn } from "@/features/marketing-orders/mktKit"

export default function BatchDecisionConfirm({
  item,
  decision,
  remarks = "",
  onRemarksChange,
  sample = { size: "", failed: "" },
  onSampleChange,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  if (!item || !decision) return null
  const passing = decision === "PASS"
  const hasRemark = String(remarks || "").trim().length > 0
  const size = Number(sample.size)
  const failed = Number(sample.failed)
  const batch = Number(item.quantityCompleted || 0)
  const sampleOk = Number.isInteger(size) && size > 0 && size <= batch && Number.isInteger(failed) && failed >= 0 && failed <= size
    && (passing ? failed === 0 : failed > 0)
  const sampleInput = "w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-base tabular-nums outline-none focus-visible:border-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-600/20"

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="qc-confirm-title" className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b-2 border-slate-200 bg-slate-50 px-5 py-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${passing ? "bg-cf-green-soft text-primary" : "bg-cf-red-soft text-destructive"}`}>
            {passing ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="qc-confirm-title" className="text-lg font-extrabold text-slate-950">{passing ? "Pass this batch?" : "Fail this batch?"}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{item.orderNumber} · {item.productName}</p>
            <p className="mt-1 text-xs text-muted-foreground">QC attempt {item.attemptNumber || 1}</p>
          </div>
          <MktBtn variant="ghost" size="icon" aria-label="Close confirmation" onClick={onClose} disabled={busy}><X /></MktBtn>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
            <div><p className="text-xs text-muted-foreground">Batch completed</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Ordered quantity</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.orderedQuantity || 0).toLocaleString()}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qc-sample-size" className="block text-sm font-medium">Pieces checked <span className="text-destructive">*</span></label>
              <input id="qc-sample-size" type="number" min="1" max={batch} step="1" value={sample.size} disabled={busy} className={sampleInput}
                onChange={(event) => onSampleChange({ ...sample, size: event.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Random pieces from the {batch.toLocaleString()} in the batch</p>
            </div>
            <div>
              <label htmlFor="qc-sample-failed" className="block text-sm font-medium">Pieces failed <span className="text-destructive">*</span></label>
              <input id="qc-sample-failed" type="number" min={passing ? 0 : 1} step="1" value={sample.failed} disabled={busy || passing} className={sampleInput}
                onChange={(event) => onSampleChange({ ...sample, failed: event.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">{passing ? "Pass means every checked piece was good" : "Even 1 bad piece fails the whole batch"}</p>
            </div>
          </div>
          <p className="leading-relaxed text-muted-foreground">
            {passing
              ? "This confirms the batch has passed Quality Control. It will be released to Finished Goods for packaging."
              : "This records a failed QC attempt and sends the batch to Production for rework. A clear failure remark is required."}
          </p>
          {!passing && (
            <div className="space-y-2">
              <label htmlFor="qc-failure-remarks" className="block text-sm font-medium">Reason for failure <span className="text-destructive">*</span></label>
              <textarea
                id="qc-failure-remarks"
                value={remarks}
                onChange={(event) => onRemarksChange(event.target.value)}
                rows={4}
                maxLength={2000}
                required
                placeholder="Describe the defect, failed check, or issue that Production must fix..."
                className="w-full resize-y rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-offset-background placeholder:text-slate-500 focus-visible:border-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-600/20"
                disabled={busy}
              />
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Saved in QC history and shown to Production.</span>
                <span className={remarks.length > 1900 ? "text-destructive" : ""}>{remarks.length}/2000</span>
              </div>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-cf-red-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t-2 border-slate-200 bg-slate-50 px-5 py-4">
          <MktBtn variant="outline" onClick={onClose} disabled={busy}>No, go back</MktBtn>
          <MktBtn variant={passing ? "primary" : "danger"} onClick={onConfirm} disabled={busy || !sampleOk || (!passing && !hasRemark)}>
            {busy ? "Saving..." : passing ? "Yes, Pass batch" : "Yes, Fail batch"}
          </MktBtn>
        </div>
      </section>
    </div>
  )
}
