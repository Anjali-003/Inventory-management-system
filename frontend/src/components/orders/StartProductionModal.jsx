import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Field, TextInput } from "../FormField"
import { Notice } from "../feedback"
import StatStrip from "../StatStrip"
import { Button } from "../ui/button"
import { errorMessage } from "../../lib/stock"
import { isPositiveInteger, toInt } from "../../lib/numbers"

const NO_STOCK = "No additional quantity can currently be started from available inventory."

// Mounted only while an order is selected (see Orders.jsx), so state resets per order.
export default function StartProductionModal({ order, onClose, onStarted }) {
  const [info, setInfo] = useState(null)
  const [qty, setQty] = useState("1")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    api.get(`/orders/${order.id}/production-info`)
      .then((r) => {
        if (stale) return
        setInfo(r.data)
        if (!(Number(r.data.maxProductionQuantity) > 0)) setQty("")
      })
      .catch((e) => !stale && setError(errorMessage(e, "Failed to load production information")))
      .finally(() => !stale && setLoading(false))
    return () => { stale = true }
  }, [order])

  const max = Number(info?.maxProductionQuantity)
  const canStart = Number.isSafeInteger(max) && max > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!isPositiveInteger(qty)) return setError("Production quantity must be a positive integer.")
    if (!canStart) return setError(NO_STOCK)
    const n = toInt(qty)
    if (n > max) return setError(`Maximum currently possible quantity is ${max}.`)

    setSaving(true)
    setError("")
    try {
      const { data } = await api.post(`/orders/${order.id}/start-production`, { quantity: n })
      onStarted(n, data.orderNumber)
    } catch (err) {
      const shortages = err.response?.data?.shortages
      setError(
        shortages
          ? `Not enough materials. ${shortages.map((s) => `${s.name}: shortage ${s.shortage}`).join(", ")}`
          : errorMessage(err, "Failed to start production")
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="md"
      title="Start production"
      description="Choose how many units to start now."
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving || loading || !canStart}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Starting..." : "Start production"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-semibold tabular-nums">{order.order_number}</p>
            <p className="text-sm text-muted-foreground">{order.product_name}</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading production information...
            </div>
          )}

          {info && (
            <>
              <div className="overflow-hidden rounded-lg border">
                <StatStrip
                  cols="grid-cols-2 sm:grid-cols-4"
                  items={[
                    { key: "o", label: "Ordered", value: Number(info.orderedQuantity) },
                    { key: "s", label: "Started", value: Number(info.quantityToProduce) },
                    { key: "c", label: "Completed", value: Number(info.quantityCompleted) },
                    { key: "r", label: "Remaining", value: Number(info.remainingToStart) },
                  ]}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Max from current inventory</p>
                  <p className="text-2xl font-bold tabular-nums">{Number.isFinite(max) ? max : 0}</p>
                </div>
                <Button type="button" variant="outline" size="lg" disabled={!canStart} onClick={() => { setQty(String(max)); setError("") }}>
                  Use max
                </Button>
              </div>

              <Field label="Quantity to start" htmlFor="start-qty" hint={`Maximum currently possible: ${canStart ? max : 0}`}>
                <TextInput id="start-qty" type="number" min="1" step="1" inputMode="numeric" max={canStart ? max : undefined}
                  value={qty} onChange={(e) => setQty(e.target.value)} disabled={!canStart} />
              </Field>
            </>
          )}

          {error && <Notice>{error}</Notice>}
      </div>
    </Modal>
  )
}
