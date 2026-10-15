import { Loader2, Send, Trash2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { ApprovalStatus, OrderLines } from "@/features/order-approvals/approvalParts"
import { fmtQty } from "@/lib/stock"
import { OrderTimeline, plural } from "./orderParts"

/*
  Popup for one marketing order: where it stands (timeline), the admin's remarks, and its product lines.
  A draft can be sent or deleted from here, so nobody has to go back to the table.
  It stays open after "Send to admin" so the timeline moves on in front of the user.
*/
export default function OrderDetailModal({ order, editable, busy, onClose, onSend, onDelete }) {
  const draft = order.approval_status === "DRAFT"
  const units = order.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)

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
            <Button type="button" variant="destructive" size="lg" className="sm:mr-auto" disabled={busy} onClick={() => onDelete(order)}>
              <Trash2 /> Delete draft
            </Button>
          )}
          <Button type="button" variant="outline" size="lg" onClick={onClose} data-autofocus>Close</Button>
          {editable && draft && (
            <Button type="button" size="lg" disabled={busy} onClick={() => onSend(order)}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <ApprovalStatus value={order.approval_status} />
        </div>
        <OrderTimeline order={order} />
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Products</h3>
          <OrderLines items={order.items} />
        </section>
      </div>
    </Modal>
  )
}
