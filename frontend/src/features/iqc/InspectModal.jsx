import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, DangerButton } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/FormField"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/toast"
import { checkQty, errorMessage, fmtQty } from "@/lib/stock"
import { useInspectPurchaseMutation } from "@/features/purchasing/purchasingApi"

/*
  The IQC check of ONE purchase. For every component the inspector confirms the received count
  (starts at the ordered quantity, change it if the count differs) and TICKS the component when it is fine.
  Ticked components go to the store manager with their received count. Unticked components are rejected:
  they stay with IQC and can be downloaded as an Excel file afterwards. If nothing is ticked the whole
  purchase is rejected. Every rejected component needs a REASON (saved as that line's remarks, so the
  Purchase Manager sees why it was rejected). The overall remark is optional.
*/
export default function InspectModal({ purchase, onClose }) {
  const toast = useToast()
  const [inspect, { isLoading: saving }] = useInspectPurchaseMutation()

  const [rows, setRows] = useState(() =>
    purchase.items.map((it) => ({ id: it.id, received: String(Number(it.quantity_ordered)), approve: false, reason: "" }))
  )
  const [remarks, setRemarks] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const setAll = (approve) => setRows((rs) => rs.map((r) => ({ ...r, approve })))

  // live numbers for every line (cents = integer hundredths, same as the server)
  const lines = useMemo(
    () =>
      purchase.items.map((it, i) => {
        const r = rows[i]
        const rec = checkQty(r.received, "Received quantity", { allowZero: true })
        const counted = !rec.error
        const tickError = r.approve && counted && rec.cents <= 0 ? "Nothing received" : ""
        const reasonError = !r.approve && !r.reason.trim() ? "Enter the reason for rejecting this component" : ""
        const ordered = Math.round(Number(it.quantity_ordered) * 100)
        return {
          rec, tickError, reasonError,
          ok: counted && !tickError && !reasonError,
          approved: r.approve ? rec.cents : 0,
          diff: !rec.error ? rec.cents - ordered : 0, // < 0 short, > 0 excess
        }
      }),
    [purchase.items, rows]
  )

  const allValid = lines.every((l) => l.ok)
  const sum = (f) => lines.reduce((s, l) => s + (l.ok ? f(l) : 0), 0)
  const approvedTotal = sum((l) => l.approved)
  const ticked = rows.filter((r) => r.approve).length
  const rejectedCount = rows.length - ticked
  const allTicked = rows.length > 0 && ticked === rows.length
  const rejecting = ticked === 0

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (!allValid) { setShowErrors(true); return }
    try {
      await inspect({
        id: purchase.id,
        remarks: remarks.trim(),
        items: rows.map((r, i) => ({ id: r.id, approve: r.approve, received: lines[i].rec.value, remarks: r.approve ? "" : r.reason.trim() })),
      }).unwrap()
      toast.success(
        rejecting
          ? `${purchase.po_number} rejected`
          : `${purchase.po_number}: ${ticked} component${ticked === 1 ? "" : "s"} sent to the store manager${rejectedCount ? `, ${rejectedCount} rejected` : ""}`
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
      description={`${purchase.supplier} · check the received counts, then tick every component that is fine.`}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          {rejecting ? (
            <DangerButton type="submit" busy={saving}>Reject purchase</DangerButton>
          ) : (
            <Button type="submit" size="lg" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Send to store ({ticked})
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
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary"
                    aria-label="Tick all components"
                    checked={allTicked}
                    onChange={(e) => setAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="w-36">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((it, i) => {
                const l = lines[i]
                return (
                  <TableRow key={it.id} className={rows[i].approve ? "" : "bg-muted/30"}>
                    <TableCell className="align-top">
                      <input
                        type="checkbox"
                        className="mt-2.5 size-4 cursor-pointer accent-primary"
                        aria-label={`Approve ${it.name}`}
                        checked={rows[i].approve}
                        onChange={(e) => set(i, { approve: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.sku}</p>
                      {showErrors && l.tickError && <p className="mt-1 text-xs text-destructive">{l.tickError}. Untick it to reject.</p>}
                      {!rows[i].approve && (
                        <div className="mt-2">
                          <TextInput
                            aria-label={`Rejection reason for ${it.name}`}
                            placeholder="Why is this rejected? e.g. damaged, wrong spec"
                            maxLength={200}
                            value={rows[i].reason}
                            error={showErrors && l.reasonError}
                            onChange={(e) => set(i, { reason: e.target.value })}
                          />
                          {showErrors && l.reasonError && <p className="mt-1 text-xs text-destructive">{l.reasonError}.</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(it.quantity_ordered)} {it.unit}</TableCell>
                    <TableCell className="align-top">
                      <TextInput
                        inputMode="decimal"
                        aria-label={`Received quantity of ${it.name}`}
                        value={rows[i].received}
                        error={showErrors && l.rec.error}
                        onChange={(e) => set(i, { received: e.target.value })}
                      />
                      {showErrors && l.rec.error ? (
                        <p className="mt-1 text-xs text-destructive">{l.rec.error}</p>
                      ) : l.diff < 0 ? (
                        <p className="mt-1 text-xs font-medium text-warning">Short by {fmtQty(-l.diff / 100)}</p>
                      ) : l.diff > 0 ? (
                        <p className="mt-1 text-xs font-medium text-cf-blue">Excess {fmtQty(l.diff / 100)}</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border text-center">
          {[
            ["Ticked (to store)", `${ticked} of ${rows.length}`, "text-primary"],
            ["Not ticked (rejected)", `${rejectedCount}`, rejectedCount > 0 ? "text-destructive" : ""],
            ["Pieces to store", fmtQty(approvedTotal / 100), "text-primary"],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-card px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
              <p className={`mt-0.5 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {rejecting ? (
          <Notice title="Nothing is ticked">
            The whole purchase will be rejected and will not reach the store manager. Tick the components that are fine to send them on.
          </Notice>
        ) : rejectedCount > 0 ? (
          <Notice title={`${rejectedCount} component${rejectedCount === 1 ? "" : "s"} will be rejected`}>
            Components you did not tick stay with IQC. You can download them as an Excel file from the Inspected list after saving.
          </Notice>
        ) : null}

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
