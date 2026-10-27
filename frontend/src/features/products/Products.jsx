import { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Boxes, ClipboardList, FileUp, Pencil, Plus, SearchX, Upload } from "lucide-react"
import { productsService } from "@/features/products/productsService"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Modal } from "@/components/Modal"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UserCell from "@/components/UserCell"
import { errorMessage, fmtQty } from "@/lib/stock"
import { useToast } from "@/components/toast"
import AddProductModal from "./components/AddProductModal"
import ImportProductsModal from "./components/ImportProductsModal"
import ImportBomModal from "./components/ImportBomModal"
import BomEditorModal from "./components/BomEditorModal"
import { productsApi, useGetProductsQuery } from "./productsApi"

const EMPTY = []
const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/* The product's selling price (without GST): shown, and changed in place. Order values are worked out from it. */
function PriceCell({ product, onSaved }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const has = product.selling_price !== null && product.selling_price !== undefined

  const start = () => { setValue(has ? String(Number(product.selling_price)) : ""); setEditing(true) }
  const save = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const r = await productsService.setPrice(product.id, value.trim() === "" ? null : value.trim())
      onSaved(r.data)
      setEditing(false)
      toast.success(`${product.sku}: price saved.`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the price."))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center justify-end gap-1.5">
        <input
          type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={value}
          onChange={(e) => setValue(e.target.value)} aria-label={`Price of ${product.name}`} placeholder="₹ per piece"
          className="h-8 w-28 rounded-md border bg-card px-2 text-end text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <Button type="submit" size="sm" disabled={saving}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
      </form>
    )
  }
  return (
    <button type="button" onClick={start} className="ms-auto block text-end outline-none hover:underline focus-visible:underline">
      {has ? <span className="font-semibold tabular-nums">{rupees(product.selling_price)}</span> : <span className="text-xs font-semibold text-primary">Set price</span>}
    </button>
  )
}

