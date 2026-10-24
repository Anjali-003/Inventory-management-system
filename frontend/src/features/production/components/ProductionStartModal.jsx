import { useEffect, useState } from "react"
import { Loader2, PackageCheck, Play } from "lucide-react"
import { ordersService } from "@/features/orders/ordersService"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import QuantityStepper from "@/components/QuantityStepper"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/stock"

const number = (value) => Math.max(0, Number(value || 0))

function Metric({ label, value, tone = "neutral" }) {
  const styles = {
    neutral: "border-slate-200 bg-slate-50 text-slate-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  }

  return (
    <div className={`rounded-xl border p-3 ${styles[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

/** Production-only start dialog. Orders/Admin screens retain their existing shared modal. */
export default function ProductionStartModal({ order, onClose, onStarted }) {
  const [info, setInfo] = useState(null)
  const [qty, setQty] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const orderItemId = order?.order_item_id ?? order?.id

  useEffect(() => {
    let stale = false

    setLoading(true)
    setInfo(null)
    setQty("")
    setError("")

    ordersService.productionInfo(orderItemId)
      .then(({ data }) => {
        if (stale) return
        setInfo(data)
        const maximum = Number(data.maxProductionQuantity || 0)
        setQty(maximum > 0 ? String(maximum) : "")
      })
      .catch((err) => {
        if (!stale) setError(errorMessage(err, "Failed to load production information."))
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })

    return () => { stale = true }
  }, [orderItemId])

  const maximum = Number(info?.maxProductionQuantity || 0)
  const canStart = Number.isSafeInteger(maximum) && maximum > 0
  const ordered = number(info?.orderedQuantity ?? order?.quantity)
  const completed = number(info?.quantityCompleted)
  const allotted = Math.min(ordered, number(info?.materialAllottedQuantity ?? (number(info?.quantityToProduce) + maximum)))
  const leftToAllot = Math.max(0, number(info?.materialLeftToBeAllotted ?? (ordered - allotted)))

  async function submit(event) {
    event.preventDefault()
    setError("")

    const selectedQuantity = Number(qty)
    if (!Number.isSafeInteger(selectedQuantity) || selectedQuantity < 1) {
      setError("Choose a positive whole number of units to start.")
      return
    }
    if (!canStart) {
      setError("No units are ready to start. Request materials and wait for Store allotment.")
      return
    }
    if (selectedQuantity > maximum) {
      setError(`You can start up to ${maximum} unit${maximum === 1 ? "" : "s"} with the materials currently allotted.`)
      return
    }

    setSaving(true)
    try {
      const { data } = await ordersService.startProduction(orderItemId, selectedQuantity)
      onStarted?.(selectedQuantity, data.orderNumber)
    } catch (err) {
      setError(errorMessage(err, "Failed to start production."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Start production"
      description="Start only the units covered by materials Store has allotted."
      onSubmit={submit}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving || loading || !canStart || !qty || Number(qty) < 1 || Number(qty) > maximum}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {saving ? "Starting…" : "Start production"}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Production item</p>
          <OrderDisplayNumber
            orderNumber={info?.orderNumber || order?.order_number}
            itemCount={info?.itemCount ?? order?.item_count}
            itemIndex={info?.itemIndex ?? order?.item_index}
            className="mt-1 break-words text-lg font-extrabold leading-snug text-slate-950 sm:text-xl"
          />
          <p className="mt-1 break-words text-base font-semibold text-slate-700">{info?.productName || order?.product_name || "Product"}</p>
          {info?.productSku && <p className="mt-1 text-sm text-slate-500">{info.productSku}</p>}
        </div>

        {loading && <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading material allotment…</div>}

        {info && !loading && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Ordered" value={ordered} />
              <Metric label="Allotted" value={allotted} tone="success" />
              <Metric label="Completed" value={completed} tone="info" />
              <Metric label="Left to be allotted" value={leftToAllot} tone={leftToAllot ? "warning" : "neutral"} />
            </div>

            {canStart ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><PackageCheck className="size-5" /></span>
                <div>
                  <p className="font-bold text-emerald-950">Ready to start</p>
                  <p className="mt-0.5 text-sm text-emerald-800">{maximum} unit{maximum === 1 ? " is" : "s are"} currently covered by Store-allotted materials.</p>
                </div>
              </div>
            ) : (
              <Notice title="Waiting for material allotment">There are no units ready to start yet. Request materials and wait for the Store Manager to allot them.</Notice>
            )}

            <QuantityStepper
              id="production-start-quantity"
              label="How many units do you want to start?"
              description="The quantity starts at the maximum currently ready. Use − or + to adjust it."
              value={qty}
              min={1}
              max={maximum}
              unitLabel="units"
              onChange={setQty}
              disabled={!canStart || saving}
            />
          </>
        )}

        {error && <Notice title="Unable to start production">{error}</Notice>}
      </div>
    </Modal>
  )
}
