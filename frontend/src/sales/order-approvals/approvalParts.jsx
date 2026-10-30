/* eslint-disable react-refresh/only-export-components */
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtQty } from "@/lib/stock"

export const APPROVAL_META = {
  DRAFT: { variant: "neutral", label: "Draft" },
  PENDING_APPROVAL: { variant: "warning", label: "Waiting for approval" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "danger", label: "Rejected" },
  CANCELLED: { variant: "neutral", label: "Cancelled" },
}

export function ApprovalStatus({ value }) {
  const m = APPROVAL_META[value] || { variant: "neutral", label: value || "Unknown" }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

/* Product lines of one order (read-only). */
export function OrderLines({ items }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-end">Quantity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={`${it.product_id}`}>
              <TableCell>
                <p className="font-medium">{it.name}</p>
                {it.sku && <p className="text-xs text-muted-foreground">{it.sku}</p>}
              </TableCell>
              <TableCell className="text-end tabular-nums">{fmtQty(it.quantity)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ---------- order planning (what can be built now / what is short) ---------- */

/** Only an order that waits for a decision can be rejected or revised. */
export const isWaiting = (o) => o?.approval_status === "PENDING_APPROVAL"
/** An APPROVED order with units not in Production yet: the admin still sends lists for it. */
export const hasLeftToSend = (o) => o?.approval_status === "APPROVED" && Number(o.left_to_send) > 0
/** The Operations Admin has something to do on this order: decide it, or send its lists. */
export const canApprove = (o) => isWaiting(o) || hasLeftToSend(o)
export const approveLabel = (o) => (hasLeftToSend(o) ? "Send lists" : "Approve")

/** Totals of one plan: how many units can be made now, how many are left over. */
export function planTotals(plan) {
  const lines = plan?.lines || []
  const ordered = lines.reduce((a, l) => a + Number(l.ordered || 0), 0)
  const canMake = lines.reduce((a, l) => a + Number(l.can_make || 0), 0)
  return { ordered, canMake, remaining: ordered - canMake }
}

/** One-word verdict for a plan: tone + label for a Badge. */
export function planVerdict(plan) {
  const { canMake, ordered } = planTotals(plan)
  if (plan?.missing_bom?.length && canMake === 0) return { variant: "neutral", label: plan.incomplete_bom?.length ? "BOM incomplete" : "No BOM" }
  if (ordered > 0 && canMake === ordered && !plan?.missing_bom?.length) return { variant: "success", label: "Can make all" }
  if (canMake > 0) return { variant: "warning", label: "Can make part" }
  return { variant: "danger", label: "Cannot make any" }
}
