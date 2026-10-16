import { useState } from "react"
import { motion } from "motion/react"
import { Check, Loader2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { PRESS_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useCreatePurchaseMutation } from "@/features/purchasing/purchasingApi"
import { qtyWithUnit } from "@/features/purchasing/purchasingUtils"

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground"
const ERR = "mt-1.5 text-xs font-medium text-destructive"
// 16px + 44px tall on a phone, 13px + 36px with a mouse (iOS zooms the page in on anything smaller than 16px).
const INPUT =
  "h-11 w-full rounded-[10px] border bg-card px-3 text-base outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:h-9 sm:text-[13px]"

/*
  Purchase manager: place the order for the components the Operations Admin sent for ONE approved order.
  He cannot add a component or change a quantity: the lines come from the Operations Admin's list and the
  server takes the quantities from that list again. He can only choose which lines go on this order
  (e.g. different suppliers -> place the order twice) and who the supplier is.
  `lines` = the lines of that list that are still to be ordered.
  Later: Received -> Send to IQC (buttons on the Purchase page).

  Each component is a big tick card (the whole card is the tap target), so it is easy to hit on a phone.
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

  const supplierBad = showErrors && !!supplierError

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
          <MktBtn onClick={onClose} disabled={saving}>Cancel</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Place order
          </MktBtn>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-cf-red-soft px-4 py-3 text-sm text-destructive">
            <p className="font-semibold">Could not save</p>
            <p className="mt-0.5 opacity-90">{serverError}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="po-supplier" className={LABEL}>Supplier <span className="text-destructive" aria-hidden="true">*</span></label>
            <input
              id="po-supplier"
              maxLength={150}
              autoComplete="off"
              value={supplier}
              aria-invalid={supplierBad ? true : undefined}
              onChange={(e) => setSupplier(e.target.value)}
              className={cn(INPUT, supplierBad ? "border-destructive" : "border-cf-line-strong")}
            />
            {supplierBad && <p className={ERR}>{supplierError}</p>}
          </div>
          <div>
            <label htmlFor="po-notes" className={LABEL}>Notes</label>
            <input id="po-notes" maxLength={500} autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(INPUT, "border-cf-line-strong")} />
            <p className="mt-1.5 text-xs text-muted-foreground">Optional, for example the invoice number.</p>
          </div>
        </div>

        <div>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">Components to order <span className="text-destructive" aria-hidden="true">*</span></p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                <span className="font-bold tabular-nums text-foreground">{picked.size}</span> of {lines.length} selected
              </p>
              <button
                type="button"
                onClick={() => setPicked(allPicked ? new Set() : new Set(lines.map((l) => l.request_item_id)))}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-cf-green-soft focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {allPicked ? "Clear all" : "Select all"}
              </button>
            </div>
          </div>

          <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-2">
            {lines.map((l) => {
              const on = picked.has(l.request_item_id)
              return (
                <motion.li key={l.request_item_id} variants={rise} whileTap={PRESS_SOFT}>
                  <label
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-[background-color,border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring/60",
                      on ? "border-emerald-500/60 bg-emerald-50/70 shadow-[0_1px_2px_rgba(16,185,129,0.12)]" : "border-cf-line-strong bg-card hover:bg-muted/50"
                    )}
                  >
                    <input type="checkbox" aria-label={`Order ${l.name}`} className="peer sr-only" checked={on} onChange={() => toggle(l.request_item_id)} />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors duration-150",
                        on ? "border-transparent bg-gradient-to-br from-emerald-500 to-teal-700 text-white" : "border-slate-300 bg-white text-transparent"
                      )}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold leading-snug">{l.name}</span>
                      {l.sku && <span className="block text-xs text-muted-foreground">{l.sku}</span>}
                    </span>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">{qtyWithUnit(l.quantity, l.unit)}</span>
                  </label>
                </motion.li>
              )
            })}
          </motion.ul>
          {showErrors && linesError && <p className={ERR}>{linesError}</p>}
        </div>
      </div>
    </Modal>
  )
}
