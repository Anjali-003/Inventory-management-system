/* eslint-disable react-refresh/only-export-components */
import { Modal } from "@/components/Modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import UserCell from "@/components/UserCell"
import { APPROVAL_META, OrderLines } from "@/features/order-approvals/approvalParts"
import { PurchaseDetailModal } from "@/features/purchasing/PurchaseParts"
import { STATUS_META } from "@/features/purchasing/purchasingUtils"
import { fgBadge, fgStepFor } from "@/features/finished-goods/fgFlow"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { InfoModal } from "./DashboardKit"

/* Row builders: turn one record from the API into a dashboard row (title, badge and the popup it opens). */

const productsText = (items = []) => items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")

/* Popup for a marketing / approval order: who raised it, the decision, and its product lines. */
export function OrderInfoModal({ order, onClose }) {
  const decided = ["APPROVED", "REJECTED"].includes(order.approval_status)
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={order.order_number}
      description={decided && order.approval_remarks ? order.approval_remarks : undefined}
      footer={<Button type="button" variant="outline" size="lg" onClick={onClose} data-autofocus>Close</Button>}
    >
      <div className="space-y-5">
        {APPROVAL_META[order.approval_status] && (
          <Badge variant={APPROVAL_META[order.approval_status].variant}>{APPROVAL_META[order.approval_status].label}</Badge>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Raised by</p>
            <UserCell name={order.created_by_name} sub={fmtDateTime(order.created_at)} />
          </div>
          {decided && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{order.approval_status === "REJECTED" ? "Rejected by" : "Approved by"}</p>
              <UserCell name={order.approved_by_name} sub={fmtDateTime(order.approved_at)} />
            </div>
          )}
        </div>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Products</h3>
          <OrderLines items={order.items} />
        </section>
        {order.production_request?.items?.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Approved to produce</h3>
            <OrderLines items={order.production_request.items} />
          </section>
        )}
      </div>
    </Modal>
  )
}

export const orderRow = (o) => ({
  id: `o${o.id}`,
  title: o.order_number,
  sub: productsText(o.items),
  badge: APPROVAL_META[o.approval_status],
  detail: (close) => <OrderInfoModal order={o} onClose={close} />,
})

export const purchaseRow = (p) => ({
  id: `p${p.id}`,
  title: `${p.po_number} · ${p.supplier}`,
  sub: `${p.items.length} component${p.items.length === 1 ? "" : "s"} · ${fmtDateTime(p.created_at)}`,
  badge: STATUS_META[p.status],
  detail: (close) => <PurchaseDetailModal purchase={p} onClose={close} />,
})

/* A purchase the IQC approved, waiting for the store: shows the approved quantity. */
export const incomingRow = (p) => ({ ...purchaseRow(p), right: fmtQty(p.totals?.approved ?? 0) })

/* Low stock = on hand at or below the minimum level. Approving an order takes the components out of stock
   directly (there is no reserve step), so on hand is the real figure. */
export const isLowStock = (i) => Number(i.quantity_on_hand) <= Number(i.minimum_stock_level)

const ON_ORDER_STATUSES = ["ORDER_PLACED", "RECEIVED", "PENDING_IQC", "PENDING_STORE"]

/* component_id -> quantity already ordered from suppliers and not in stock yet (lines IQC rejected do not count). */
export function onOrderByComponent(purchases = []) {
  const map = new Map()
  for (const p of purchases || []) {
    if (!ON_ORDER_STATUSES.includes(p.status)) continue
    for (const it of p.items || []) {
      if (it.iqc_decision === "REJECTED") continue
      const qty = p.status === "PENDING_STORE" && it.quantity_approved != null ? it.quantity_approved : it.quantity_ordered
      map.set(it.component_id, (map.get(it.component_id) || 0) + Number(qty || 0))
    }
  }
  return map
}

/* `onOrder` (optional) = quantity already on order for this component, shown next to the SKU. */
export const stockRow = (i, onOrder = 0) => {
  const onHand = Number(i.quantity_on_hand)
  const min = Number(i.minimum_stock_level)
  const incoming = Number(onOrder) || 0
  const badge = onHand <= 0 ? { variant: "danger", label: "Out" } : onHand <= min ? { variant: "warning", label: "Low" } : { variant: "success", label: "OK" }
  const reserved = Number(i.quantity_reserved) > 0 // old data only: nothing is reserved any more
  return {
    id: `c${i.id}`,
    title: i.component_name,
    sub: incoming > 0 ? `${i.sku} · ${fmtQty(incoming)} on order` : i.sku,
    right: `${fmtQty(onHand)} / ${fmtQty(min)}`,
    badge,
    detail: (close) => (
      <InfoModal
        title={i.component_name}
        description={i.sku}
        badge={badge}
        fields={[
          ["On hand", fmtQty(onHand)],
          ...(reserved ? [["Reserved", fmtQty(i.quantity_reserved)], ["Available", fmtQty(i.available)]] : []),
          ["Minimum level", fmtQty(min)],
          ...(incoming > 0 ? [["On order", fmtQty(incoming)]] : []),
        ]}
        onClose={close}
      />
    ),
  }
}


export const finishedRow = (f) => ({
  id: `f${f.id ?? `${f.orderNumber}-${f.productSku}`}`,
  title: f.productName,
  sub: `${f.orderNumber} · ${f.productSku}`,
  right: fmtQty(f.quantity ?? 0),
  badge: fgBadge(f.status),
  detail: (close) => (
    <InfoModal
      title={f.productName}
      description={f.orderNumber}
      badge={fgBadge(f.status)}
      fields={[["Products", (f.lines || []).map((l) => `${l.name} × ${l.quantity}`).join(", ") || f.productSku], ["Quantity", fmtQty(f.quantity ?? 0)], ["Next", fgStepFor(f)?.owner ? `${fgStepFor(f).ownerLabel}: ${fgStepFor(f).todo}` : "Done"], ["Bill", f.bill ? `${f.bill.billNumber} · ${f.bill.customerName}` : null]]}
      onClose={close}
    />
  ),
})
