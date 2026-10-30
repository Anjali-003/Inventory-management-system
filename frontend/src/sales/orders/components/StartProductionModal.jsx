import { useState } from "react"
import { Loader2 } from "lucide-react"
import { ordersService } from "@/sales/orders/ordersService"
import { useGetProductionInfoQuery } from "@/sales/orders/ordersApi"
import { useChanged } from "@/lib/useChanged"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { Modal } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Notice } from "@/components/feedback"
import StatStrip from "@/components/StatStrip"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/stock"
import { isPositiveInteger, toInt } from "@/lib/numbers"

const NO_STOCK = "No additional quantity is currently approved or available to start."

// Mounted only while an order is selected (see Orders.jsx), so state resets per order.
export default function StartProductionModal({ order, onClose, onStarted }) {
  const [qty, setQty] = useState("1")
  const [saving, setSaving] = useState(false)
  const [submitError, setError] = useState("")

  const orderItemId = order.order_item_id ?? order.id
  const load = useGetProductionInfoQuery(orderItemId)
  const info = load.currentData ?? null
  const loading = load.isFetching && !info
  const error = submitError || (load.error ? errorMessage(load.error, "Failed to load production information") : "")

  // once per order, when its numbers arrive: nothing to start leaves the field empty
  if (useChanged(info ? orderItemId : null) && info) {
    setQty(Number(info.maxProductionQuantity) > 0 ? "1" : "")
  }

  const max = Number(info?.maxProductionQuantity)
  const canStart = Number.isSafeInteger(max) && max > 0

  const submit = async (e) => {
    e.preventDefault()

    if (!isPositiveInteger(qty)) {
      return setError("Production quantity must be a positive integer.")
    }

    if (!canStart) {
      return setError(NO_STOCK)
    }

    const n = toInt(qty)

    if (n > max) {
      return setError(`Maximum currently possible quantity is ${max}.`)
    }

    setSaving(true)
    setError("")

    try {
      const { data } = await ordersService.startProduction(orderItemId, n)
      onStarted(n, data.orderNumber)
    } catch (err) {
      const shortages = err.response?.data?.shortages

      setError(
        shortages
          ? `Not enough materials. ${shortages
              .map((s) => `${s.name}: shortage ${s.shortage}`)
              .join(", ")}`
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
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            size="lg"
            disabled={saving || loading || !canStart}
          >
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Starting..." : "Start production"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-4">
          <OrderDisplayNumber
            orderNumber={order.order_number}
            itemCount={order.item_count}
            itemIndex={order.item_index}
            className="font-semibold tabular-nums"
          />
          <p className="text-sm text-muted-foreground">
            {order.product_name}
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading production information...
          </div>
        )}

        {info && (
          <>
            <div className="overflow-hidden rounded-lg border">
              <StatStrip
                cols="grid-cols-2 sm:grid-cols-4"
                items={[
                  {
                    key: "o",
                    label: "Ordered",
                    value: Number(info.orderedQuantity),
                  },
                  {
                    key: "s",
                    label: "Started",
                    value: Number(info.quantityToProduce),
                  },
                  {
                    key: "c",
                    label: "Completed",
                    value: Number(info.quantityCompleted),
                  },
                  {
                    key: "r",
                    label: "Remaining",
                    value: Number(info.remainingToStart),
                  },
                ]}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Units currently ready with Store-allotted materials</p>
                <p className="text-2xl font-bold tabular-nums">
                  {Number.isFinite(max) ? max : 0}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={!canStart}
                onClick={() => {
                  setQty(String(max))
                  setError("")
                }}
              >
                Use max
              </Button>
            </div>

            <Field
              label="Quantity to start"
              htmlFor="start-qty"
              hint={`Maximum currently possible: ${canStart ? max : 0}`}
            >
              <TextInput
                id="start-qty"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                max={canStart ? max : undefined}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={!canStart}
              />
            </Field>
          </>
        )}

        {error && <Notice>{error}</Notice>}
      </div>
    </Modal>
  )
}