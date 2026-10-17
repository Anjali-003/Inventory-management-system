import { motion } from "motion/react"
import { Loader2, Send, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { MktBtn, OrderItems } from "./mktKit"
import { SPRING_SOFT } from "./mktMotion"
import { OrderTimeline, plural, stageOf } from "./orderParts"

/*
  Popup for one marketing order: where it stands (coloured banner + timeline), the admin's remarks, and its
  product lines (a table from `sm` up, cards on a phone).
  A draft can be sent or deleted from here, so nobody has to go back to the list.
  It stays open after "Send to admin" so the timeline moves on in front of the user.
*/
export default function OrderDetailModal({ order, editable, busy, onClose, onSend, onDelete }) {
  const draft = order.approval_status === "DRAFT"
  const stage = stageOf(order.approval_status)
  const units = order.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
  const Icon = stage?.icon

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={order.order_number}
      description={`${plural(order.items.length, "product")} · ${fmtQty(units)} units`}
      footer={
        <>
          {editable && draft && (
            <MktBtn variant="danger" className="sm:me-auto" disabled={busy} onClick={() => onDelete(order)}>
              <Trash2 /> Delete draft
            </MktBtn>
          )}
          <MktBtn onClick={onClose} data-autofocus>Close</MktBtn>
          {editable && draft && (
            <MktBtn variant="primary" disabled={busy} onClick={() => onSend(order)}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
            </MktBtn>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {stage && (
          // key = status, so the banner re-plays its entrance (and changes colour) when the order moves on
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
                <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.short === "Pending" ? "Waiting for approval" : stage.short}</p>
                <p className="mt-0.5 text-xs text-white/80">{stage.hint}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(units)}</p>
                <p className="mt-1 text-[11px] text-white/80">units</p>
              </div>
            </div>
          </motion.div>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold">Progress</h3>
          <OrderTimeline order={order} />
        </section>

        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold">Products</h3>
          <OrderItems items={order.items} />
        </section>

        {order.production_request?.items?.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">
              {order.approval_status === "PARTIALLY_APPROVED" ? "Approved quantities (partial)" : "Approved quantities"}
            </h3>
            <OrderItems items={order.production_request.items} />
            {order.approval_status === "PARTIALLY_APPROVED" && (
              <p className="text-xs text-muted-foreground">
                The remaining ordered quantities were not approved for production now.
              </p>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
