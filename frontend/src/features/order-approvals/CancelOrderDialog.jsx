import { useState } from "react"
import { ConfirmDialog } from "@/components/Modal"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import { useCancelOrderMutation } from "./orderApprovalsApi"

/*
  Operations Admin / Super Admin: cancel an APPROVED order. Allowed only before production starts (the server refuses
  otherwise and says so). Every component the approval took out of stock goes back into stock; a reason is required.
*/
export default function CancelOrderDialog({ order, onClose }) {
  const toast = useToast()
  const [cancel, { isLoading: busy }] = useCancelOrderMutation()
  const [remarks, setRemarks] = useState("")
  const [error, setError] = useState("")

  const close = () => { setRemarks(""); setError(""); onClose() }
  const confirm = async () => {
    if (remarks.trim().length < 3) return setError("Write why this order is cancelled.")
    try {
      setError("")
      const res = await cancel({ id: order.id, remarks }).unwrap()
      toast.success(`${order.order_number} cancelled. ${res.returned_components} component${res.returned_components === 1 ? "" : "s"} back in stock.`)
      close()
    } catch (err) {
      setError(errorMessage(err, "Could not cancel the order."))
    }
  }

  return (
    <ConfirmDialog open={!!order} onClose={close} onConfirm={confirm} busy={busy} tone="danger"
      title={`Cancel ${order?.order_number ?? "order"}?`} confirmLabel="Yes, cancel order" cancelLabel="Keep order">
      <p>Every component this order took out of stock goes back into stock. Production, Store, Marketing and Purchase are told.</p>
      <p>This works only before production starts. It cannot be undone.</p>
      <Field label="Why is it cancelled?" htmlFor="cancel-remarks" required>
        <textarea id="cancel-remarks" rows={3} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Customer cancelled the order on the phone"
          className="w-full rounded-[8px] border border-cf-line-strong bg-card px-3 py-2 text-[13px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15" />
      </Field>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </ConfirmDialog>
  )
}
