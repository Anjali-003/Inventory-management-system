import { useMemo, useState } from "react"
import { ClipboardCheck, RefreshCw } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Modal } from "@/components/Modal"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { OrderLines } from "@/features/order-approvals/approvalParts"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"

const EMPTY = []

/*
  Purchase Manager: the orders the Operations Admin approved (newest approval first). Read-only.
  When the order has missing components, the Operations Admin's list is in `purchase_request`:
  { sent_at, sent_by_name, items: [{ component_id, sku, name, unit, quantity }] }.
  Each line also says whether it is still "To order" or already on a purchase order (purchase_order_id / po_number).
  The purchases themselves are placed on the Purchase page, only from these lines.
*/

/* The components the Operations Admin asked the Purchase Manager to buy for this order. */
function ComponentsToBuy({ items }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead className="text-right">To buy</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.component_id}>
              <TableCell>
                <p className="font-medium">{c.name}</p>
                {c.sku && <p className="text-xs text-muted-foreground">{c.sku}</p>}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{fmtQty(c.quantity)} {c.unit}</TableCell>
              <TableCell>
                {c.purchase_order_id == null ? <Badge variant="warning">To order</Badge> : <Badge variant="success">Ordered · {c.po_number}</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
export default function ApprovedOrders() {
  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetApprovedOrdersQuery()
  const [query, setQuery] = useState("")
  const [viewing, setViewing] = useState(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(
      (o) =>
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        (o.created_by_name || "").toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q))
    )
  }, [data, query])

  return (
    <>
      <PageHeader title="Approved Orders" description="Orders approved by the Operations Admin.">
        <Button variant="outline" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load approved orders. Check that the server is running.</Notice></div>}

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or who raised it..." />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={query ? "No approved order matches your search" : "No approved orders yet"}>
            {query ? "Try a different search." : "Orders will appear here once the Operations Admin approves them."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Components to buy</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Approved by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold tabular-nums">{o.order_number}</TableCell>
                    <TableCell className="min-w-56">
                      <ul className="space-y-0.5">
                        {o.items.map((i) => (
                          <li key={i.product_id} className="text-sm">
                            {i.name} <span className="text-muted-foreground">× {fmtQty(i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>
                      {o.purchase_request?.items?.length ? (
                        (() => {
                          const open = o.purchase_request.items.filter((c) => c.purchase_order_id == null).length
                          return open > 0
                            ? <Badge variant="warning">{open} component{open > 1 ? "s" : ""} to order</Badge>
                            : <Badge variant="success">All ordered</Badge>
                        })()
                      ) : (
                        <span className="text-sm text-muted-foreground">Nothing to buy</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-44"><UserCell name={o.created_by_name} sub={fmtDateTime(o.created_at)} /></TableCell>
                    <TableCell className="min-w-44"><UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(o)}>Details</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        size="lg"
        title={viewing ? viewing.order_number : ""}
        description={viewing?.approval_remarks || undefined}
        footer={<Button type="button" variant="outline" size="lg" onClick={() => setViewing(null)} data-autofocus>Close</Button>}
      >
        {viewing && (
          <div className="space-y-4">
            <OrderLines items={viewing.items} />
            {viewing.purchase_request?.items?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Components to buy for this order</h3>
                <ComponentsToBuy items={viewing.purchase_request.items} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
