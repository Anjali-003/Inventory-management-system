import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { AlertTriangle, Boxes, ClipboardList, PackageCheck, Warehouse } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { StatCard } from "../components/inventory/HistoryUI"
import { cn } from "../lib/utils"

const STATUSES = [
  ["PENDING", "Pending", "bg-warning"],
  ["MATERIAL_SHORTAGE", "Material shortage", "bg-destructive"],
  ["READY_FOR_PRODUCTION", "Ready for production", "bg-success"],
  ["IN_PRODUCTION", "In production", "bg-primary"],
  ["COMPLETED", "Completed", "bg-muted-foreground/50"],
]

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

  const [att, setAtt] = useState(null)
  useEffect(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    api.get("/attendance", { params: { date: d.toISOString().slice(0, 10) } }).then((r) => setAtt(r.data)).catch(() => setAtt(null))
  }, [])
  const attCount = (s) => (att ? att.filter((e) => e.status === s).length : 0)

  const { products, inventory, orders } = data
  const lowStock = inventory.filter((i) => Number(i.available) <= Number(i.minimum_stock_level))
  const uniqueOrders = [...new Map(orders.map((o) => [o.id, o])).values()]
  const openOrders = new Set(orders.filter((o) => o.status !== "COMPLETED").map((o) => o.id)).size

  return (
    <>
      <PageHeader title="Dashboard" description="Stock health and order load across production." />
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={Boxes} tone="blue" label="Products" value={products.length} loading={loading} detail="In the catalog" />
        <StatCard index={1} icon={ClipboardList} tone="green" label="Open orders" value={openOrders} loading={loading} detail="Not completed yet" />
        <StatCard index={2} icon={Warehouse} tone="violet" label="Components tracked" value={inventory.length} loading={loading} detail="In inventory" />
        <StatCard
          index={3}
          icon={AlertTriangle}
          tone={lowStock.length > 0 ? "amber" : "green"}
          label="At or below minimum"
          value={lowStock.length}
          loading={loading}
          detail={lowStock.length > 0 ? "Needs reordering" : "All stocked up"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="overflow-hidden lg:col-span-2">
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

      <Card className="self-start">
        <CardHeader>
          <div>
            <CardTitle>Orders by status</CardTitle>
            <CardDescription>{uniqueOrders.length} orders in total</CardDescription>
          </div>
        </CardHeader>
        <div className="space-y-4 p-5">
          {STATUSES.map(([key, label, color], i) => {
            const count = uniqueOrders.filter((o) => o.status === key).length
            const pct = uniqueOrders.length ? (count / uniqueOrders.length) * 100 : 0
            return (
              <div key={key}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: `${loading ? 0 : pct}%` }} transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: "easeOut" }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      </div>

      {att && (
        <Card className="mt-4">
          <CardHeader className="items-center">
            <div>
              <CardTitle>Today&apos;s attendance</CardTitle>
              <CardDescription>{att.filter((e) => !e.status).length} of {att.length} employees not marked yet.</CardDescription>
            </div>
            <Link to="/attendance" className="text-sm font-medium text-primary hover:underline">Mark attendance</Link>
          </CardHeader>
          <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {[["Present", "PRESENT", "text-success"], ["Absent", "ABSENT", "text-destructive"], ["Half day", "HALF_DAY", "text-warning"], ["On leave", "LEAVE", "text-primary"]].map(([label, key, color]) => (
              <div key={key} className="px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{attCount(key)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
