import { useState } from "react"
import { Modal } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import api from "@/api/api"

/* Super Admin: the product's selling price and GST % (the price list every bill starts from). */
export default function SetPriceDialog({ product, onClose, onSaved }) {
  const toast = useToast()
  const [price, setPrice] = useState(product?.selling_price ?? "")
  const [gst, setGst] = useState(product?.gst_percent ?? "18")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    try {
      setBusy(true)
      setError("")
      await api.put(`/products/${product.id}/price`, { selling_price: price, gst_percent: gst })
      toast.success(`Price of ${product.name} saved`)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, "Could not save the price."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} busy={busy} size="sm" title="Selling price" description={product?.name} onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy}>{busy ? "Saving..." : "Save price"}</Button></>}>
      <div className="space-y-4">
        <Field label="Price per piece (₹, before GST)" htmlFor="price-value" hint="Marketing's bill starts from this. A lower rate on a bill needs a reason.">
          <TextInput id="price-value" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="GST %" htmlFor="price-gst" required>
          <TextInput id="price-gst" type="number" min="0" max="100" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} />
        </Field>
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
