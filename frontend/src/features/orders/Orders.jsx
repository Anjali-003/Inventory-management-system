import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ClipboardList, Plus } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import Pagination from "@/components/Pagination"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, OrderStatus, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import CreateOrderModal from "./components/CreateOrderModal"
import MaterialCheckModal from "./components/MaterialCheckModal"
import StartProductionModal from "./components/StartProductionModal"
import OrderActions from "./components/OrderActions"
import { ApprovalStatus } from "@/features/order-approvals/approvalParts"
import { errorMessage } from "@/lib/stock"
import { useGetOrdersQuery } from "./ordersApi"
import { useGetProductsQuery } from "@/features/products/productsApi"

const PAGE_SIZE = 20
const EMPTY = []

const when = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null)

export default function Orders() {
  const toast = useToast()
  const { data: ordersData, isLoading: loading, error: ordersError, refetch: loadOrders } = useGetOrdersQuery()
  // the create-order dialog reads products from the same cache; here we only surface a failed load
  const { error: productsError } = useGetProductsQuery()
  const orders = ordersData ?? EMPTY
  const error = ordersError
    ? errorMessage(ordersError, "Failed to load orders")
    : productsError
      ? errorMessage(productsError, "Failed to load products")
      : ""
  const [query, setQuery] = useState("")
  const [searchParams] = useSearchParams() // /orders?status=PENDING (from the dashboard)
  const [filter, setFilter] = useState(() => searchParams.get("status") || "all")
  const [page, setPage] = useState(1)

  // one dialog at a time
  const [creating, setCreating] = useState(false)
  const [checkFor, setCheckFor] = useState(null)
  const [startFor, setStartFor] = useState(null)

  const counts = useMemo(() => {
    const c = { all: orders.length, PENDING: 0, IN_PRODUCTION: 0, TESTING: 0, PACKAGING: 0, COMPLETED: 0 }
    orders.forEach((o) => { if (o.status in c) c[o.status]++ })
    return c
  }, [orders])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false
      return !q || `${o.order_number} ${o.product_name} ${o.status} ${o.created_by_name || ""}`.toLowerCase().includes(q)
    })
  }, [orders, query, filter])

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const setFilterAndReset = (f) => { setFilter(f); setPage(1) }
  const setQueryAndReset = (q) => { setQuery(q); setPage(1) }

  const toggle = (key) => () => setFilterAndReset(filter === key ? "all" : key)
  const stats = [
    { key: "PENDING", label: "Pending", value: counts.PENDING, tone: "warning", active: filter === "PENDING", onClick: toggle("PENDING") },
    { key: "IN_PRODUCTION", label: "In production", value: counts.IN_PRODUCTION, tone: "info", active: filter === "IN_PRODUCTION", onClick: toggle("IN_PRODUCTION") },
    { key: "TESTING", label: "Testing", value: counts.TESTING, tone: "info", active: filter === "TESTING", onClick: toggle("TESTING") },
    { key: "PACKAGING", label: "Packaging", value: counts.PACKAGING, tone: "warning", active: filter === "PACKAGING", onClick: toggle("PACKAGING") },
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
        <StatStrip layoutId="orders-filter" cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-5" items={stats} />

        <div className="flex flex-wrap items-center gap-3 border-y px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQueryAndReset} placeholder="Search by order, product, status or creator..." />
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
                    <TableHead>Approval</TableHead>
                    <TableHead>Created by</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((o) => (
                    <TableRow key={o.order_item_id}>
                      <TableCell className="font-medium tabular-nums">{o.order_number}</TableCell>
                      <TableCell>{o.product_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(o.quantity)}</TableCell>
                      <TableCell><OrderStatus status={o.status} /></TableCell>
                      <TableCell><ApprovalStatus value={o.approval_status} /></TableCell>
                      <TableCell className="min-w-44"><UserCell name={o.created_by_name} sub={when(o.created_at)} /></TableCell>
                      <TableCell><OrderActions order={o} onCheck={setCheckFor} onStart={setStartFor} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* phones: one card per order, nothing scrolls sideways */}
            <ul className="grid gap-3 p-3 md:hidden">
              {pageRows.map((o) => (
                <li key={o.order_item_id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-medium leading-snug tabular-nums">{o.order_number}</p>
                      <p className="text-sm text-muted-foreground">{o.product_name} · Qty {Number(o.quantity)}</p>
                    </div>
                    <OrderStatus status={o.status} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Approval</span>
                    <ApprovalStatus value={o.approval_status} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Created by</span>
                    <UserCell name={o.created_by_name} sub={when(o.created_at)} className="text-foreground" />
                  </div>
                  <OrderActions order={o} onCheck={setCheckFor} onStart={setStartFor} className="flex flex-wrap gap-2 border-t pt-3" />
                </li>
              ))}
            </ul>

            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} noun="orders" />
          </>
        )}
      </Card>

      {creating && <CreateOrderModal onClose={() => setCreating(false)} onCreated={created} />}
      {checkFor && <MaterialCheckModal order={checkFor} onClose={() => setCheckFor(null)} onStart={startFromCheck} partialProduction />}
      {startFor && <StartProductionModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}
    </>
  )
}
