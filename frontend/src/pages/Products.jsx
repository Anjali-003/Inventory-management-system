import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Boxes, SearchX, X } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(null)
  const [bom, setBom] = useState([])
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
    try {
      const r = await api.get(`/products/${product.id}/bom`)
      setBom(r.data)
      setSelected(product)
    } catch (err) {
      console.error(err)
      setError("Could not load the bill of materials for this product.")
    }
  }

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

      <AnimatePresence initial={false}>
        {selected && (
          <motion.div
            key="bom"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <Card className="mt-6 overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Bill of materials</CardTitle>
                  <CardDescription>{selected.name} · {selected.sku}</CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Close bill of materials" onClick={() => setSelected(null)}>
                  <X />
                </Button>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty per unit</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.map((item) => (
                    <TableRow key={item.component_id}>
                      <TableCell className="font-medium">{item.component_name}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{item.component_sku}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity_required}</TableCell>
                      <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
