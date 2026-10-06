import { useEffect, useRef, useState } from "react"
import { ClipboardList, Loader2, Plus } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Button } from "../ui/button"
import { Field, TextInput } from "../FormField"
import { Notice } from "../feedback"
import { SKU_RE, errorMessage } from "../../lib/stock"

/**
 * Add one product by hand. "Save & add BOM" saves and then opens the BOM editor for it.
 * onCreated(product, openBomNext)
 */
export default function AddProductModal({ open, onClose, onCreated }) {
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  useEffect(() => {
    if (!open) return
    setSku("")
    setName("")
    setDescription("")
    setErrors({})
    setFormError("")
    setBusy(false)
    lock.current = false
    let stale = false
    api
      .get("/products/next-sku")
      .then((r) => !stale && setSku((cur) => cur || r.data.sku))
      .catch(() => {}) // the SKU can still be typed by hand
    return () => {
      stale = true
    }
  }, [open])

  const validate = () => {
    const e = {}
    const code = sku.trim().toUpperCase()
    if (!code) e.sku = "SKU is required"
    else if (!SKU_RE.test(code)) e.sku = "Use letters, numbers, . _ - (2 to 50 characters)"
    if (!name.trim()) e.name = "Product name is required"
    else if (name.trim().length > 150) e.name = "At most 150 characters"
    if (description.length > 2000) e.description = "At most 2000 characters"
    return e
  }

  const submit = async (openBomNext) => {
    if (lock.current) return
    const e = validate()
    setErrors(e)
    setFormError("")
    if (Object.keys(e).length) {
      document.getElementById(e.sku ? "ap-sku" : e.name ? "ap-name" : "ap-desc")?.focus()
      return
    }
    lock.current = true
    setBusy(true)
    try {
      const { data } = await api.post("/products", { sku: sku.trim().toUpperCase(), name: name.trim(), description: description.trim() })
      onCreated(data, openBomNext)
    } catch (err) {
      const field = err?.response?.data?.field
      if (field && ["sku", "name", "description"].includes(field)) setErrors({ [field]: errorMessage(err) })
      else setFormError(errorMessage(err))
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Add product"
      description="Create a finished product. You can add its bill of materials right after."
      onSubmit={(ev) => {
        ev.preventDefault()
        submit(false)
      }}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => submit(true)} disabled={busy}>
            <ClipboardList />
            Save &amp; add BOM
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Save product
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <Notice title="Could not save the product">{formError}</Notice>}
        <Field label="SKU" htmlFor="ap-sku" required error={errors.sku} hint="Unique code. The next free one is filled in for you.">
          <TextInput id="ap-sku" value={sku} error={!!errors.sku} maxLength={50} autoComplete="off" disabled={busy} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Field label="Product name" htmlFor="ap-name" required error={errors.name}>
          <TextInput id="ap-name" data-autofocus value={name} error={!!errors.name} maxLength={150} autoComplete="off" disabled={busy} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="ap-desc" error={errors.description} hint="Optional.">
          <textarea
            id="ap-desc"
            rows={3}
            value={description}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
          />
        </Field>
      </div>
    </Modal>
  )
}
