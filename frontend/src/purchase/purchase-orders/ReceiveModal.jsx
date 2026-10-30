import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/FormField"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/toast"
import { checkQty, errorMessage, fmtQty } from "@/lib/stock"
import { useReceivePurchaseMutation } from "@/purchase/shared/purchasingApi"

/*
  The purchase manager marks a purchase received: for every component he writes how many pieces actually arrived
  (starts at the ordered quantity). These counts go to IQC, which only decides how many of them are rejected.
*/
export default function ReceiveModal({ purchase, onClose }) {
  const toast = useToast()
  const [receive, { isLoading: saving }] = useReceivePurchaseMutation()
  const [rows, setRows] = useState(() => purchase.items.map((it) => String(Number(it.quantity_ordered))))
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const lines = useMemo(
    () =>
      purchase.items.map((it, i) => {
        const rec = checkQty(rows[i], "Received", { allowZero: true })
        return { rec, diff: rec.error ? 0 : rec.cents - Math.round(Number(it.quantity_ordered) * 100) }
      }),
    [purchase.items, rows]
  )
  const total = lines.reduce((s, l) => s + (l.rec.error ? 0 : l.rec.cents), 0)
  const allValid = lines.every((l) => !l.rec.error)

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (!allValid || total === 0) { setShowErrors(true); return }
    try {
      await receive({ id: purchase.id, items: purchase.items.map((it, i) => ({ id: it.id, received: lines[i].rec.value })) }).unwrap()
      toast.success(`${purchase.po_number} marked as received`)
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not mark the purchase received."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={saving}
      size="lg"
      title={`Receive ${purchase.po_number}`}
      description={`${purchase.supplier} · how many pieces of each component arrived?`}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Mark received ({fmtQty(total / 100)} pcs)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}
        {showErrors && allValid && total === 0 && <Notice title="Nothing received">Enter the pieces that arrived.</Notice>}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="w-40">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((it, i) => {
                const l = lines[i]
                return (
                  <TableRow key={it.id}>
                    <TableCell className="align-top">
                      <p className="mt-2 font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.sku}</p>
                    </TableCell>
                    <TableCell className="pt-4 text-right align-top tabular-nums">{fmtQty(it.quantity_ordered)} {it.unit}</TableCell>
                    <TableCell className="align-top">
                      <TextInput
                        inputMode="decimal"
                        aria-label={`Received quantity of ${it.name}`}
                        value={rows[i]}
                        error={showErrors && l.rec.error}
                        onChange={(e) => setRows((rs) => rs.map((r, k) => (k === i ? e.target.value : r)))}
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
      </div>
    </Modal>
  )
}
