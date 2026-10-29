import { useState } from "react"
import { Modal } from "@/components/Modal"
import QuantityStepper from "@/components/QuantityStepper"
import { Button } from "@/components/saturday/button"
import { productionService } from "@/features/production/productionService"
import { inProductionQuantity } from "@/features/production/productionWorkflow"

/*
  "Record finished units" of one production line: how many of the units being made are done now. They go on to
  Quality Control. Used on the Production page and the Production dashboard.
*/
export default function RecordUnitsModal({ item, onClose, onSaved }) {
  const max = inProductionQuantity(item)
  const [quantity, setQuantity] = useState(String(max))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    const value = Number(quantity)
    if (!Number.isSafeInteger(value) || value <= 0) return setError("Enter a positive whole number.")
    if (value > max) return setError(`You can record at most ${max} unit${max === 1 ? "" : "s"}.`)
    try {
      setSaving(true)
      setError("")
      await productionService.updateProgress(item.id, value)
      onSaved(value)
    } catch (err) {
      setError(err.response?.data?.message || "Could not save the finished units.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} busy={saving} size="sm" onSubmit={submit}
      title="Record finished units"
      description={[item?.order_number, item?.product_name].filter(Boolean).join(" · ")}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" size="lg" disabled={saving}>{saving ? "Saving..." : "Save"}</Button></>}>
      <div className="space-y-4 text-sm">
        <QuantityStepper
          id="production-completed-quantity"
          label="Units finished"
          description={`${max} unit${max === 1 ? " is" : "s are"} being made. The finished ones go to Quality Control.`}
          value={quantity}
          min={1}
          max={max}
          unitLabel="units"
          onChange={setQuantity}
          disabled={saving}
        />
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
