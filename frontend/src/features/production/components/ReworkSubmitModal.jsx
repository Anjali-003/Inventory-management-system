import { ArrowRight, X, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ReworkSubmitModal({ item, remarks, onRemarksChange, busy, error, onClose, onSubmit }) {
  if (!item) return null
  const valid = String(remarks || "").trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="rework-submit-title" className="w-full max-w-lg overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex min-w-0 items-start gap-3 border-b px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cf-green-soft text-primary"><Wrench className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="rework-submit-title" className="text-lg font-semibold">Submit batch for QC retest</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{item.order_number} · {item.product_name}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="Close submit rework dialog"><X /></Button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-destructive/20 bg-cf-red-soft p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Original QC failure</p>
            <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed">{item.qc_remarks || "No remark recorded for this legacy failure."}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="production-rework-remarks" className="block text-sm font-medium">What was fixed? <span className="text-destructive">*</span></label>
            <textarea
              id="production-rework-remarks"
              value={remarks}
              onChange={(event) => onRemarksChange(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe the corrective work performed and checks completed..."
              disabled={busy}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>Saved in rework history and sent to QC.</span><span>{remarks.length}/2000</span></div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-cf-red-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={busy || !valid}>{busy ? "Submitting..." : "Submit to QC"} <ArrowRight className="size-4" /></Button>
        </div>
      </section>
    </div>
  )
}
