/* eslint-disable react-refresh/only-export-components */
import { PackageCheck, Scale, X } from "lucide-react"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { approveLabel, canApprove, isRest } from "./approvalParts"

/*
  The Operations Admin's three decisions on a waiting order, the SAME everywhere (the order drawer on the Incoming
  Orders page and on the dashboard, and inside each decision popup):

      Reject  ·  Revise quantity  ·  Check stock & send

  Always in this order, always with these names. A decision that does not apply to this order stays visible but
  disabled, with the reason, so nobody has to guess where an option went. The popups live in useOrderDecisions.jsx.
*/

/**
 * null when the order can be revised, otherwise the reason it cannot. THE rule, used by the footer buttons and the
 * "Your decision" cards alike. With the stock check (`plan`) it also says when revising cannot work right now; the
 * backend refuses the same cases (a revise that makes nothing, or with an incomplete BOM).
 */
export function reviseBlockReason(o, plan) {
  if (!o || o.approval_status !== "PENDING_APPROVAL") return "Only an order waiting for approval can be revised."
  if (o.created_by_role !== "MARKETING_MANAGER") return "Only orders raised by the Marketing Manager can be revised."
  if (o.revision) return "The quantity of this order was already revised once."
  if (plan?.missing_bom?.length) return "Complete the bill of materials first."
  return null
}

/** null when the order can be rejected, otherwise the reason it cannot. */
export function rejectBlockReason(o) {
  return o?.approval_status === "PENDING_APPROVAL" ? null : "Only an order waiting for approval can be rejected."
}

/* A disabled button cannot show a tooltip in every browser, so the reason sits on a wrapper. */
function Blockable({ reason, children }) {
  if (!reason) return children
  return (
    <span title={reason} className="inline-flex cursor-not-allowed">
      {children}
    </span>
  )
}

/**
 * The three decision buttons. `plan` is the order's stock check when it is loaded, `current` the popup they sit in
 * (that one is left out), `disabled` greys them all out (e.g. while the list refreshes right after a decision).
 */
export function DecisionButtons({ order, plan, onDecide, current = null, disabled = false, size = "md" }) {
  if (!order || !canApprove(order)) return null
  const rejectWhy = rejectBlockReason(order)
  const reviseWhy = reviseBlockReason(order, plan)
  // approving the rest of an approved order: that is the only decision left
  const rest = isRest(order)
  return (
    <>
      {!rest && current !== "reject" && (
        <Blockable reason={rejectWhy}>
          <MktBtn size={size} variant="danger" disabled={disabled || !!rejectWhy} aria-label={`Reject ${order.order_number}`} onClick={() => onDecide("reject")}>
            <X /> Reject
          </MktBtn>
        </Blockable>
      )}
      {!rest && current !== "revise" && (
        <Blockable reason={reviseWhy}>
          <MktBtn size={size} disabled={disabled || !!reviseWhy} aria-label={`Revise the quantity of ${order.order_number}`} onClick={() => onDecide("revise")}>
            <Scale /> Revise quantity
          </MktBtn>
        </Blockable>
      )}
      {current !== "plan" && (
        <MktBtn size={size} variant="primary" disabled={disabled} aria-label={`${approveLabel(order)} ${order.order_number}`} onClick={() => onDecide("plan")}>
          <PackageCheck /> {approveLabel(order)}
        </MktBtn>
      )}
    </>
  )
}
