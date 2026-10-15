import { useNavigate } from "react-router-dom"
import { ShoppingCart, PackageCheck } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import UserCell from "@/components/UserCell"
import { EmptyState } from "@/components/feedback"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderLines } from "@/features/order-approvals/approvalParts"
import { fmtDateTime, fmtQty } from "@/lib/stock"

/*
  Popup opened from an order card on the Purchase Dashboard.
  Shows what was ordered and the SHORT components the Operations Admin asked us to buy for it
  (`order.purchase_request.items` -> [{ component_id, sku, name, unit, quantity }], quantity = shortage).
*/
export default function OrderShortageModal({ order, onClose, canRaisePurchase }) {
  const navigate = useNavigate()
  const shortages = order?.purchase_request?.items || []
  const toOrder = shortages.filter((c) => c.purchase_order_id == null) // lines not on a purchase order yet

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      size="xl"
      title={order ? order.order_number : ""}
      description={order?.approval_remarks || undefined}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} data-autofocus>Close</Button>
          {canRaisePurchase && toOrder.length > 0 && (
            <Button size="lg" onClick={() => navigate("/purchase", { state: { orderId: order.id } })}>
              <ShoppingCart /> Place order ({toOrder.length})
            </Button>
          )}
        </>
      }
    >
      {order && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Raised by</p>
              <UserCell name={order.created_by_name} sub={fmtDateTime(order.created_at)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved by</p>
              <UserCell name={order.approved_by_name} sub={fmtDateTime(order.approved_at)} />
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Ordered products</h3>
            <OrderLines items={order.items} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Short components</h3>
              {toOrder.length > 0 && <Badge variant="danger">{toOrder.length} to order</Badge>}
            </div>
            {shortages.length === 0 ? (
              <div className="rounded-xl border">
                <EmptyState icon={PackageCheck} title="No shortage for this order">
                  Everything needed was in stock when the Operations Admin approved it.
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Short by</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortages.map((c) => (
                      <TableRow key={c.component_id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.sku || "-"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-destructive">
                          {fmtQty(c.quantity)} {c.unit}
                        </TableCell>
                        <TableCell>
                          {c.purchase_order_id == null ? <Badge variant="warning">To order</Badge> : <Badge variant="success">Ordered · {c.po_number}</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {order.purchase_request?.sent_at && (
              <p className="text-xs text-muted-foreground">
                Sent by {order.purchase_request.sent_by_name || "Operations Admin"} on {fmtDateTime(order.purchase_request.sent_at)}
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
