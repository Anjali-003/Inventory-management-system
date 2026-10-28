import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, DangerButton } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import { useIdempotentSubmit } from "@/lib/useIdempotentSubmit"
import { useApproveOrderMutation, useRejectOrderMutation } from "./orderApprovalsApi"

/*
  Approve or reject ONE order. `mode` is "approve" or "reject".
  Approve: remarks are optional. Reject: a reason is required (the order's creator and the Purchase Manager can see it).
*/
export default function DecisionModal({ order, mode, onClose, onSwitch }) {
  const toast = useToast()
  const [approve, { isLoading: approving }] = useApproveOrderMutation()
  const [reject, { isLoading: rejecting }] = useRejectOrderMutation()
  const busy = approving || rejecting
  const isReject = mode === "reject"
  const guarded = useIdempotentSubmit()

  const [remarks, setRemarks] = useState("")
  const [showError, setShowError] = useState(false)
  const [serverError, setServerError] = useState("")

  const remarksError = isReject && showError && remarks.trim().length < 3 ? "Write the reason for rejecting this order." : ""

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (isReject && remarks.trim().length < 3) { setShowError(true); return }
    try {
      const done = await guarded((key) =>
        isReject
          ? reject({ id: order.id, remarks: remarks.trim() }).unwrap()
          : approve({ id: order.id, remarks: remarks.trim(), idempotency_key: key, expected_round: Number(order.approval_round) || 0 }).unwrap()
      )
      if (done === undefined) return // a request is already in flight
      toast.success(isReject ? `${order.order_number} rejected` : `${order.order_number} approved. The Marketing Manager has been told. Now send the lists from the Stock check.`)
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, isReject ? "Could not reject this order." : "Could not approve this order."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      size="lg"
      title={`${isReject ? "Reject" : "Approve"} ${order.order_number}`}
      description={isReject
        ? "Tell the team why this order cannot go ahead."
        : "The Marketing Manager is told the order is accepted. Nothing is sent to Purchase or Production yet: you send those lists next, from the Stock check."}
      footer={
        <>
          <MktBtn onClick={onClose} disabled={busy} className={onSwitch ? "sm:me-auto" : undefined}>Cancel</MktBtn>
          {onSwitch && isReject && <MktBtn onClick={() => onSwitch("plan")} disabled={busy}>Back to stock check</MktBtn>}
          {isReject ? (
            <DangerButton type="submit" busy={busy}>Reject order</DangerButton>
          ) : (
            <MktBtn type="submit" variant="primary" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Approve order
            </MktBtn>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}

        <OrderItems items={order.items} />

        <Field
          label={isReject ? "Reason for rejection" : "Remarks (optional)"}
          htmlFor="decision-remarks"
          required={isReject}
          error={remarksError}
        >
          <textarea
            id="decision-remarks"
            rows={3}
            maxLength={500}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={isReject ? "e.g. Quantity too high, confirm with the customer first" : "Anything the Marketing Manager should know"}
            className="w-full rounded-[10px] border border-cf-line-strong bg-card px-3 py-2 text-base outline-none sm:text-[13px] transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
        </Field>
      </div>
    </Modal>
  )
}
