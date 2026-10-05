import { useCallback, useEffect, useMemo, useState } from "react"
import { ClipboardList, Plus } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import StatStrip from "../components/StatStrip"
import Pagination from "../components/Pagination"
import { EmptyState, Notice, OrderStatus, TableSkeleton } from "../components/feedback"
import { useToast } from "../components/toast"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import CreateOrderModal from "../components/orders/CreateOrderModal"
import MaterialCheckModal from "../components/orders/MaterialCheckModal"
import StartProductionModal from "../components/orders/StartProductionModal"
import OrderActions from "../components/orders/OrderActions"
import { errorMessage } from "../lib/stock"

const PAGE_SIZE = 20

export default function Orders() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)

  // one dialog at a time
  const [creating, setCreating] = useState(false)
  const [checkFor, setCheckFor] = useState(null)
  const [startFor, setStartFor] = useState(null)

  const loadOrders = useCallback(
    () =>
      api.get("/orders")
        .then((r) => { setOrders(r.data); setError("") })
        .catch((e) => setError(errorMessage(e, "Failed to load orders")))
        .finally(() => setLoading(false)),
    []
  )

  useEffect(() => {
    loadOrders()
    api.get("/products").then((r) => setProducts(r.data)).catch((e) => setError(errorMessage(e, "Failed to load products")))
  }, [loadOrders])

  const counts = useMemo(() => {
    const c = { all: orders.length, PENDING: 0, IN_PRODUCTION: 0, COMPLETED: 0 }
    orders.forEach((o) => { if (o.status in c) c[o.status]++ })
    return c
  }, [orders])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false
      return !q || `${o.order_number} ${o.product_name} ${o.status}`.toLowerCase().includes(q)
    })
  }, [orders, query, filter])

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const setFilterAndReset = (f) => { setFilter(f); setPage(1) }
  const setQueryAndReset = (q) => { setQuery(q); setPage(1) }

  const toggle = (key) => () => setFilterAndReset(filter === key ? "all" : key)
  const stats = [
    { key: "all", label: "All orders", value: counts.all, tone: "info", active: filter === "all", onClick: () => setFilterAndReset("all") },
    { key: "PENDING", label: "Pending", value: counts.PENDING, tone: "warning", active: filter === "PENDING", onClick: toggle("PENDING") },
    { key: "IN_PRODUCTION", label: "In production", value: counts.IN_PRODUCTION, tone: "info", active: filter === "IN_PRODUCTION", onClick: toggle("IN_PRODUCTION") },
    { key: "COMPLETED", label: "Completed", value: counts.COMPLETED, tone: "success", active: filter === "COMPLETED", onClick: toggle("COMPLETED") },
  ]

  const startFromCheck = (order) => { setCheckFor(null); setStartFor(order) }
  const created = (orderNumber) => { setCreating(false); toast.success(`Order ${orderNumber} created successfully`); loadOrders() }
  const started = (qty, orderNumber) => { setStartFor(null); toast.success(`${qty} product(s) started for ${orderNumber}`); loadOrders() }

  return (
    <>
      <PageHeader title="Orders" description="Manage and monitor manufacturing orders.">
        <Button size="lg" onClick={() => setCreating(true)}><Plus /> Create order</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        <StatStrip layoutId="orders-filter" cols="grid-cols-2 lg:grid-cols-4" items={stats} />

        <div className="flex flex-wrap items-center gap-3 border-y px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQueryAndReset} placeholder="Search by order, product or status..." />
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={query || filter !== "all" ? "No matching orders" : "No orders yet"}>
            {query || filter !== "all" ? "Try a different search or clear the filter." : "Create your first order to see it here."}
          </EmptyState>
        ) : (
          <>
            {/* tablet / desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((o) => (
                    <TableRow key={`${o.id}-${o.product_id}`}>
                      <TableCell className="font-medium tabular-nums">{o.order_number}</TableCell>
                      <TableCell>{o.product_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(o.quantity)}</TableCell>
                      <TableCell><OrderStatus status={o.status} /></TableCell>
                      <TableCell><OrderActions order={o} onCheck={setCheckFor} onStart={setStartFor} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* phones: one card per order, nothing scrolls sideways */}
            <ul className="grid gap-3 p-3 md:hidden">
              {pageRows.map((o) => (
                <li key={`${o.id}-${o.product_id}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-medium leading-snug tabular-nums">{o.order_number}</p>
                      <p className="text-sm text-muted-foreground">{o.product_name} · Qty {Number(o.quantity)}</p>
                    </div>
                    <OrderStatus status={o.status} />
                  </div>
                  <OrderActions order={o} onCheck={setCheckFor} onStart={setStartFor} className="flex flex-wrap gap-2 border-t pt-3" />
                </li>
              ))}
            </ul>

            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} noun="orders" />
          </>
        )}
      </Card>

      {creating && <CreateOrderModal products={products} onClose={() => setCreating(false)} onCreated={created} />}
      {checkFor && <MaterialCheckModal order={checkFor} onClose={() => setCheckFor(null)} onStart={startFromCheck} />}
      {startFor && <StartProductionModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}
    </>
  )
}
