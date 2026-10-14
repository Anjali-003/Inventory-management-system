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
