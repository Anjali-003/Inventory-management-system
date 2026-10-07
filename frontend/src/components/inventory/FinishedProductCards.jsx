import { useCallback, useEffect, useState } from "react"
import { PackageCheck } from "lucide-react"
import api from "../../api/api"
import ErrorBanner from "../ErrorBanner"
import { EmptyState } from "../feedback"
import { Panel, PanelSkeleton, Pill } from "./HistoryUI"
import { errorMessage, fmtQty } from "../../lib/stock"

/*
    Finished products and the components they used.
    components used = quantity produced x components in ONE unit (sum of its BOM quantities).
    Figures and the grand total come from GET /inventory/history/products; the share bar is only a drawing.
*/

const th = "whitespace-nowrap px-6 py-3 text-xs font-medium text-muted-foreground"

export default function FinishedProductCards() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    setError("")
    return api
      .get("/inventory/history/products")
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, "Could not load finished products.")))
  }, [])

  useEffect(() => { load() }, [load])

  const products = data?.products
  const total = Number(data?.total_components_used ?? 0)

  if (error) return <ErrorBanner title="Couldn't load finished products" onRetry={load}>{error}</ErrorBanner>
  if (!products) return <PanelSkeleton rows={3} />

  return (
    <Panel
      title="Finished products"
      description="Components consumed by products that passed quality control."
      action={products.length > 0 && <Pill tone="neutral">{products.length} {products.length === 1 ? "product" : "products"}</Pill>}
    >
      {products.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No finished products yet">
          Products appear here once they pass quality control.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th scope="col" className={`${th} text-left`}>Product</th>
                <th scope="col" className={`${th} text-right`}>Produced</th>
                <th scope="col" className={`${th} text-right`}>Components per unit</th>
                <th scope="col" className={`${th} text-right`}>Components used</th>
                <th scope="col" className={`${th} hidden w-48 text-left md:table-cell`}>Share of total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => {
                const share = total > 0 ? Math.min(100, (Number(p.components_used) / total) * 100) : 0
                return (
                  <tr key={p.product_id} className="transition-colors hover:bg-muted/40">
                    <td className="px-6 py-3.5">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums">{fmtQty(p.produced)}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">{fmtQty(p.components_per_unit)}</td>
                    <td className="px-6 py-3.5 text-right text-base font-semibold tabular-nums">{fmtQty(p.components_used)}</td>
                    <td className="hidden px-6 py-3.5 md:table-cell">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(share)}% of all components used`}>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-9 text-xs tabular-nums text-muted-foreground">{Math.round(share)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t bg-muted/50">
              <tr>
                <th scope="row" colSpan={3} className="px-6 py-3.5 text-left text-sm font-medium">
                  Total used by all finished products
                </th>
                <td className="px-6 py-3.5 text-right text-base font-semibold tabular-nums">{fmtQty(total)}</td>
                <td className="hidden md:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  )
}
