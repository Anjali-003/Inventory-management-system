import { useMemo, useState } from "react"
import { usePermissions } from "@/features/auth/usePermissions"
import OrderDrawer from "@/features/marketing-orders/OrderDrawer"
import OrderStory from "@/features/marketing-orders/OrderStory"
import { FeasibilityTab, OPS_TABS } from "./FeasibilityTab"
import { DecisionButtons } from "./DecisionButtons"
import useOrderDecisions from "./useOrderDecisions"
import { canApprove } from "./approvalParts"
import { useGetOrderApprovalsQuery, useGetOrderPlanQuery } from "./orderApprovalsApi"

const EMPTY = []

/*
  THE order drawer of the Operations Admin, used everywhere an order is opened (Incoming Orders page, dashboard,
  links from notifications): Overview / Products / Stock check / Timeline tabs, and the admin's buttons in the footer
  (Reject · Revise quantity · Approve while it waits; Send list to Purchase · Send to Production once approved,
  see DecisionButtons.jsx).

  `orderId={null}` keeps it closed; the order is read from the live list by id.
  `tab` / `onTab` are optional: pass them to keep the tab in the URL (the Incoming Orders page does), otherwise the
  drawer remembers the tab itself. With no tab chosen yet it opens where the work is: the Stock check (and its
  "Your decision" box) for an order that waits, the Overview for one already decided.
*/
export default function OpsOrderDrawer({ orderId, onClose, tab: tabProp, onTab }) {
  const { canEdit } = usePermissions()
  const editable = canEdit("orderApprovals")
  const { data = EMPTY, isFetching } = useGetOrderApprovalsQuery()
  const [ownTab, setOwnTab] = useState(null)
  const decisions = useOrderDecisions()

  const selected = useMemo(
    () => (orderId != null ? (data.find((o) => String(o.id) === String(orderId)) ?? null) : null),
    [data, orderId]
  )
  const waiting = !!selected && canApprove(selected)
  // the same cached stock check the Stock check tab shows: the footer buttons follow the same rules as its cards
  const { data: plan } = useGetOrderPlanQuery(selected?.id, { skip: !waiting })
  const startTab = waiting ? "feasibility" : "overview"
  const tab = tabProp ?? ownTab ?? startTab
  const setTab = onTab ?? setOwnTab
  const decide = (kind) => decisions.open(kind, selected)

  const close = () => {
    setOwnTab(null)
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
        wide
        tabs={OPS_TABS}
        tabContent={
          selected
            ? {
                feasibility: <FeasibilityTab order={selected} onDecide={editable && !isFetching ? decide : undefined} />,
                timeline: <OrderStory order={selected} />,
              }
            : undefined
        }
        actions={selected && editable ? <DecisionButtons order={selected} plan={plan} disabled={isFetching} onDecide={decide} /> : null}
      />
      {decisions.popup}
    </>
  )
}
