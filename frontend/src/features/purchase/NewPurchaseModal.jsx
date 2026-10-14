import { useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { checkQty, errorMessage } from "@/lib/stock"
import { useCreatePurchaseMutation } from "@/features/purchasing/purchasingApi"
import ComponentPicker from "./ComponentPicker"

const blankLine = () => ({ key: Math.random().toString(36).slice(2), component: null, quantity: "" })

/* Purchase manager: place an order with a supplier. Later: Received -> Send to IQC (buttons on the Purchase page). */
export default function NewPurchaseModal({ onClose }) {
  const toast = useToast()
  const [create, { isLoading: saving }] = useCreatePurchaseMutation()

  const [supplier, setSupplier] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState([blankLine()])
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const set = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const supplierError = supplier.trim().length < 2 ? "Enter the supplier name" : ""
  const checked = lines.map((l) => ({ component: l.component ? "" : "Select a component", qty: checkQty(l.quantity, "Quantity").error || "" }))
  const valid = !supplierError && checked.every((c) => !c.component && !c.qty)

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (!valid) { setShowErrors(true); return }
    try {
      const po = await create({
        supplier: supplier.trim(),
        notes: notes.trim(),
        items: lines.map((l) => ({ component_id: l.component.id, quantity: checkQty(l.quantity, "Quantity").value })),
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
      title="New purchase"
      description="This places the order. When the goods arrive, mark it Received, then send it to IQC."
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
          <p className="mb-2 text-[13px] font-semibold">Components bought <span className="text-destructive" aria-hidden="true">*</span></p>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_7rem_2rem] items-start gap-2">
                <div>
                  <ComponentPicker
                    value={l.component}
                    usedIds={lines.map((x) => x.component?.id).filter(Boolean)}
                    error={showErrors && checked[i].component}
                    onSelect={(c) => set(l.key, { component: c })}
                    onClear={() => set(l.key, { component: null })}
                  />
                  {showErrors && checked[i].component && <p className="mt-1 text-xs text-destructive">{checked[i].component}</p>}
                </div>
                <div>
                  <TextInput
                    inputMode="decimal"
                    placeholder={l.component?.unit ? `Qty (${l.component.unit})` : "Qty"}
                    aria-label="Quantity ordered"
                    value={l.quantity}
                    error={showErrors && checked[i].qty}
                    onChange={(e) => set(l.key, { quantity: e.target.value })}
                  />
                  {showErrors && checked[i].qty && <p className="mt-1 text-xs text-destructive">{checked[i].qty}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            <Plus /> Add component
          </Button>
        </div>
      </div>
    </Modal>
  )
}
