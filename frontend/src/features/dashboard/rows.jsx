/* eslint-disable react-refresh/only-export-components */
import { Modal } from "@/components/Modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import UserCell from "@/components/UserCell"
import { APPROVAL_META, OrderLines } from "@/features/order-approvals/approvalParts"
import { PurchaseDetailModal } from "@/features/purchasing/PurchaseParts"
import { STATUS_META } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { InfoModal } from "./DashboardKit"

/* Row builders: turn one record from the API into a dashboard row (title, badge and the popup it opens). */

const productsText = (items = []) => items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")

/* Popup for a marketing / approval order: who raised it, the decision, and its product lines. */
export function OrderInfoModal({ order, onClose }) {
  const decided = ["PARTIALLY_APPROVED", "APPROVED", "REJECTED"].includes(order.approval_status)
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

export const stockRow = (i) => {
  const avail = Number(i.available)
  const min = Number(i.minimum_stock_level)
  const badge = avail <= 0 ? { variant: "danger", label: "Out" } : avail <= min ? { variant: "warning", label: "Low" } : { variant: "success", label: "OK" }
  return {
    id: `c${i.id}`,
    title: i.component_name,
    sub: i.sku,
    right: `${fmtQty(avail)} / ${fmtQty(min)}`,
    badge,
    detail: (close) => (
      <InfoModal
        title={i.component_name}
        description={i.sku}
        badge={badge}
        fields={[["On hand", fmtQty(i.quantity_on_hand)], ["Reserved", fmtQty(i.quantity_reserved)], ["Available", fmtQty(avail)], ["Minimum level", fmtQty(min)]]}
        onClose={close}
      />
    ),
  }
}

const FG_BADGE = { PACKAGING: { variant: "warning", label: "Packaging" }, DISPATCHED: { variant: "info", label: "Dispatched" }, COMPLETED: { variant: "success", label: "Completed" } }

export const finishedRow = (f) => ({
  id: `f${f.id ?? `${f.orderNumber}-${f.productSku}`}`,
  title: f.productName,
  sub: `${f.orderNumber} · ${f.productSku}`,
  right: fmtQty(f.quantity ?? 0),
  badge: FG_BADGE[f.status] || { variant: "neutral", label: f.status || "Unknown" },
  detail: (close) => (
    <InfoModal
      title={f.productName}
      description={f.orderNumber}
      badge={FG_BADGE[f.status]}
      fields={[["Product SKU", f.productSku], ["Quantity", fmtQty(f.quantity ?? 0)], ["Added by", f.createdByName], ["Dispatched by", f.dispatchedByName], ["Completed by", f.completedByName]]}
      onClose={close}
    />
  ),
})
