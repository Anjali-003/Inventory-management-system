import { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Boxes, ClipboardList, FileUp, GitBranch, Pencil, Plus, SearchX, Upload } from "lucide-react"
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
import CreateProductVersionModal from "./components/CreateProductVersionModal"
import { productsApi, useGetProductsQuery } from "./productsApi"
import SetPriceDialog from "./SetPriceDialog"

const EMPTY = []

export default function Products() {
  const [pricing, setPricing] = useState(null) // product whose selling price is being set
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
  const [editing, setEditing] = useState(null) // used only to add an initial BOM to a new product
  const [importing, setImporting] = useState(null) // used only to import an initial BOM to a product without one
  const [versionPickerOpen, setVersionPickerOpen] = useState(false)
  const [versionEditor, setVersionEditor] = useState(null) // { product, bom } for creating an immutable new version
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
  const productsImported = (count) => {
    setImportingProducts(false)
    toast.success(`${count} product${count === 1 ? "" : "s"} added.`)
    loadProducts()
  }

  const versionSourceSelected = (product, sourceBom) => {
    setVersionPickerOpen(false)
    setVersionEditor({ product, bom: sourceBom })
  }

  const versionCreated = (product, nextBom, createdComponents) => {
    setVersionEditor(null)
    toast.success(`Created ${product.name} ${product.version_label || `v${product.version_major}.${product.version_minor}`} (${product.sku}) with ${nextBom.length} BOM component line${nextBom.length === 1 ? "" : "s"}${createdComponents ? `; ${createdComponents} new component${createdComponents === 1 ? "" : "s"} added to Inventory` : ""}.`)
    loadProducts()
  }

  const bomTotals = useMemo(() => {
    const short = bom.filter((i) => Number(i.quantity_on_hand) < Number(i.quantity_required)).length
    return { lines: bom.length, short }
  }, [bom])

  return (
    <>
      <PageHeader title="Products & BOM" description="Products the company makes and the components each one needs (BOM).">
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
          <Button
            variant="default"
            size="lg"
            className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-md shadow-teal-900/20 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 hover:shadow-lg focus-visible:ring-emerald-500 [&_svg]:text-white"
            onClick={() => setVersionPickerOpen(true)}
            disabled={products.length === 0}
          >
            <GitBranch />
            Create product version
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
                <TableHead className="text-right">Price (₹)</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => (
                <TableRow key={p.id} data-active={selected?.id === p.id}>
                  <TableCell className="font-medium tabular-nums">{p.sku}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{p.name}</span>
                      <Badge variant="success">{p.version_label || `v${p.version_major ?? 1}.${p.version_minor ?? 0}`}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-56 max-w-xs whitespace-normal text-muted-foreground">{p.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.selling_price === null || p.selling_price === undefined
                      ? <span className="text-xs font-semibold text-warning">Not set</span>
                      : Number(p.selling_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="min-w-40"><UserCell name={p.created_by_name} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPricing(p)}>Set price</Button>
                      <Button variant="outline" size="sm" onClick={() => openBom(p)}>View BOM</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {pricing && <SetPriceDialog product={pricing} onClose={() => setPricing(null)} onSaved={() => { setPricing(null); loadProducts() }} />}

      <Modal
        open={!!selected}
        onClose={closeBom}
        size="xl"
        title={selected ? `Bill of materials · ${selected.name}` : "Bill of materials"}
        description={selected ? `${selected.sku} · every component needed to build one unit, with its place on the PCB` : undefined}
        footer={
          <>
            {bom.length === 0 && !bomLoading && !bomError && (
              <>
                <Button variant="outline" size="lg" onClick={startImport} className="sm:mr-auto">
                  <FileUp />
                  Import initial BOM
                </Button>
                <Button variant="secondary" size="lg" onClick={startEdit}>
                  <Pencil />
                  Add BOM manually
                </Button>
              </>
            )}
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
            This product has no components yet. Add its initial BOM here, or create a new product version to keep future BOM changes separate.
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
      <CreateProductVersionModal
        open={versionPickerOpen}
        products={products}
        onClose={() => setVersionPickerOpen(false)}
        onContinue={versionSourceSelected}
      />
      <BomEditorModal
        open={!!editing}
        product={editing}
        bom={bom}
        onClose={() => backToBom(editing)}
        onSaved={(next, created) => bomSaved(editing, next, created, "saved")}
      />
      <BomEditorModal
        open={!!versionEditor}
        product={versionEditor?.product}
        bom={versionEditor?.bom ?? []}
        mode="create-version"
        onClose={() => setVersionEditor(null)}
        onVersionCreated={versionCreated}
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
