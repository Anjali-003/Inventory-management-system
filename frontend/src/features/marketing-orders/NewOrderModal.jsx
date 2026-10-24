import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { MktBtn, QtyStepper } from "./mktKit"
import { SPRING } from "./mktMotion"
import { useCreateMarketingOrderMutation, useGetMarketingProductsQuery } from "./marketingOrdersApi"

const EMPTY = []
const blank = () => ({ key: Math.random().toString(36).slice(2), product: "", qty: "1" })

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground"
const ERR = "mt-1.5 text-xs font-medium text-destructive"
// 16px + 44px tall on a phone, 13px + 36px with a mouse. (The shared Select is 36px / 13px only, so it is not used here.)
const SELECT =
  "h-11 w-full rounded-[10px] border bg-card ps-3 pe-9 text-base outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:h-9 sm:text-[13px]"

/*
  New order: one or more products with whole-number quantities. It is saved as a DRAFT; sending is a separate step.
  Each product is its own card: on a phone the product picker is full width with the quantity stepper and the
  remove button under it; from `sm` up the three sit on one line.
*/
export default function NewOrderModal({ onClose }) {
  const toast = useToast()
  const { data, isLoading } = useGetMarketingProductsQuery()
  const products = data ?? EMPTY
  const [create, { isLoading: saving }] = useCreateMarketingOrderMutation()

  const [rows, setRows] = useState(() => [blank()])
  const [deliveryDate, setDeliveryDate] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")
  const endRef = useRef(null)

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const used = new Set(rows.map((r) => r.product))

  const rowError = (r) => {
    if (!r.product) return "Select a product"
    if (!/^\d+$/.test(r.qty) || Number(r.qty) <= 0) return "Quantity must be a whole number above 0"
    return ""
  }

  const picked = rows.filter((r) => r.product).length
  const units = rows.reduce((sum, r) => sum + (r.product && /^\d+$/.test(r.qty) ? Number(r.qty) : 0), 0)

  const addRow = () => {
    setRows((rs) => [...rs, blank()])
    // bring the new card into view inside the scrolling popup
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60)
  }

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (rows.some(rowError)) { setShowErrors(true); return }
    try {
      const order = await create({
        items: rows.map((r) => ({ productId: Number(r.product), quantity: Number(r.qty) })),
        estimated_delivery_date: deliveryDate || null,
      }).unwrap()
      toast.success(`${order.order_number} saved as draft`)
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not save the order."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={saving}
      size="lg"
      title="New order"
      description="Add the products, save, then send it to the Operations Admin when it is ready."
      footer={
        <>
          <MktBtn onClick={onClose} disabled={saving}>Cancel</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={saving || isLoading}>
            {saving && <Loader2 className="animate-spin" />}
            Save as draft
          </MktBtn>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && (
          <div role="alert" className="rounded-xl border border-destructive/20 bg-cf-red-soft px-4 py-3 text-sm text-destructive">
            <p className="font-semibold">Could not save</p>
            <p className="mt-0.5 opacity-90">{serverError}</p>
          </div>
        )}

                <div className="rounded-2xl border bg-gradient-to-br from-white to-slate-50/80 p-3.5 sm:p-4">
          <label className={LABEL} htmlFor="order-edd">
            Estimated Delivery Date
          </label>
          <input
            id="order-edd"
            type="date"
            value={deliveryDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Target delivery commitment for this order (can be revised by Operations Admin).
          </p>
        </div>

        <div className="relative space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((r, i) => {
              const err = showErrors ? rowError(r) : ""
              const productBad = !!err && !r.product
              const qtyBad = !!err && !!r.product
              return (
                <motion.div
                  key={r.key}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                  className="rounded-2xl border bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-[0_1px_2px_rgba(22,34,30,0.04)] sm:p-4"
                >
                  {/* the remove button lives in the card's own header, so it never has to line up with a field label */}
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">Product {i + 1}</span>
                    <MktBtn variant="danger" size="icon" aria-label={`Remove product ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 />
                    </MktBtn>
                  </div>

                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <div>
                      <label htmlFor={`mo-product-${r.key}`} className={LABEL}>Product</label>
                      <select
                        id={`mo-product-${r.key}`}
                        className={cn(SELECT, productBad ? "border-destructive" : "border-cf-line-strong")}
                        aria-invalid={productBad ? true : undefined}
                        value={r.product}
                        onChange={(e) => set(r.key, { product: e.target.value })}
                      >
                        <option value="">Select a product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id} disabled={used.has(String(p.id)) && r.product !== String(p.id)}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      {productBad && <p className={ERR}>{err}</p>}
                    </div>

                    <div>
                      <label htmlFor={`mo-qty-${r.key}`} className={LABEL}>Quantity</label>
                      <QtyStepper id={`mo-qty-${r.key}`} value={r.qty} invalid={qtyBad} onChange={(v) => set(r.key, { qty: v })} />
                      {qtyBad && <p className={ERR}>{err}</p>}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <div ref={endRef} aria-hidden />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <MktBtn onClick={addRow} disabled={rows.length >= products.length && products.length > 0}>
            <Plus /> Add another product
          </MktBtn>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <span className="font-bold tabular-nums text-foreground">{picked}</span> {picked === 1 ? "product" : "products"} ·{" "}
            <span className="font-bold tabular-nums text-foreground">{fmtQty(units)}</span> units
          </p>
        </div>
      </div>
    </Modal>
  )
}
