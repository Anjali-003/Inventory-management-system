import { useState } from "react"
import DecisionModal from "./DecisionModal"
import OrderPlanModal from "./OrderPlanModal"
import ReviseQuantityModal from "./ReviseQuantityModal"

/*
  State + popups for the Operations Admin's actions on an order (see DecisionButtons.jsx).
  Render `popup` once and call open(kind, order) from any button:
    "approve" | "reject"         the decision (DecisionModal)
    "revise"                     promise less than ordered (ReviseQuantityModal)
    "production" | "purchase"    send one list of an approved order (OrderPlanModal)
  Each popup gets onSwitch to move straight to another one; "plan" means back to the drawer's Stock check.
*/
export default function useOrderDecisions() {
  const [active, setActive] = useState(null) // { kind, order }
  const open = (kind, order) => setActive({ kind, order })
  const close = () => setActive(null)

  let popup = null
  if (active) {
    const { kind, order } = active
    const props = { order, onClose: close, onSwitch: (next) => (next === "plan" ? close() : open(next, order)) }
    if (kind === "production" || kind === "purchase") popup = <OrderPlanModal {...props} mode={kind} />
    else if (kind === "revise") popup = <ReviseQuantityModal {...props} />
    else popup = <DecisionModal {...props} mode={kind === "approve" ? "approve" : "reject"} />
  }
  return { active, open, close, popup }
}
