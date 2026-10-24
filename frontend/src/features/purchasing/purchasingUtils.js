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

/*
  What a purchase is for, in a few words: "ORD-7", "ORD-7, ORD-9 +2 more" (a combined purchase) or "stock" (bought
  for stock only). null when the server did not say (older responses).
*/
export function purchaseFor(p) {
  const orders = p?.orders?.length ? p.orders : p?.order_number ? [p.order_number] : []
  if (orders.length === 0) return p?.kind === "STOCK" ? "stock" : null
  return orders.length <= 2 ? orders.join(", ") : `${orders.slice(0, 2).join(", ")} +${orders.length - 2} more`
}

/* IQC has looked at it (so received quantities and decisions exist). */
export const WAS_INSPECTED = (status) => ["PENDING_STORE", "STORED", "REJECTED"].includes(status)

/* The component lines IQC rejected (no good piece at inspection). */
export const rejectedLines = (p) => (p.items || []).filter((i) => i.iqc_decision === "REJECTED")

/* Pieces of one inspected line: good went to the store, bad stayed with IQC (a rejected line is all bad). */
export const goodQty = (it) => (it.iqc_decision === "REJECTED" ? 0 : Number(it.quantity_approved ?? 0))
export const badQty = (it) => (it.iqc_decision === "REJECTED" ? Number(it.quantity_received ?? 0) : Number(it.quantity_defective ?? 0))

/* The lines of one purchase that had bad pieces (partly bad or rejected). */
export const badLines = (p) => (p.items || []).filter((i) => i.iqc_decision && badQty(i) > 0)

const SLIP_HEADERS = ["PO number", "Supplier", "SKU", "Component", "Unit", "Ordered", "Received", "Accepted", "Rejected", "Reason", "Inspected by", "Inspected at"]
const slipRow = (p, it) => [
  p.po_number, p.supplier, it.sku, it.name, it.unit || "",
  Number(it.quantity_ordered), Number(it.quantity_received ?? 0), goodQty(it), badQty(it),
  badQty(it) > 0 ? it.remarks || p.iqc_remarks || "" : "", p.iqc_by_name || "", p.iqc_at || "",
]

/* Excel file of the bad pieces of one purchase. */
export function downloadRejected(p) {
  downloadXlsx(`${p.po_number}-rejected-pieces.xlsx`, `${p.po_number} rejected`, SLIP_HEADERS, badLines(p).map((it) => slipRow(p, it)))
}

/* Excel file of many inspected lines ([{ purchase, item }]), e.g. the IQC good / bad history. */
export function downloadInspectedLines(filename, sheetName, entries) {
  downloadXlsx(filename, sheetName, SLIP_HEADERS, entries.map(({ purchase, item }) => slipRow(purchase, item)))
}

/* Excel file of the components the Operations Admin sent to Purchase for one order (lines = purchase_request.items). */
export function downloadPurchaseList(order, lines) {
  const headers = ["Order number", "SKU", "Component", "Quantity", "Unit", "Status"]
  const rows = (lines || []).map((l) => [
    order.order_number, l.sku || "", l.name, Number(l.quantity), l.unit || "",
    l.purchase_order_id == null ? "To order" : `Ordered${l.po_number ? ` · ${l.po_number}` : ""}`,
  ])
  downloadXlsx(`${order.order_number}-components-to-buy.xlsx`, `${order.order_number} to buy`.slice(0, 31), headers, rows)
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
