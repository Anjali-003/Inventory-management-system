/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from "react"
import { PackageCheck, X } from "lucide-react"
import { usePermissions } from "@/features/auth/usePermissions"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import OrderDrawer from "@/features/marketing-orders/OrderDrawer"
import DecisionModal from "./DecisionModal"
import OrderPlanModal from "./OrderPlanModal"
import OpsTimelineTab from "./OpsTimelineTab"
import { FeasibilityTab, OPS_TABS } from "./OrderApprovals"
import { approveLabel, canApprove } from "./approvalParts"
import { useGetOrderApprovalsQuery } from "./orderApprovalsApi"

const EMPTY = []
const QUEUE = "PENDING_APPROVAL"

/*
  The Operations Admin's order side drawer for use outside the Incoming Orders page (the dashboard lists).
  Same drawer as that page: Overview / Products / Feasibility / Timeline tabs, and Reject / Check stock & send
  in the footer. `orderId={null}` keeps it closed. It reads the order from the live list by id.
*/
export default function OpsOrderDrawer({ orderId, onClose }) {
  const { canEdit } = usePermissions()
  const editable = canEdit("orderApprovals")
  const { data = EMPTY, isFetching } = useGetOrderApprovalsQuery()
  const [tab, setTab] = useState("overview")
  const [deciding, setDeciding] = useState(null) // { order, mode } (reject)
  const [planning, setPlanning] = useState(null) // the order whose stock check is open

  const selected = useMemo(
    () => (orderId != null ? (data.find((o) => String(o.id) === String(orderId)) ?? null) : null),
    [data, orderId]
  )

  const close = () => {
    setTab("overview")
    onClose()
  }

  return (
    <>
      <OrderDrawer
        order={selected && !deciding && !planning ? selected : null}
        tab={tab}
        onTab={setTab}
        onClose={close}
        tabs={OPS_TABS}
        tabContent={selected ? { feasibility: <FeasibilityTab order={selected} />, timeline: <OpsTimelineTab order={selected} /> } : undefined}
        actions={
          selected && editable && canApprove(selected) ? (
            <>
              {selected.approval_status === QUEUE && (
                <MktBtn variant="danger" disabled={isFetching} onClick={() => setDeciding({ order: selected, mode: "reject" })}>
                  <X /> Reject
                </MktBtn>
              )}
              <MktBtn variant="primary" disabled={isFetching} onClick={() => setPlanning(selected)}>
                <PackageCheck /> {approveLabel(selected)}
              </MktBtn>
            </>
          ) : null
        }
      />
      {deciding && <DecisionModal order={deciding.order} mode={deciding.mode} onClose={() => setDeciding(null)} />}
      {planning && <OrderPlanModal order={planning} onClose={() => setPlanning(null)} />}
    </>
  )
}
