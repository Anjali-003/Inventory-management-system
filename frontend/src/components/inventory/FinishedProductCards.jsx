import { useCallback, useEffect, useState } from "react"
import { PackageCheck } from "lucide-react"
import api from "../../api/api"
import ErrorBanner from "../ErrorBanner"
import { EmptyState, TableSkeleton } from "../feedback"
import { Card } from "../ui/card"
import { errorMessage, fmtQty } from "../../lib/stock"

/*
    Finished products and the components they used.
    components used = quantity produced x components in ONE unit (sum of its BOM quantities).
    Figures come from GET /inventory/history/products; nothing is calculated in the browser.
*/

export default function FinishedProductCards() {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    setError("")
    return api
      .get("/inventory/history/products")
      .then((r) => setProducts(r.data.products))
      .catch((e) => setError(errorMessage(e, "Could not load finished products.")))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Finished products &amp; components used</h2>

      {error && <ErrorBanner title="Couldn't load finished products" onRetry={load}>{error}</ErrorBanner>}
      {!error && !products && <Card><TableSkeleton rows={3} /></Card>}

      {!error && products && products.length === 0 && (
        <Card>
          <EmptyState icon={PackageCheck} title="No finished products yet">
            Products appear here once they pass quality control.
          </EmptyState>
        </Card>
      )}

      {!error && products && products.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <Card key={p.product_id} className="overflow-hidden">
              <div className="border-b px-5 py-3.5">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.sku}</p>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border">
                <div className="bg-card px-5 py-3">
                  <p className="text-xs text-muted-foreground">Produced</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{fmtQty(p.produced)}</p>
                </div>
                <div className="bg-card px-5 py-3">
                  <p className="text-xs text-muted-foreground">Components in 1 product</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{fmtQty(p.components_per_unit)}</p>
                </div>
              </div>

              <div className="border-t bg-muted/40 px-5 py-3.5">
                <p className="text-xs text-muted-foreground">
                  Total components used ({fmtQty(p.produced)} × {fmtQty(p.components_per_unit)})
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{fmtQty(p.components_used)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
