import { useEffect, useMemo, useState } from "react"
import { History, SearchX } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import { EmptyState, Notice, OrderStatus, TableSkeleton } from "../components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

const formatDate = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-"

export default function ExistingOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    api
      .get("/orders")
      .then((r) => setOrders(r.data))
      .catch((err) => {
        console.error(err)
        setError("Failed to load existing orders. Check that the server is running.")
      })
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      `${o.order_number} ${o.product_name} ${o.status}`.toLowerCase().includes(q)
    )
  }, [orders, query])

  return (
    <>
      <PageHeader title="Existing orders" description="Every manufacturing order created so far.">
        <SearchBar value={query} onChange={setQuery} placeholder="Search by order, product or status" />
      </PageHeader>

      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Order history</CardTitle>
            <CardDescription>
              {loading ? "Loading orders" : `${rows.length} of ${orders.length} orders shown`}
            </CardDescription>
          </div>
        </CardHeader>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={query ? SearchX : History} title={query ? "No matching orders" : "No orders yet"}>
            {query ? "Try a different order number, product or status." : "Orders you create will appear here."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={`${o.id}-${o.product_id}`}>
                  <TableCell className="font-medium tabular-nums">{o.order_number}</TableCell>
                  <TableCell>{o.product_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.quantity}</TableCell>
                  <TableCell><OrderStatus status={o.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}
