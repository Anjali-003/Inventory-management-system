import { useState } from "react"
import { PackageOpen } from "lucide-react"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { ConfirmDialog } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toast"
import { errorMessage, fmtQty } from "@/lib/stock"
import { useDecideExtraMaterialMutation, useGetExtraMaterialsQuery } from "./extraMaterialsApi"

const BADGE = { PENDING: ["warning", "Waiting for Store"], ISSUED: ["success", "Issued"], REJECTED: ["danger", "Rejected"] }
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/* Extra material requests. Store (canDecide) issues or rejects them; Production sees what happened to its asks. */
export default function ExtraMaterialList({ canDecide }) {
  const toast = useToast()
  const { data: rows = [], isLoading } = useGetExtraMaterialsQuery()
  const [decide, { isLoading: busy }] = useDecideExtraMaterialMutation()
  const [pending, setPending] = useState(null) // { row, decision }
  const [note, setNote] = useState("")
  const [error, setError] = useState("")

  const open = (row, decision) => { setPending({ row, decision }); setNote(""); setError("") }
  const confirm = async () => {
    try {
      await decide({ id: pending.row.id, decision: pending.decision, note }).unwrap()
      toast.success(pending.decision === "issue" ? "Issued. Component stock has gone down." : "Request rejected. Production has been told.")
      setPending(null)
    } catch (err) {
      setError(errorMessage(err, "Could not save."))
    }
  }

  if (isLoading) return <TableSkeleton rows={4} />
  if (!rows.length) return <EmptyState icon={PackageOpen} title="No extra material requests">When Production asks for more because a piece got damaged, it shows here with the reason.</EmptyState>

  return (
    <>
      <ul className="divide-y">
        {rows.map((r) => {
          const [variant, label] = BADGE[r.status] || ["neutral", r.status]
          const short = r.status === "PENDING" && r.onHand < r.quantity
          return (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.componentName} × {fmtQty(r.quantity)} {r.unit} <span className="text-xs font-normal text-muted-foreground">· {r.orderNumber}</span></p>
                <p className="mt-0.5 text-sm"><span className="font-semibold">{r.reasonLabel}:</span> {r.reason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Asked by {r.requestedByName} · {when(r.requestedAt)}
                  {r.decidedByName && ` · ${label} by ${r.decidedByName}, ${when(r.decidedAt)}`}
                  {r.decisionNote && ` · "${r.decisionNote}"`}
                </p>
                {short && <p className="mt-1 text-xs font-semibold text-destructive">Only {fmtQty(r.onHand)} {r.unit} in stock</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={variant}>{label}</Badge>
                {canDecide && r.status === "PENDING" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => open(r, "reject")}>Reject</Button>
                    <Button size="sm" onClick={() => open(r, "issue")} disabled={short}>Issue</Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} onConfirm={confirm} busy={busy}
        tone={pending?.decision === "reject" ? "danger" : "default"}
        title={pending?.decision === "issue" ? "Issue this extra material?" : "Reject this request?"}
        confirmLabel={pending?.decision === "issue" ? "Yes, issue" : "Yes, reject"}>
        {pending && <p>{pending.row.componentName} × {fmtQty(pending.row.quantity)} {pending.row.unit} for {pending.row.orderNumber}. {pending.decision === "issue" ? "Component stock goes down by this amount." : "Production will see your note."}</p>}
        <Field label={pending?.decision === "reject" ? "Why rejected?" : "Note (optional)"} htmlFor="extra-note" required={pending?.decision === "reject"}>
          <TextInput id="extra-note" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </ConfirmDialog>
    </>
  )
}
