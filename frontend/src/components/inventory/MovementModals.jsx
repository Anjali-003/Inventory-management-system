import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpFromLine, Loader2, PencilLine } from "lucide-react"
import api from "../../api/api"
import { Modal, ConfirmDialog } from "../Modal"
import { Button } from "../ui/button"
import { Field, TextInput, selectClass } from "../FormField"
import { Notice } from "../feedback"
import { cn } from "../../lib/utils"
import { REASONS, checkQty, composeReason, errorMessage, fmtQty, fromCents, newKey, toCents } from "../../lib/stock"

/* One idempotency key per opened dialog; every retry of the same submission reuses it. */
export function useSubmission(open, onDone) {
  const key = useRef(newKey())
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState("")

  useEffect(() => {
    if (open) {
      key.current = newKey()
      lock.current = false
      setBusy(false)
      setServerError("")
    }
  }, [open])

  const run = async (request, onServerError) => {
    if (lock.current) return // blocks a double click before React re-renders
    lock.current = true
    setBusy(true)
    setServerError("")
    try {
      const { data } = await request(key.current)
      onDone(data)
    } catch (err) {
      // A definite rejection (4xx) means nothing was saved, so the next attempt gets a fresh key.
      // A network error / 5xx may have been saved, so the same key is kept: a retry then replays
      // the original result instead of posting the stock twice.
      if (err?.response && err.response.status < 500) key.current = newKey()
      setServerError(errorMessage(err))
      onServerError?.(err)
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, serverError, run }
}

const Preview = ({ label, children, tone }) => (
  <div className={cn("flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm", tone === "bad" ? "border-destructive/30 bg-destructive/5" : "bg-muted/50")}>
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold tabular-nums">{children}</span>
  </div>
)

export function ReasonFields({ kind, preset, setPreset, note, setNote, error, required = true }) {
  return (
    <div className="space-y-4">
      <Field label="Reason" htmlFor="mv-reason" required={required}>
        <select id="mv-reason" className={cn(selectClass, "w-full")} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {REASONS[kind].map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field
        label={preset === "Other" ? "Describe the reason" : "Note (optional)"}
        htmlFor="mv-note"
        required={preset === "Other"}
        error={error}
      >
        <TextInput id="mv-note" value={note} maxLength={200} error={!!error} placeholder={preset === "Other" ? "What happened?" : "e.g. supplier invoice, batch, location"} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </div>
  )
}

/* --------------------------------------------------------------- STOCK OUT */
export function StockOutModal({ open, item, onClose, onSaved, onConflict }) {
  const [qty, setQty] = useState("")
  const [reasonPreset, setReasonPreset] = useState(REASONS.out[0])
  const [note, setNote] = useState("")
  const [ref, setRef] = useState("")
  const [errors, setErrors] = useState({})
  const sub = useSubmission(open, (data) => onSaved(data, "out"))

  useEffect(() => {
    if (open) { setQty(""); setNote(""); setRef(""); setErrors({}); setReasonPreset(REASONS.out[0]) }
  }, [open, item?.id])

  if (!item) return <Modal open={false} />
  const availableC = toCents(item.available)
  const q = checkQty(qty)
  const over = q.cents != null && q.cents > availableC

  const submit = (e) => {
    e.preventDefault()
    const next = {}
    if (q.error) next.qty = q.error
    else if (over) next.qty = `Only ${fmtQty(item.available)} ${item.unit} available`
    const reason = composeReason(reasonPreset, note)
    if (reason.length < 3) next.note = "Add a short description"
    setErrors(next)
    if (Object.keys(next).length) return
    sub.run(
      (key) => api.post(`/inventory/${item.id}/stock-out`, { quantity: q.value, reason, reference_no: ref, idempotency_key: key }),
      (err) => { if (err?.response?.status === 409) onConflict?.() }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={sub.busy}
      onSubmit={submit}
      title="Stock out"
      description={`${item.component_name} · ${item.sku}`}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={sub.busy}>Cancel</Button>
          <Button type="submit" size="lg" disabled={sub.busy || availableC <= 0}>
            {sub.busy ? <Loader2 className="animate-spin" /> : <ArrowUpFromLine />} Issue stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {sub.serverError && <Notice title="Could not issue stock">{sub.serverError}</Notice>}

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
          {[["On hand", item.quantity_on_hand], ["Reserved", item.quantity_reserved], ["Available", item.available]].map(([l, v]) => (
            <div key={l} className="bg-card px-2 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{l}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtQty(v)}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Quantity (${item.unit})`} htmlFor="mv-qty" required error={errors.qty}>
            <TextInput id="mv-qty" data-autofocus inputMode="decimal" autoComplete="off" value={qty} error={!!errors.qty || over} placeholder="0" onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Reference no." htmlFor="mv-ref" hint="Job / work order (optional)">
            <TextInput id="mv-ref" value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} />
          </Field>
        </div>

        <ReasonFields kind="out" preset={reasonPreset} setPreset={setReasonPreset} note={note} setNote={setNote} error={errors.note} />

        <Preview label="Balance after" tone={over ? "bad" : undefined}>
          {fmtQty(item.quantity_on_hand)}{" "}
          {q.cents != null && !over && <span className="text-destructive">→ {fmtQty(fromCents(toCents(item.quantity_on_hand) - q.cents))}</span>}
          {over && <span className="text-destructive">exceeds available</span>}
        </Preview>
      </div>
    </Modal>
  )
}

/* ----------------------------------------------------- EDIT / ADJUSTMENT */
export function EditModal({ open, item, onClose, onSaved, onConflict }) {
  const [counted, setCounted] = useState("")
  const [minLevel, setMinLevel] = useState("")
  const [reasonPreset, setReasonPreset] = useState(REASONS.adjust[0])
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState({})
  const sub = useSubmission(open, (data) => onSaved(data, "edit"))

  useEffect(() => {
    if (open && item) {
      setCounted(String(Number(item.quantity_on_hand)))
      setMinLevel(String(Number(item.minimum_stock_level)))
      setNote(""); setErrors({}); setReasonPreset(REASONS.adjust[0])
    }
  }, [open, item?.id])

  const c = useMemo(() => (item ? checkQty(counted, "Counted quantity", { allowZero: true }) : {}), [counted, item])
  if (!item) return <Modal open={false} />

  const onHandC = toCents(item.quantity_on_hand)
  const reservedC = toCents(item.quantity_reserved)
  const delta = c.cents != null ? c.cents - onHandC : 0
  const minChanged = toCents(item.minimum_stock_level) !== (checkQty(minLevel, "x", { allowZero: true }).cents ?? -1)

  const submit = (e) => {
    e.preventDefault()
    const next = {}
    if (c.error) next.counted = c.error
    else if (c.cents < reservedC) next.counted = `Cannot be below ${fmtQty(item.quantity_reserved)} reserved for production`
    const m = checkQty(minLevel, "Minimum level", { allowZero: true })
    if (m.error) next.min = m.error
    const reason = composeReason(reasonPreset, note)
    if (delta !== 0 && reason.length < 3) next.note = "Add a short description"
    if (delta === 0 && !minChanged && !next.counted && !next.min) next.counted = "Nothing has changed"
    setErrors(next)
    if (Object.keys(next).length) return

    const body = {}
    if (delta !== 0) Object.assign(body, { new_quantity: c.value, expected_on_hand: item.quantity_on_hand, reason })
    if (minChanged) body.minimum_stock_level = m.value
    sub.run(
      (key) => api.put(`/inventory/${item.id}`, { ...body, idempotency_key: key }),
      (err) => { if (err?.response?.status === 409) onConflict?.() }
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={sub.busy}
      onSubmit={submit}
      title="Edit / adjust stock"
      description={`${item.component_name} · ${item.sku}. Corrections are posted as new ledger entries; history is never overwritten.`}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={sub.busy}>Cancel</Button>
          <Button type="submit" size="lg" disabled={sub.busy}>
            {sub.busy ? <Loader2 className="animate-spin" /> : <PencilLine />} Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {sub.serverError && <Notice title="Could not save">{sub.serverError}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Counted on-hand (${item.unit})`} htmlFor="ed-count" required error={errors.counted} hint={`System balance: ${fmtQty(item.quantity_on_hand)}`}>
            <TextInput id="ed-count" data-autofocus inputMode="decimal" autoComplete="off" value={counted} error={!!errors.counted} onChange={(e) => setCounted(e.target.value)} />
          </Field>
          <Field label="Minimum stock level" htmlFor="ed-min" error={errors.min} hint="Low-stock alert threshold">
            <TextInput id="ed-min" inputMode="decimal" autoComplete="off" value={minLevel} error={!!errors.min} onChange={(e) => setMinLevel(e.target.value)} />
          </Field>
        </div>

        {delta !== 0 && (
          <>
            <Preview label="Ledger entry to be posted">
              <span className={delta > 0 ? "text-success" : "text-destructive"}>
                {delta > 0 ? "Adjustment (+" : "Adjustment (−"}{fmtQty(fromCents(Math.abs(delta)))})
              </span>
            </Preview>
            <ReasonFields kind="adjust" preset={reasonPreset} setPreset={setReasonPreset} note={note} setNote={setNote} error={errors.note} />
          </>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ SAFE DELETE */
export function ArchiveDialog({ open, item, onClose, onSaved, onConflict }) {
  const [reason, setReason] = useState("")
  const sub = useSubmission(open, (data) => onSaved(data, "archive"))
  useEffect(() => { if (open) setReason("") }, [open])
  if (!item) return <ConfirmDialog open={false} />

  const blocked = Number(item.quantity_on_hand) > 0 || Number(item.quantity_reserved) > 0

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      busy={sub.busy}
      tone={blocked ? "default" : "danger"}
      title={blocked ? "Cannot archive yet" : "Archive this item?"}
      confirmLabel={blocked ? "Got it" : "Archive"}
      onConfirm={() => {
        if (blocked) return onClose()
        sub.run(
          () => api.delete(`/inventory/${item.id}`, { data: { reason: reason.trim() || undefined } }),
          (err) => { if (err?.response?.status === 409) onConflict?.() }
        )
      }}
    >
      {blocked ? (
        <p>
          <span className="font-medium text-foreground">{item.component_name}</span> still has {fmtQty(item.quantity_on_hand)} {item.unit} on hand
          {Number(item.quantity_reserved) > 0 ? ` (${fmtQty(item.quantity_reserved)} reserved for production)` : ""}. Issue it with Stock out or adjust it to zero first.
        </p>
      ) : (
        <>
          <p>
            <span className="font-medium text-foreground">{item.component_name}</span> will be hidden from inventory. Its full stock ledger is kept, and stocking it in again restores it.
          </p>
          <Field label="Reason (optional)" htmlFor="ar-reason">
            <TextInput id="ar-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. part discontinued" />
          </Field>
          {sub.serverError && <p className="text-destructive">{sub.serverError}</p>}
        </>
      )}
    </ConfirmDialog>
  )
}
