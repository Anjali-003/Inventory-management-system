import { fmtQty } from "@/lib/stock"
import { downloadXlsx } from "@/lib/xlsxWrite"

/* Where a purchase is in the incoming-goods flow (same words on every screen). */
export const STATUS_META = {
  ORDER_PLACED: { variant: "neutral", label: "Order placed" },
  RECEIVED: { variant: "info", label: "Received" },
  PENDING_IQC: { variant: "warning", label: "Waiting for IQC" },
  PENDING_STORE: { variant: "info", label: "Waiting for store" },
  STORED: { variant: "success", label: "In stock" },
  REJECTED: { variant: "danger", label: "Rejected by IQC" },
}

export const qtyWithUnit = (q, unit) => `${fmtQty(q)}${unit ? ` ${unit}` : ""}`

/* IQC has looked at it (so received quantities and decisions exist). */
export const WAS_INSPECTED = (status) => ["PENDING_STORE", "STORED", "REJECTED"].includes(status)

/* The component lines IQC rejected (unticked at inspection). */
export const rejectedLines = (p) => (p.items || []).filter((i) => i.iqc_decision === "REJECTED")

/* Excel file of the rejected components of one purchase. */
export function downloadRejected(p) {
  const headers = ["PO number", "Supplier", "SKU", "Component", "Unit", "Ordered", "Received", "IQC remarks", "Inspected by", "Inspected at"]
  const rows = rejectedLines(p).map((it) => [
    p.po_number, p.supplier, it.sku, it.name, it.unit || "",
    Number(it.quantity_ordered), Number(it.quantity_received ?? 0),
    p.iqc_remarks || "", p.iqc_by_name || "", p.iqc_at || "",
  ])
  downloadXlsx(`${p.po_number}-rejected-components.xlsx`, `${p.po_number} rejected`, headers, rows)
}

/*
  The Operations Admin's list, as the Purchase Manager sees it. An approved order carries
  purchase_request.items = [{ request_item_id, component_id, sku, name, unit, quantity, purchase_order_id, po_number }].
  purchase_order_id is null while the line is still "to order".
*/
export const isToOrder = (line) => line.purchase_order_id == null

/* Approved orders that still have components to order -> [{ order, lines }] (lines = only the ones not ordered yet). */
export function ordersToOrder(orders) {
  return (orders || [])
    .map((order) => ({ order, lines: (order.purchase_request?.items || []).filter(isToOrder) }))
    .filter((g) => g.lines.length > 0)
}
