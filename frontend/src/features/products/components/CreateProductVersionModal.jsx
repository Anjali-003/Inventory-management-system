import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, GitBranch, Loader2 } from "lucide-react"
import { productsService } from "@/features/products/productsService"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Field, selectClass } from "@/components/FormField"
import { Notice } from "@/components/feedback"
import { errorMessage } from "@/lib/stock"

const versionLabel = (product) => product?.version_label || `v${product?.version_major ?? 1}.${product?.version_minor ?? 0}`

/** Select the source product version whose BOM should seed a new, independent version. */
export default function CreateProductVersionModal({ open, products = [], onClose, onContinue }) {
  const [productId, setProductId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === productId) || null,
    [products, productId]
  )

  useEffect(() => {
    if (!open) return
    setProductId("")
    setBusy(false)
    setError("")
    lock.current = false
  }, [open])

  const continueToBom = async (event) => {
    event.preventDefault()
    if (lock.current) return
    if (!selectedProduct) {
      setError("Choose the product version you want to use as the starting point.")
      return
    }

    lock.current = true
    setBusy(true)
    setError("")
    try {
      const { data } = await productsService.getBom(selectedProduct.id)
      onContinue(selectedProduct, data)
    } catch (err) {
      setError(errorMessage(err, "Could not load this product's BOM."))
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title="Create product version"
      description="Choose an existing product. Its BOM will be copied into a new version, so the current product and BOM remain unchanged."
      onSubmit={continueToBom}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" size="lg" disabled={busy || products.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            Continue to BOM
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice title="Could not start a new version">{error}</Notice>}
        <Field label="Product to version" htmlFor="product-version-source" required hint="Select the version you want to copy. A new SKU and version number will be created.">
          <select
            id="product-version-source"
            data-autofocus
            className={`${selectClass} w-full`}
            value={productId}
            disabled={busy || products.length === 0}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Choose a product...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.sku} · {versionLabel(product)}
              </option>
            ))}
          </select>
        </Field>

        {selectedProduct ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{selectedProduct.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedProduct.sku}</p>
              </div>
              <Badge variant="success">Source version · {versionLabel(selectedProduct)}</Badge>
            </div>
            <p className="mt-3 text-sm text-emerald-900">
              The next version will get a new SKU and version label. You can add, remove or change BOM components without changing this version.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <GitBranch className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>Select a product to load its current BOM into the editor.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
