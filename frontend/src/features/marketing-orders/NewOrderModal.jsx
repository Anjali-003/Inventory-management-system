import { useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import { BIG_MODAL, MKT_FIELD, MKT_FIELD_BAD, MKT_FIELD_OK, MktButton, MktField, MktNotice } from "./mktUi"
import { useCreateMarketingOrderMutation, useGetMarketingProductsQuery } from "./marketingOrdersApi"

const EMPTY = []
const blank = () => ({ key: Math.random().toString(36).slice(2), product: "", qty: "1" })

/* New order: one or more products with whole-number quantities. It is saved as a DRAFT; sending is a separate step. */
export default function NewOrderModal({ onClose }) {
  const toast = useToast()
  const { data, isLoading } = useGetMarketingProductsQuery()
  const products = data ?? EMPTY
  const [create, { isLoading: saving }] = useCreateMarketingOrderMutation()

  const [rows, setRows] = useState(() => [blank()])
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const used = new Set(rows.map((r) => r.product))

  const rowError = (r) => {
    if (!r.product) return "Select a product"
    if (!/^\d+$/.test(r.qty) || Number(r.qty) <= 0) return "Quantity must be a whole number above 0"
    return ""
  }

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (rows.some(rowError)) { setShowErrors(true); return }
    try {
      const order = await create({ items: rows.map((r) => ({ productId: Number(r.product), quantity: Number(r.qty) })) }).unwrap()
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
      size="xl"
      className={BIG_MODAL}
      title="New order"
      description="Add the products, save, then send it to the Operations Admin when it is ready."
      footer={
        <>
          <MktButton variant="outline" onClick={onClose} disabled={saving}>Cancel</MktButton>
          <MktButton type="submit" disabled={saving || isLoading}>
            {saving && <Loader2 className="animate-spin" />}
            Save as draft
          </MktButton>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && <MktNotice title="Could not save">{serverError}</MktNotice>}

        {rows.map((r, i) => {
          const err = showErrors ? rowError(r) : ""
          return (
            <div key={r.key} className="grid items-start gap-4 sm:grid-cols-[1fr_10rem_auto]">
              <MktField label={i === 0 ? "Product" : ""} htmlFor={`mo-product-${r.key}`} error={err && !r.product ? err : ""}>
                <select id={`mo-product-${r.key}`} className={`${MKT_FIELD} pr-10 ${err && !r.product ? MKT_FIELD_BAD : MKT_FIELD_OK}`} value={r.product} onChange={(e) => set(r.key, { product: e.target.value })}>
                  <option value="">Select a product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={used.has(String(p.id)) && r.product !== String(p.id)}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </MktField>
              <MktField label={i === 0 ? "Quantity" : ""} htmlFor={`mo-qty-${r.key}`} error={err && r.product ? err : ""}>
                <input id={`mo-qty-${r.key}`} type="number" min="1" step="1" inputMode="numeric" className={`${MKT_FIELD} ${err && r.product ? MKT_FIELD_BAD : MKT_FIELD_OK}`} aria-invalid={err && r.product ? true : undefined} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} />
              </MktField>
              <div className="sm:pt-8">
                <MktButton variant="outline" size="icon" aria-label="Remove product" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Trash2 />
                </MktButton>
              </div>
            </div>
          )
        })}

        <MktButton variant="outline" onClick={() => setRows((rs) => [...rs, blank()])} disabled={rows.length >= products.length && products.length > 0}>
          <Plus /> Add another product
        </MktButton>
      </div>
    </Modal>
  )
}
