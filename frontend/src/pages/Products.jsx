import { useEffect, useMemo, useState } from "react"
import { Boxes, ClipboardList, SearchX } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Modal } from "../components/Modal"
import { Badge } from "../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { errorMessage, fmtQty } from "../lib/stock"

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(null)
  const [bom, setBom] = useState([])
  const [bomLoading, setBomLoading] = useState(false)
  const [bomError, setBomError] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    api
      .get("/products")
      .then((r) => setProducts(r.data))
      .catch((err) => {
        console.error(err)
        setError("Could not load products. Check that the server is running.")
      })
      .finally(() => setLoading(false))
  }, [])

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
      const r = await api.get(`/products/${product.id}/bom`)
      setBom(r.data)
    } catch (err) {
      console.error(err)
      setBomError(errorMessage(err, "Could not load the bill of materials for this product."))
    } finally {
      setBomLoading(false)
    }
  }

  const closeBom = () => setSelected(null)

  const bomTotals = useMemo(() => {
    const short = bom.filter((i) => Number(i.quantity_on_hand) < Number(i.quantity_required)).length
    return { lines: bom.length, short }
  }, [bom])

  return (
    <>
      <PageHeader title="Products" description="Finished products and the components each one needs.">
        <SearchBar value={search} onChange={setSearch} placeholder="Search products" />
      </PageHeader>
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <EmptyState icon={Boxes} title="No products yet">Products added to the database will appear here.</EmptyState>
        ) : filteredProducts.length === 0 ? (
          <EmptyState icon={SearchX} title="No matching products">Try a different name, SKU or description.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => (
                <TableRow key={p.id} data-active={selected?.id === p.id}>
                  <TableCell className="font-medium tabular-nums">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="min-w-56 max-w-xs whitespace-normal text-muted-foreground">{p.description}</TableCell>
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
        footer={<Button variant="outline" size="lg" onClick={closeBom} data-autofocus>Close</Button>}
      >
        {bomLoading ? (
          <TableSkeleton rows={8} />
        ) : bomError ? (
          <Notice title="Something went wrong">{bomError}</Notice>
        ) : bom.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No BOM added yet">
            This product has no components linked. Add its BOM and it will show up here.
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
    </>
  )
}
