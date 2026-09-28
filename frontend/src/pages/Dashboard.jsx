import { useEffect, useState } from "react"
import { PackageCheck } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Skeleton } from "../components/ui/skeleton"
import { cn } from "../lib/utils"

function Stat({ label, value, alert, loading }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className={cn("mt-1 text-3xl font-semibold tabular-nums", alert && "text-warning")}>{value}</p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState({ products: [], inventory: [], orders: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const [p, i, o] = await Promise.all([api.get("/products"), api.get("/inventory"), api.get("/orders")])
        setData({ products: p.data, inventory: i.data, orders: o.data })
      } catch (err) {
        console.error(err)
        setError("Could not load the dashboard. Check that the server is running.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const { products, inventory, orders } = data
  const lowStock = inventory.filter((i) => Number(i.available) <= Number(i.minimum_stock_level))
  const openOrders = new Set(orders.filter((o) => o.status !== "COMPLETED").map((o) => o.id)).size

  return (
    <>
      <PageHeader title="Dashboard" description="Stock health and order load across production." />
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="grid grid-cols-2 divide-x divide-y overflow-hidden sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Products" value={products.length} loading={loading} />
        <Stat label="Open orders" value={openOrders} loading={loading} />
        <Stat label="Components tracked" value={inventory.length} loading={loading} />
        <Stat label="At or below minimum" value={lowStock.length} alert={lowStock.length > 0} loading={loading} />
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Components to reorder</CardTitle>
            <CardDescription>Available stock is at or below the minimum level.</CardDescription>
          </div>
        </CardHeader>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : lowStock.length === 0 ? (
          <EmptyState icon={PackageCheck} title="All components are above minimum">
            Anything that drops to its minimum level will be listed here.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="w-64">Stock level</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Minimum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock.map((item) => {
                const min = Number(item.minimum_stock_level)
                const avail = Number(item.available)
                const pct = min > 0 ? Math.max(0, Math.min(100, (avail / min) * 100)) : 0
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.component_name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku}</p>
                    </TableCell>
                    <TableCell>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", avail <= 0 ? "bg-destructive" : "bg-warning")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", avail <= 0 && "text-destructive")}>{avail}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{min}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}
