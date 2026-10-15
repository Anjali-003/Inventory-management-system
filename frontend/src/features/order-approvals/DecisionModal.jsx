import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Modal, DangerButton } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import { OrderLines } from "./approvalParts"
import { useApproveOrderMutation, useRejectOrderMutation } from "./orderApprovalsApi"

/*
  Approve or reject ONE order. `mode` is "approve" or "reject".
  Approve: remarks are optional. Reject: a reason is required (the order's creator and the Purchase Manager can see it).
*/
export default function DecisionModal({ order, mode, onClose }) {
  const toast = useToast()
  const [approve, { isLoading: approving }] = useApproveOrderMutation()
  const [reject, { isLoading: rejecting }] = useRejectOrderMutation()
  const busy = approving || rejecting
  const isReject = mode === "reject"

  const [remarks, setRemarks] = useState("")
  const [showError, setShowError] = useState(false)
  const [serverError, setServerError] = useState("")

  const remarksError = isReject && showError && remarks.trim().length < 3 ? "Write the reason for rejecting this order." : ""

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    if (isReject && remarks.trim().length < 3) { setShowError(true); return }
    try {
      await (isReject ? reject : approve)({ id: order.id, remarks: remarks.trim() }).unwrap()
      toast.success(isReject ? `${order.order_number} rejected` : `${order.order_number} approved and sent to the Purchase Manager`)
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
      description={isReject ? "Tell the team why this order cannot go ahead." : "Approved orders go to the Purchase Manager and production can start."}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          {isReject ? (
            <DangerButton type="submit" busy={busy}>Reject order</DangerButton>
          ) : (
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Approve order
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}

        <OrderLines items={order.items} />

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
            placeholder={isReject ? "e.g. Quantity too high, confirm with the customer first" : "Anything the Purchase Manager should know"}
            className="w-full rounded-[8px] border border-cf-line-strong bg-card px-3 py-2 text-[13px] outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
        </Field>
      </div>
    </Modal>
  )
}
