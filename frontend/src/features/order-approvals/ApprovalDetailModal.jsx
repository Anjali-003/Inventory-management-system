import { useState } from "react"
import { motion } from "motion/react"
import { Loader2, PackageCheck, X } from "lucide-react"
import { Modal } from "@/components/Modal"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { OrderTimeline, plural, stageOf } from "@/features/marketing-orders/orderParts"
import { usePermissions } from "@/features/auth/usePermissions"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import DecisionModal from "./DecisionModal"
import OrderPlanModal from "./OrderPlanModal"
import { BomBlockModal } from "./BomWarning"
import PlanSummary from "./PlanSummary"
import { approveLabel, canApprove } from "./approvalParts"
import { useGetOrderApprovalsQuery, useGetOrderPlanQuery } from "./orderApprovalsApi"

const EMPTY = []

/*
  Operations Admin: popup for one order, same look as the Marketing Manager's order popup
  (coloured status banner, progress timeline, product lines) plus what the admin needs:
  the live stock check and the Reject / "Check stock & send" actions for an order waiting for a decision.
  It reads the order from the live list by id, so it moves on by itself once the order is decided.
*/
export default function ApprovalDetailModal({ orderId, onClose }) {
  const { canEdit } = usePermissions()
  const editable = canEdit("orderApprovals")
  const { data = EMPTY } = useGetOrderApprovalsQuery()
  const [deciding, setDeciding] = useState(false)
  const [planning, setPlanning] = useState(false)

  const order = data.find((o) => o.id === orderId)
  const pending = order?.approval_status === "PENDING_APPROVAL"
  const approvable = canApprove(order) // waiting, or partly approved and open for the rest
  // the same plan the stock check below uses (one request, cached): its BOM problems are shown first
  const { data: plan, isLoading: planLoading } = useGetOrderPlanQuery(orderId, { skip: !approvable })
  if (!order) return null

  // An order with an incomplete BOM opens the blocking warning popup first, and nothing else.
  const idle = !deciding && !planning
  const checking = approvable && idle && planLoading
  const blocked = approvable && idle && !planLoading && plan?.missing_bom?.length > 0

  const stage = stageOf(order.approval_status)
  const units = order.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
  const Icon = stage?.icon

  return (
    <>
      {checking && (
        <Modal open onClose={onClose} size="sm" title={order.order_number}>
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking stock...
          </div>
        </Modal>
      )}
      {blocked && <BomBlockModal order={order} plan={plan} onClose={onClose} />}
      {idle && !checking && !blocked && (
        <Modal
          open
          onClose={onClose}
          size="lg"
          title={order.order_number}
          description={`${plural(order.items.length, "product")} · ${fmtQty(units)} units`}
          footer={
            <>
              <MktBtn onClick={onClose} data-autofocus className="sm:me-auto">Close</MktBtn>
              {editable && approvable && (
                <>
                  {pending && <MktBtn variant="danger" onClick={() => setDeciding(true)}><X /> Reject</MktBtn>}
                  <MktBtn variant="primary" onClick={() => setPlanning(true)}><PackageCheck /> {approveLabel(order)}</MktBtn>
                </>
              )}
            </>
          }
        >
          <div className="space-y-6">
            {stage && (
              <motion.div
                key={order.approval_status}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
                className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", stage.s.grad, stage.s.glow)}
              >
                <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
                <div className="relative flex items-center gap-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.short === "Pending" ? "Waiting for your decision" : stage.short}</p>
                    <p className="mt-0.5 text-xs text-white/80">Raised by {order.created_by_name || "-"}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(units)}</p>
                    <p className="mt-1 text-[11px] text-white/80">units</p>
                  </div>
                </div>
              </motion.div>
            )}

            {approvable && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold">{pending ? "Stock check" : "Stock check for the units not approved yet"}</h3>
                <div className="rounded-xl border border-[#dce5e0] p-3.5">
                  <PlanSummary orderId={order.id} items={order.items} />
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-3 text-sm font-semibold">Progress</h3>
              <OrderTimeline order={order} />
            </section>

            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold">Products</h3>
              <OrderItems items={order.items} />
            </section>
          </div>
        </Modal>
      )}
      {deciding && <DecisionModal order={order} mode="reject" onClose={() => setDeciding(false)} />}
      {planning && <OrderPlanModal order={order} onClose={() => setPlanning(false)} />}
    </>
  )
}
