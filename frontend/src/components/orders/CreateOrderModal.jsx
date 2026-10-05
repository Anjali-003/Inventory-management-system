import { useState } from "react"
import { Loader2 } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Field, TextInput, selectClass } from "../FormField"
import { Notice } from "../feedback"
import { Button } from "../ui/button"
import { errorMessage } from "../../lib/stock"
import { isPositiveInteger, toInt } from "../../lib/numbers"

// Mounted only while open, so every open starts with a fresh form.
export default function CreateOrderModal({ products, onClose, onCreated }) {
  const [product, setProduct] = useState("")
  const [qty, setQty] = useState("1")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    if (!product) return setError("Please select a product")
    if (!isPositiveInteger(qty)) return setError("Quantity must be a positive integer")

    setSaving(true)
    setError("")
    try {
      const { data } = await api.post("/orders", {
        items: [{ productId: Number(product), quantity: toInt(qty) }],
      })
      onCreated(data.orderNumber)
    } catch (err) {
      setError(errorMessage(err, "Failed to create order"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="sm"
      title="Create new order"
      description="Select a product and a whole-number quantity."
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Creating..." : "Create order"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Product" htmlFor="order-product" required>
          <select id="order-product" className={`${selectClass} w-full`} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Select a product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </Field>
        <Field label="Order quantity" htmlFor="order-qty" required hint="Whole numbers only, e.g. 1, 5, 20 or 100.">
          <TextInput id="order-qty" type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {error && <Notice>{error}</Notice>}
      </div>
    </Modal>
  )
}
