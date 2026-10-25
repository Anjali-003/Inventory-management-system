import { useState } from "react"
import { Modal } from "@/components/Modal"
import { Field, TextInput, selectClass } from "@/components/FormField"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toast"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { EXTRA_REASONS, useAskExtraMaterialMutation, useGetExtraMaterialOptionsQuery } from "./extraMaterialsApi"

/* Production Manager: a piece got damaged, ask Store for more of one component (a valid reason is required) */
export default function ExtraMaterialModal({ open, onClose }) {
  const toast = useToast()
  const { data: orders = [], isLoading } = useGetExtraMaterialOptionsQuery(undefined, { skip: !open })
  const [ask, { isLoading: busy }] = useAskExtraMaterialMutation()
  const [form, setForm] = useState({ order_id: "", component_id: "", quantity: "", reason_code: "DAMAGED", reason: "" })
  const [error, setError] = useState("")
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value, ...(key === "order_id" ? { component_id: "" } : {}) }))

  const order = orders.find((o) => String(o.orderId) === form.order_id)
  const ready = form.order_id && form.component_id && Number(form.quantity) > 0 && form.reason.trim().length >= 5

  const submit = async (e) => {
    e.preventDefault()
    try {
      setError("")
      await ask(form).unwrap()
      toast.success("Sent to Store. You will be told when it is issued.")
      setForm({ order_id: "", component_id: "", quantity: "", reason_code: "DAMAGED", reason: "" })
      onClose()
    } catch (err) {
      setError(errorMessage(err, "Could not send the request."))
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Ask for extra material" description="Use this only when a piece got damaged or wasted. Store will see your reason." onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy || !ready}>{busy ? "Sending..." : "Send to Store"}</Button></>}>
      <div className="space-y-4">
        <Field label="Order" htmlFor="extra-order" required hint={!isLoading && orders.length === 0 ? "No order is in production right now." : undefined}>
          <select id="extra-order" className={cn(selectClass, "w-full")} value={form.order_id} onChange={set("order_id")} disabled={isLoading}>
            <option value="">{isLoading ? "Loading..." : "Select order"}</option>
            {orders.map((o) => <option key={o.orderId} value={o.orderId}>{o.orderNumber}</option>)}
          </select>
        </Field>
        <Field label="Component" htmlFor="extra-component" required>
          <select id="extra-component" className={cn(selectClass, "w-full")} value={form.component_id} onChange={set("component_id")} disabled={!order}>
            <option value="">Select component</option>
            {order?.components.map((c) => <option key={`${c.componentId}-${c.productName}`} value={c.componentId}>{c.name} ({c.sku}) · {c.productName}</option>)}
          </select>
        </Field>
        <Field label="Quantity" htmlFor="extra-qty" required>
          <TextInput id="extra-qty" type="number" min="0.01" step="0.01" value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Why is it needed?" htmlFor="extra-reason-code" required>
          <select id="extra-reason-code" className={cn(selectClass, "w-full")} value={form.reason_code} onChange={set("reason_code")}>
            {EXTRA_REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <Field label="What happened?" htmlFor="extra-reason" required hint="e.g. 2 PCBs burnt during soldering on line 3">
          <TextInput id="extra-reason" value={form.reason} maxLength={255} onChange={set("reason")} />
        </Field>
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
