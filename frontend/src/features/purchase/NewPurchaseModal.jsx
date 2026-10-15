import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/stock"
import { useCreatePurchaseMutation } from "@/features/purchasing/purchasingApi"
import { qtyWithUnit } from "@/features/purchasing/purchasingUtils"

/*
  Purchase manager: place the order for the components the Operations Admin sent for ONE approved order.
  He cannot add a component or change a quantity: the lines come from the Operations Admin's list and the
  server takes the quantities from that list again. He can only choose which lines go on this order
  (e.g. different suppliers -> place the order twice) and who the supplier is.
  `lines` = the lines of that list that are still to be ordered.
  Later: Received -> Send to IQC (buttons on the Purchase page).
*/
export default function NewPurchaseModal({ order, lines, onClose }) {
  const toast = useToast()
  const [create, { isLoading: saving }] = useCreatePurchaseMutation()

  const [supplier, setSupplier] = useState("")
  const [notes, setNotes] = useState("")
  const [picked, setPicked] = useState(() => new Set(lines.map((l) => l.request_item_id)))
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allPicked = picked.size === lines.length

  const supplierError = supplier.trim().length < 2 ? "Enter the supplier name" : ""
  const linesError = picked.size === 0 ? "Tick at least one component" : ""

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (supplierError || linesError) { setShowErrors(true); return }
    try {
      const po = await create({
        order_id: order.id,
        supplier: supplier.trim(),
        notes: notes.trim(),
        request_item_ids: lines.filter((l) => picked.has(l.request_item_id)).map((l) => l.request_item_id),
      }).unwrap()
      toast.success(`${po.po_number} order placed`)
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not save the purchase."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={saving}
      size="lg"
      title={`Place order · ${order.order_number}`}
      description="These are the components the Operations Admin asked you to buy. When the goods arrive, mark the purchase Received, then send it to IQC."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Place order
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="po-supplier" required error={showErrors ? supplierError : ""}>
            <TextInput id="po-supplier" maxLength={150} value={supplier} error={showErrors && supplierError} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="po-notes" hint="Optional, for example the invoice number.">
            <TextInput id="po-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold">Components to order <span className="text-destructive" aria-hidden="true">*</span></p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all components"
                      className="size-4 accent-primary"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(lines.map((l) => l.request_item_id)))}
                    />
                  </TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.request_item_id} className="cursor-pointer" onClick={() => toggle(l.request_item_id)}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Order ${l.name}`}
                        className="size-4 accent-primary"
                        checked={picked.has(l.request_item_id)}
                        onChange={() => toggle(l.request_item_id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{l.name}</p>
                      {l.sku && <p className="text-xs text-muted-foreground">{l.sku}</p>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{qtyWithUnit(l.quantity, l.unit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {showErrors && linesError && <p className="mt-1 text-xs text-destructive">{linesError}</p>}
        </div>
      </div>
    </Modal>
  )
}
