import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, DangerButton } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/FormField"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/toast"
import { checkQty, errorMessage, fmtQty } from "@/lib/stock"
import { useInspectPurchaseMutation } from "@/purchase/shared/purchasingApi"
import { cn } from "@/lib/utils"

/*
  The IQC check of ONE purchase. The purchase manager already counted what arrived (Received); for every component
  the inspector only writes how many of those pieces are REJECTED (starts at 0).
  Accepted = Received - Rejected goes to the store manager. Rejected pieces stay with IQC and need a REASON (saved as
  that line's remarks, so the Purchase Manager sees why). A component with nothing accepted is rejected; if nothing at
  all is accepted, the whole purchase is rejected. Both lists (accepted and rejected) stay in the IQC history.
*/
const receivedOf = (it) => Math.round(Number(it.quantity_received ?? it.quantity_ordered) * 100)
export default function InspectModal({ purchase, onClose }) {
  const toast = useToast()
  const [inspect, { isLoading: saving }] = useInspectPurchaseMutation()

  const [rows, setRows] = useState(() =>
    purchase.items.map((it) => ({ id: it.id, bad: "0", reason: "" }))
  )
  const [remarks, setRemarks] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  // live numbers for every line (cents = integer hundredths, same as the server)
  const lines = useMemo(
    () =>
      purchase.items.map((it, i) => {
        const r = rows[i]
        const received = receivedOf(it)
        const bad = checkQty(r.bad === "" ? "0" : r.bad, "Rejected", { allowZero: true })
        const badError = bad.error || (bad.cents > received ? "More than received" : "")
        const good = badError ? 0 : received - bad.cents
        const hasBad = !badError && bad.cents > 0
        const reasonError = hasBad && !r.reason.trim() ? "Enter the reason" : ""
        return { received, bad, badError, good, hasBad, reasonError, ok: !badError && !reasonError }
      }),
    [purchase.items, rows]
  )

  const allValid = lines.every((l) => l.ok)
  const goodTotal = lines.reduce((s, l) => s + l.good, 0)
  const badTotal = lines.reduce((s, l) => s + (l.badError ? 0 : l.bad.cents), 0)
  const rejectedCount = lines.filter((l) => l.ok && l.good === 0).length
  const rejecting = allValid && goodTotal === 0

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (!allValid) { setShowErrors(true); return }
    try {
      await inspect({
        id: purchase.id,
        remarks: remarks.trim(),
        items: rows.map((r, i) => ({
          id: r.id,
          rejected: lines[i].bad.value,
          remarks: lines[i].hasBad ? r.reason.trim() : "",
        })),
      }).unwrap()
      toast.success(
        rejecting
          ? `${purchase.po_number} rejected`
          : `${purchase.po_number}: ${fmtQty(goodTotal / 100)} accepted pieces sent to the store${badTotal ? `, ${fmtQty(badTotal / 100)} rejected kept with IQC` : ""}`
      )
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not save the inspection."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={saving}
      size="xl"
      title={`Inspect ${purchase.po_number}`}
      description={`${purchase.supplier} · enter how many received pieces are rejected. The rest go to the store.`}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          {rejecting ? (
            <DangerButton type="submit" busy={saving}>Reject purchase</DangerButton>
          ) : (
            <Button type="submit" size="lg" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Send {fmtQty(goodTotal / 100)} accepted pieces to store
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="w-36">Rejected</TableHead>
                <TableHead className="w-28 text-right">Accepted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((it, i) => {
                const l = lines[i]
                return (
                  <TableRow key={it.id} className={cn(l.hasBad && "bg-cf-red-soft/40")}>
                    <TableCell className="align-top">
                      <p className="mt-2 font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.sku}</p>
                      {l.hasBad && (
                        <div className="mt-2">
                          <TextInput
                            aria-label={`Reason for rejecting ${it.name}`}
                            placeholder="Why rejected? e.g. damaged, wrong spec"
                            maxLength={200}
                            value={rows[i].reason}
                            error={showErrors && l.reasonError}
                            onChange={(e) => set(i, { reason: e.target.value })}
                          />
                          {showErrors && l.reasonError && <p className="mt-1 text-xs text-destructive">{l.reasonError} for the rejected pieces.</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="pt-4 text-right align-top tabular-nums">
                      {fmtQty(l.received / 100)} {it.unit}
                      {l.received !== Math.round(Number(it.quantity_ordered) * 100) && (
                        <span className="block text-xs text-muted-foreground">of {fmtQty(it.quantity_ordered)} ordered</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <TextInput
                        inputMode="decimal"
                        aria-label={`Rejected pieces of ${it.name}`}
                        value={rows[i].bad}
                        error={!!l.badError}
                        onChange={(e) => set(i, { bad: e.target.value })}
                      />
                      {l.badError ? (
                        <p className="mt-1 text-xs text-destructive">{l.badError}</p>
                      ) : (
                        l.good > 0 && (
                          <button type="button" className="mt-1 text-xs font-medium text-destructive underline-offset-2 hover:underline" onClick={() => set(i, { bad: String(l.received / 100) })}>
                            Reject all
                          </button>
                        )
                      )}
                    </TableCell>
                    <TableCell className="pt-4 text-right align-top">
                      <span className={cn("font-semibold tabular-nums", l.good > 0 ? "text-success" : "text-destructive")}>
                        {l.badError ? "-" : fmtQty(l.good / 100)}
                      </span>
                      {!l.badError && l.good === 0 && <span className="block text-xs font-medium text-destructive">Rejected</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border text-center">
          {[
            ["Accepted (to store)", fmtQty(goodTotal / 100), "text-success"],
            ["Rejected (stay with IQC)", fmtQty(badTotal / 100), badTotal > 0 ? "text-destructive" : ""],
            ["Components rejected", `${rejectedCount} of ${rows.length}`, rejectedCount > 0 ? "text-destructive" : ""],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-card px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
              <p className={`mt-0.5 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {rejecting && (
          <Notice title="Nothing accepted">
            The whole purchase will be rejected and nothing reaches the store manager.
          </Notice>
        )}

        <div>
          <label htmlFor="iqc-remarks" className="mb-1.5 block text-[13px] font-semibold">Overall remarks</label>
          <TextInput
            id="iqc-remarks"
            placeholder="Optional, for example: 2 reels damaged in transit"
            maxLength={500}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
