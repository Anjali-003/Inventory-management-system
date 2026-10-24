import { useState } from "react"
import DecisionModal from "./DecisionModal"
import OrderPlanModal from "./OrderPlanModal"
import ReviseQuantityModal from "./ReviseQuantityModal"

/*
  State + popups for the Operations Admin's decisions (see DecisionButtons.jsx).
  Render `popup` once and call open("plan" | "revise" | "reject", order) from any button. Each popup gets onSwitch,
  so it can move straight to another decision (stock check -> revise quantity ...) without going back to the drawer.
*/
export default function useOrderDecisions() {
  const [active, setActive] = useState(null) // { kind, order }
  const open = (kind, order) => setActive({ kind, order })
  const close = () => setActive(null)

  let popup = null
  if (active) {
    const { kind, order } = active
    const props = { order, onClose: close, onSwitch: (next) => open(next, order) }
    if (kind === "plan") popup = <OrderPlanModal {...props} />
    else if (kind === "revise") popup = <ReviseQuantityModal {...props} />
    else popup = <DecisionModal {...props} mode="reject" />
  }
  return { active, open, close, popup }
}
