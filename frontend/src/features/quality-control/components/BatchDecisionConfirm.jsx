import { CheckCircle2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function BatchDecisionConfirm({ item, decision, busy, error, onClose, onConfirm }) {
  if (!item || !decision) return null
  const passing = decision === "PASS"

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="qc-confirm-title" className="w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${passing ? "bg-cf-green-soft text-primary" : "bg-cf-red-soft text-destructive"}`}>
            {passing ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="qc-confirm-title" className="text-lg font-semibold">{passing ? "Pass this batch?" : "Fail this batch?"}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{item.orderNumber} · {item.productName}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close confirmation" onClick={onClose} disabled={busy}><X /></Button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3">
            <div><p className="text-xs text-muted-foreground">Batch completed</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Ordered quantity</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.orderedQuantity || 0).toLocaleString()}</p></div>
          </div>
          <p className="leading-relaxed text-muted-foreground">
            {passing
              ? "This confirms the entire batch has passed Quality Control. It will be created in Finished Goods and can move to packaging."
              : "This records the entire batch as failed. It will remain in QC history and will not be sent to Finished Goods."}
          </p>
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-cf-red-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>No, go back</Button>
          <Button variant={passing ? "default" : "destructive"} onClick={onConfirm} disabled={busy}>
            {busy ? "Saving..." : passing ? "Yes, Pass batch" : "Yes, Fail batch"}
          </Button>
        </div>
      </section>
    </div>
  )
}