export default function Products() {
  const dispatch = useDispatch()
  const { data, isLoading: loading, error: loadError, refetch: loadProducts } = useGetProductsQuery()
  const products = data ?? EMPTY
  const error = loadError ? "Could not load products. Check that the server is running." : ""
  const [selected, setSelected] = useState(null)
  const [bom, setBom] = useState([])
  const [bomLoading, setBomLoading] = useState(false)
  const [bomError, setBomError] = useState("")
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState(false)
  const [importingProducts, setImportingProducts] = useState(false)
  const [editing, setEditing] = useState(null) // product whose BOM is being written by hand
  const [importing, setImporting] = useState(null) // product whose BOM is being imported from a file
  const toast = useToast()

  const filteredProducts = useMemo(() => {
    const text = search.trim().toLowerCase()
    if (!text) return products
    return products.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(text) ||
        (p.sku || "").toLowerCase().includes(text) ||
        (p.description || "").toLowerCase().includes(text)
    )
  }, [products, search])

  const openBom = async (product) => {
    setSelected(product)
    setBom([])
    setBomError("")
    setBomLoading(true)
    try {
      const r = await productsService.getBom(product.id)
      setBom(r.data)
    } catch (err) {
      console.error(err)
      setBomError(errorMessage(err, "Could not load the bill of materials for this product."))
    } finally {
      setBomLoading(false)
    }
  }

  const closeBom = () => setSelected(null)

  // The BOM editor / importer replace the BOM view while open and return to it afterwards.
  const startEdit = () => {
    setEditing(selected)
    setSelected(null)
  }
  const startImport = () => {
    setImporting(selected)
    setSelected(null)
  }
  const backToBom = (product) => {
    setEditing(null)
    setImporting(null)
    setSelected(product)
  }
  const bomSaved = (product, next, created, verb) => {
    setBom(next)
    toast.success(`BOM ${verb}: ${next.length} line${next.length === 1 ? "" : "s"}${created ? `, ${created} new component${created === 1 ? "" : "s"} added to Inventory` : ""}.`)
    backToBom(product)
  }

  const productAdded = (product, openBomNext) => {
    setAdding(false)
    // add it to the shared cache so every screen sees the new product without another request
    dispatch(productsApi.util.updateQueryData("getProducts", undefined, (draft) => { draft.push(product) }))
    toast.success(`Product ${product.sku} added.`)
    if (openBomNext) {
      setBom([])
      setEditing(product)
    }
  }
  // keep the shared cache in step, so order screens see the new price without another request
  const priceSaved = (product) =>
    dispatch(productsApi.util.updateQueryData("getProducts", undefined, (draft) => {
      const i = draft.findIndex((x) => x.id === product.id)
      if (i >= 0) draft[i] = { ...draft[i], selling_price: product.selling_price }
    }))
  const productsImported = (count) => {
    setImportingProducts(false)
    toast.success(`${count} product${count === 1 ? "" : "s"} added.`)
    loadProducts()
  }

  const bomTotals = useMemo(() => {
    const short = bom.filter((i) => Number(i.quantity_on_hand) < Number(i.quantity_required)).length
    return { lines: bom.length, short }
  }, [bom])

  return (
    <>
      <PageHeader title="Products" description="Finished products and the components each one needs.">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search products" />
          <Button variant="outline" size="lg" onClick={() => setImportingProducts(true)}>
            <Upload />
            Import from Excel
          </Button>
          <Button size="lg" onClick={() => setAdding(true)}>
            <Plus />
            Add product
          </Button>
        </div>
      </PageHeader>
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <EmptyState icon={Boxes} title="No products yet">Add a product by hand or import a list from Excel.</EmptyState>
        ) : filteredProducts.length === 0 ? (
          <EmptyState icon={SearchX} title="No matching products">Try a different name, SKU or description.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="text-right">Price / piece (no GST)</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => (
                <TableRow key={p.id} data-active={selected?.id === p.id}>
                  <TableCell className="font-medium tabular-nums">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="min-w-56 max-w-xs whitespace-normal text-muted-foreground">{p.description}</TableCell>
                  <TableCell className="min-w-40"><UserCell name={p.created_by_name} /></TableCell>
                  <TableCell className="min-w-36 text-right"><PriceCell product={p} onSaved={priceSaved} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openBom(p)}>View BOM</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={closeBom}
        size="xl"
        title={selected ? `Bill of materials · ${selected.name}` : "Bill of materials"}
        description={selected ? `${selected.sku} · every component needed to build one unit, with its place on the PCB` : undefined}
        footer={
          <>
            <Button variant="outline" size="lg" onClick={startImport} disabled={bomLoading || !!bomError} className="sm:mr-auto">
              <FileUp />
              Import BOM from Excel
            </Button>
            <Button variant="secondary" size="lg" onClick={startEdit} disabled={bomLoading || !!bomError}>
              <Pencil />
              {bom.length === 0 ? "Add BOM manually" : "Edit BOM"}
            </Button>
            <Button variant="outline" size="lg" onClick={closeBom} data-autofocus>Close</Button>
          </>
        }
      >
        {bomLoading ? (
          <TableSkeleton rows={8} />
        ) : bomError ? (
          <Notice title="Something went wrong">{bomError}</Notice>
        ) : bom.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No BOM added yet">
            This product has no components linked. Add them by hand or import the BOM from Excel.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="info">{bomTotals.lines} components</Badge>
              {bomTotals.short > 0 && <Badge variant="danger">{bomTotals.short} low on stock for 1 unit</Badge>}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Qty per unit</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>PCB location</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.map((item, idx) => (
                    <TableRow key={item.component_id}>
                      <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{item.component_sku}</TableCell>
                      <TableCell className="font-medium">{item.component_name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.category || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.size || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{item.quantity_required == null ? <span className="font-normal text-muted-foreground">—</span> : fmtQty(item.quantity_required)}</TableCell>
                      <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                      <TableCell className="min-w-40 whitespace-normal">{item.location || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={Number(item.quantity_on_hand) < Number(item.quantity_required) ? "font-medium text-destructive" : ""}>
                          {fmtQty(item.quantity_on_hand)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Modal>

      <AddProductModal open={adding} onClose={() => setAdding(false)} onCreated={productAdded} />
      <ImportProductsModal open={importingProducts} onClose={() => setImportingProducts(false)} onImported={productsImported} />
      <BomEditorModal
        open={!!editing}
        product={editing}
        bom={bom}
        onClose={() => backToBom(editing)}
        onSaved={(next, created) => bomSaved(editing, next, created, "saved")}
      />
      <ImportBomModal
        open={!!importing}
        product={importing}
        onClose={() => backToBom(importing)}
        onImported={(next, created) => bomSaved(importing, next, created, "imported")}
      />
    </>
  )
}
