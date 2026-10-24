import { useMemo, useState } from "react"
import { usePermissions } from "@/features/auth/usePermissions"
import OrderDrawer from "@/features/marketing-orders/OrderDrawer"
import OpsTimelineTab from "./OpsTimelineTab"
import { FeasibilityTab, OPS_TABS } from "./FeasibilityTab"
import { DecisionButtons } from "./DecisionButtons"
import useOrderDecisions from "./useOrderDecisions"
import { useGetOrderApprovalsQuery } from "./orderApprovalsApi"

const EMPTY = []

/*
  THE order drawer of the Operations Admin, used everywhere an order is opened (Incoming Orders page, dashboard,
  links from notifications): Overview / Products / Stock check / Timeline tabs, and the three decisions in the footer
  (Reject · Revise quantity · Check stock & send, see DecisionButtons.jsx).

  `orderId={null}` keeps it closed; the order is read from the live list by id.
  `tab` / `onTab` are optional: pass them to keep the tab in the URL (the Incoming Orders page does), otherwise the
  drawer remembers the tab itself, starting on `initialTab`.
*/
export default function OpsOrderDrawer({ orderId, onClose, tab: tabProp, onTab, initialTab = "overview" }) {
  const { canEdit } = usePermissions()
  const editable = canEdit("orderApprovals")
  const { data = EMPTY, isFetching } = useGetOrderApprovalsQuery()
  const [ownTab, setOwnTab] = useState(initialTab)
  const decisions = useOrderDecisions()

  const tab = tabProp ?? ownTab
  const setTab = onTab ?? setOwnTab

  const selected = useMemo(
    () => (orderId != null ? (data.find((o) => String(o.id) === String(orderId)) ?? null) : null),
    [data, orderId]
  )

  const close = () => {
    setOwnTab("overview")
    onClose()
  }

  return (
    <>
      {/* hidden while a decision popup is open; the buttons stay disabled while the list refetches, so right after a
          decision the drawer cannot act again on the old (still "waiting") copy of the order */}
      <OrderDrawer
        order={selected && !decisions.active ? selected : null}
        tab={tab}
        onTab={setTab}
        onClose={close}
        tabs={OPS_TABS}
        tabContent={selected ? { feasibility: <FeasibilityTab order={selected} />, timeline: <OpsTimelineTab order={selected} /> } : undefined}
        actions={
          selected && editable ? (
            <DecisionButtons order={selected} disabled={isFetching} onDecide={(kind) => decisions.open(kind, selected)} />
          ) : null
        }
      />
      {decisions.popup}
    </>
  )
}
