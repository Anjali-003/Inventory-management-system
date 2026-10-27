/* eslint-disable react-refresh/only-export-components */
import { Check, Factory, Scale, ShoppingCart, X } from "lucide-react"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { canApprove, hasLeftToSend, planTotals } from "./approvalParts"

/*
  The Operations Admin's buttons on an order, the SAME everywhere (the order drawer on the Incoming Orders page and on
  the dashboard). Two moments:

    The order waits:       Reject  ·  Revise quantity  ·  Approve
                           (Approve is the decision only: Marketing is told. Nothing is sent yet.)
    The order is approved: Send list to Purchase  ·  Send to Production
                           (each one list; Production again whenever more parts come in)

  A button that does not apply right now stays visible but disabled, with the reason, so nobody has to guess.
  The popups live in useOrderDecisions.jsx.
*/

/**
 * null when the order can be revised, otherwise the reason it cannot. THE rule, used by the footer buttons and the
 * "Your decision" cards alike.
 */
export function reviseBlockReason(o, plan) {
  if (!o || o.approval_status !== "PENDING_APPROVAL") return "Only an order waiting for approval can be revised."
  if (!["MARKETING_MANAGER", "SUPER_ADMIN"].includes(o.created_by_role)) return "Only orders raised by Marketing (or the Super Admin) can be revised."
  if (o.revision) return "The quantity of this order was already revised once."
  if (plan?.missing_bom?.length) return "Complete the bill of materials first."
  return null
}

/** null when the order can be rejected, otherwise the reason it cannot. */
export function rejectBlockReason(o) {
  return o?.approval_status === "PENDING_APPROVAL" ? null : "Only an order waiting for approval can be rejected."
}

/** null when the component list can go to Purchase now, otherwise why not. */
export function purchaseBlockReason(plan) {
  if (!plan) return "Checking the stock..."
  if (plan.missing_bom?.length) return "Complete the bill of materials first."
  if (plan.purchase_sent) return "The component list was already sent to Purchase."
  if (!plan.shortages?.length) return "Nothing is short: every component is in stock."
  return null
}

/** null when something can go to Production now, otherwise why not. */
export function productionBlockReason(plan) {
  if (!plan) return "Checking the stock..."
  if (plan.missing_bom?.length) return "Complete the bill of materials first."
  if (planTotals(plan).canMake === 0) return "Nothing can be built from the current stock yet. Wait until the parts are in."
  return null
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
 * The buttons for this order. `plan` is the order's stock check when it is loaded, `disabled` greys them all out
 * (e.g. while the list refreshes right after an action).
 */
export function DecisionButtons({ order, plan, onDecide, disabled = false, size = "md" }) {
  if (!order || !canApprove(order)) return null

  if (hasLeftToSend(order)) {
    const purchaseWhy = purchaseBlockReason(plan)
    const productionWhy = productionBlockReason(plan)
    return (
      <>
        <Blockable reason={purchaseWhy}>
          <MktBtn size={size} disabled={disabled || !!purchaseWhy} aria-label={`Send the component list of ${order.order_number} to Purchase`} onClick={() => onDecide("purchase")}>
            <ShoppingCart /> Send list to Purchase
          </MktBtn>
        </Blockable>
        <Blockable reason={productionWhy}>
          <MktBtn size={size} variant="primary" disabled={disabled || !!productionWhy} aria-label={`Send ${order.order_number} to Production`} onClick={() => onDecide("production")}>
            <Factory /> Send to Production
          </MktBtn>
        </Blockable>
      </>
    )
  }

  const rejectWhy = rejectBlockReason(order)
  const reviseWhy = reviseBlockReason(order, plan)
  return (
    <>
      <Blockable reason={rejectWhy}>
        <MktBtn size={size} variant="danger" disabled={disabled || !!rejectWhy} aria-label={`Reject ${order.order_number}`} onClick={() => onDecide("reject")}>
          <X /> Reject
        </MktBtn>
      </Blockable>
      <Blockable reason={reviseWhy}>
        <MktBtn size={size} disabled={disabled || !!reviseWhy} aria-label={`Revise the quantity of ${order.order_number}`} onClick={() => onDecide("revise")}>
          <Scale /> Revise quantity
        </MktBtn>
      </Blockable>
      <MktBtn size={size} variant="primary" disabled={disabled} aria-label={`Approve ${order.order_number}`} onClick={() => onDecide("approve")}>
        <Check /> Approve
      </MktBtn>
    </>
  )
}
