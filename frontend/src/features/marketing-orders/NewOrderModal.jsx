import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { MktBtn, QtyStepper } from "./mktKit"
import { SPRING } from "./mktMotion"
import { rupees } from "./orderParts"
import { useCreateMarketingOrderMutation, useGetMarketingCustomersQuery, useGetMarketingProductsQuery } from "./marketingOrdersApi"

const EMPTY = []
// rate: the rate agreed with the customer per piece ("" = nothing agreed, the bill uses the price list); note: why below the list
const blank = (product = "", qty = "1", rate = "", note = "") => ({ key: Math.random().toString(36).slice(2), product, qty, rate, note })
const RATE_RE = /^\d+(\.\d{1,2})?$/

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground"
const ERR = "mt-1.5 text-xs font-medium text-destructive"
// 16px + 44px tall on a phone, 13px + 36px with a mouse. (The shared Select is 36px / 13px only, so it is not used here.)
const SELECT =
  "h-11 w-full rounded-[10px] border bg-card ps-3 pe-9 text-base outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:h-9 sm:text-[13px]"

/*
  New order: one or more products with whole-number quantities. It is saved as a DRAFT; sending is a separate step.
  Each product carries the rate agreed with the customer (rate lock): it starts at the price list and the bill later
  starts from it, whatever the price list says by then. A rate below the price list needs the reason.
  `from` (an earlier order, "Order again") fills in its customer, products and rates; the customer's date is asked again.
  Each product is its own card: on a phone the product picker is full width with the quantity stepper and the
  remove button under it; from `sm` up the three sit on one line.
*/
export default function NewOrderModal({ from = null, onClose }) {
  const toast = useToast()
  const { data, isLoading } = useGetMarketingProductsQuery()
  const products = data ?? EMPTY
  const [create, { isLoading: saving }] = useCreateMarketingOrderMutation()

  const [rows, setRows] = useState(() => (from?.items?.length
    ? from.items.map((i) => blank(String(i.product_id), String(i.quantity), String(i.agreed_rate ?? i.price ?? ""), i.agreed_note || ""))
    : [blank()]))
  const [deliveryDate, setDeliveryDate] = useState("")
  // the customer: picked from the saved ones (the list suggests them) or typed once and saved by the server
  const [customer, setCustomer] = useState(() => from?.customer_name || "")
  const { data: customers = EMPTY } = useGetMarketingCustomersQuery()
  const [showErrors, setShowErrors] = useState(false)
  const customerError = showErrors && !customer.trim() ? "Enter the customer this order is for" : ""
  const dateError = showErrors && !deliveryDate ? "Ask the customer when they need it" : ""
  const [serverError, setServerError] = useState("")
  const endRef = useRef(null)

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const used = new Set(rows.map((r) => r.product))

  // a product of an earlier order may no longer be sold
  const gone = (r) => !!r.product && !isLoading && !products.some((p) => String(p.id) === r.product)
  const rowError = (r) => {
    if (!r.product || gone(r)) return "Select a product"
    if (!/^\d+$/.test(r.qty) || Number(r.qty) <= 0) return "Quantity must be a whole number above 0"
    return ""
  }

  const picked = rows.filter((r) => r.product).length
  const units = rows.reduce((sum, r) => sum + (r.product && /^\d+$/.test(r.qty) ? Number(r.qty) : 0), 0)
  const priceOf = (id) => {
    const p = products.find((x) => String(x.id) === String(id))
    return p && p.selling_price !== null && p.selling_price !== undefined ? Number(p.selling_price) : null
  }
  // the rate the order is worth at: the agreed one, else the price list
  const rateOf = (r) => (RATE_RE.test(r.rate) ? Number(r.rate) : priceOf(r.product))
  // an agreed rate below the price list: a discount, which needs its reason
  const below = (r) => RATE_RE.test(r.rate) && priceOf(r.product) !== null && Number(r.rate) < priceOf(r.product)
  const rateError = (r) => {
    if (!r.product) return ""
    if (r.rate !== "" && !RATE_RE.test(r.rate)) return "Rate must be 0 or more, with at most 2 decimals"
    if (below(r) && r.note.trim().length < 3) return "Write why the rate is below the price list"
    return ""
  }
  const value = rows.reduce((sum, r) => sum + (r.product && /^\d+$/.test(r.qty) && rateOf(r) !== null ? Number(r.qty) * rateOf(r) : 0), 0)
  const unpriced = rows.filter((r) => r.product && rateOf(r) === null).length

  const addRow = () => {
    setRows((rs) => [...rs, blank()])
    // bring the new card into view inside the scrolling popup
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60)
  }

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (rows.some((r) => rowError(r) || rateError(r)) || !customer.trim() || !deliveryDate) { setShowErrors(true); return }
    // a saved customer by its exact name is sent by id; anything else is a new one the server saves
    const saved = customers.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase())
    try {
      const order = await create({
        ...(saved ? { customer_id: saved.id } : { customer_name: customer.trim() }),
        items: rows.map((r) => ({
          productId: Number(r.product), quantity: Number(r.qty),
          rate: r.rate === "" ? null : Number(r.rate), ...(below(r) ? { rate_note: r.note.trim() } : {}),
        })),
        required_by_date: deliveryDate,
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
      title={from ? `Order again: ${from.order_number}` : "New order"}
      description={from ? "Same customer and products. Change what you need, enter the date, then save." : "Add the products, save, then send it to the Operations Admin when it is ready."}
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
          <label className={LABEL} htmlFor="order-customer">Customer</label>
          <input
            id="order-customer"
            list="order-customer-list"
            value={customer}
            maxLength={150}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Type to pick a saved customer, or a new name"
            aria-invalid={customerError ? true : undefined}
            className={cn("h-10 w-full rounded-[10px] border bg-card px-3 text-sm outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15", customerError ? "border-destructive" : "border-input")}
          />
          <datalist id="order-customer-list">
            {customers.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
          {customerError
            ? <p className={ERR}>{customerError}</p>
            : <p className="mt-1 text-xs text-muted-foreground">A new name is saved, so it can be picked next time.</p>}
        </div>

        <div className="rounded-2xl border bg-gradient-to-br from-white to-slate-50/80 p-3.5 sm:p-4">
          <label className={LABEL} htmlFor="order-edd">
            Customer wants it by
          </label>
          <input
            id="order-edd"
            type="date"
            value={deliveryDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDeliveryDate(e.target.value)}
            aria-invalid={dateError ? true : undefined}
            className={cn("h-10 w-full rounded-[10px] border bg-card px-3 text-sm outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15", dateError ? "border-destructive" : "border-input")}
          />
          {dateError
            ? <p className={ERR}>{dateError}</p>
            : <p className="mt-1 text-xs text-muted-foreground">The date the customer asked for. The Operations Admin may give a different date.</p>}
        </div>

        <div className="relative space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((r, i) => {
              const err = showErrors ? rowError(r) : ""
              const productBad = !!err && (!r.product || gone(r))
              const qtyBad = !!err && !productBad
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
                        onChange={(e) => set(r.key, { product: e.target.value, rate: priceOf(e.target.value) === null ? "" : String(priceOf(e.target.value)) })}
                      >
                        <option value="">Select a product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id} disabled={used.has(String(p.id)) && r.product !== String(p.id)}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                      {productBad && <p className={ERR}>{err}</p>}
                      {r.product && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {priceOf(r.product) === null ? "No price list for this product yet: enter the agreed rate" : `Price list ${rupees(priceOf(r.product))} per piece`}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor={`mo-qty-${r.key}`} className={LABEL}>Quantity</label>
                      <QtyStepper id={`mo-qty-${r.key}`} value={r.qty} invalid={qtyBad} onChange={(v) => set(r.key, { qty: v })} />
                      {qtyBad && <p className={ERR}>{err}</p>}
                    </div>
                  </div>

                  {r.product && (() => {
                    const rateErr = showErrors ? rateError(r) : ""
                    const list = priceOf(r.product)
                    const off = RATE_RE.test(r.rate) && list ? Math.round(((Number(r.rate) - list) / list) * 100) : 0
                    return (
                      <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                        <div>
                          <label htmlFor={`mo-rate-${r.key}`} className={LABEL}>Agreed rate (₹ per piece)</label>
                          <input id={`mo-rate-${r.key}`} inputMode="decimal" value={r.rate} placeholder={list === null ? "Rate" : String(list)}
                            onChange={(e) => set(r.key, { rate: e.target.value.trim() })}
                            aria-invalid={rateErr && !below(r) ? true : undefined}
                            className={cn(SELECT, "pe-3 tabular-nums", rateErr && !below(r) ? "border-destructive" : "border-cf-line-strong")} />
                          {off !== 0 && <p className={cn("mt-1.5 text-xs font-medium", off < 0 ? "text-warning" : "text-success")}>{Math.abs(off)}% {off < 0 ? "below" : "above"} the price list</p>}
                          {r.rate === "" && <p className="mt-1.5 text-xs text-muted-foreground">Empty: the bill uses the price list.</p>}
                          {rateErr && !below(r) && <p className={ERR}>{rateErr}</p>}
                        </div>
                        {below(r) && (
                          <div>
                            <label htmlFor={`mo-note-${r.key}`} className={LABEL}>Why below the price list?</label>
                            <input id={`mo-note-${r.key}`} value={r.note} maxLength={255} placeholder="e.g. yearly contract, bulk order"
                              onChange={(e) => set(r.key, { note: e.target.value })}
                              aria-invalid={rateErr ? true : undefined}
                              className={cn(SELECT, "pe-3", rateErr ? "border-destructive" : "border-cf-line-strong")} />
                            {rateErr ? <p className={ERR}>{rateErr}</p> : <p className="mt-1.5 text-xs text-muted-foreground">The bill keeps this reason.</p>}
                          </div>
                        )}
                      </div>
                    )
                  })()}
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
            {/* a product without a price is not worth ₹0: its value is unknown, so it is never shown as ₹0 */}
            {picked > 0 && (unpriced === picked
              ? <span className="text-warning"> · price not set yet</span>
              : <>
                  {" · "}<span className="font-bold tabular-nums text-foreground">{rupees(value)}</span>
                  {unpriced > 0 && <span className="text-warning"> · {unpriced === 1 ? "1 product has" : `${unpriced} products have`} no price yet, not counted</span>}
                </>)}
          </p>
        </div>
      </div>
    </Modal>
  )
}
