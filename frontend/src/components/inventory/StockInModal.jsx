import { useEffect, useRef, useState } from "react"
import { ArrowDownToLine, ArrowLeft, ListPlus, Loader2, PackagePlus, Trash2 } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Field, TextInput, selectClass } from "../FormField"
import { Notice } from "../feedback"
import { cn } from "../../lib/utils"
import ComponentCombobox from "./ComponentCombobox"
import { useSubmission } from "./MovementModals"
import {
  REASONS, SKU_RE, UNIT_RE, UNIT_SUGGESTIONS, checkQty, composeReason, errorMessage, fmtQty, fromCents, suggestSku, toCents,
} from "../../lib/stock"

const EMPTY_NC = { sku: "", name: "", unit: "pcs", min: "0", desc: "", category: "", size: "" }
let lineSeq = 0
const newLineId = () => ++lineSeq

/* The component a row-level "Stock in" was opened for (null when opened from the main button). */
const presetPick = (preset) =>
  preset
    ? { id: preset.component_id, sku: preset.sku, name: preset.component_name, unit: preset.unit, quantity_on_hand: preset.quantity_on_hand, inventory_id: preset.id, is_active: preset.is_active, location: preset.location, category: preset.category, size: preset.size }
    : null

const focusSoon = (id) => setTimeout(() => document.getElementById(id)?.focus(), 30)

/* One row of the receipt list. Quantity stays editable until the receipt is posted. */
function ListRow({ line, onQty, onRemove, disabled }) {
  const isNew = line.kind === "new"
  const name = isNew ? line.nc.name : line.component.name
  const sku = isNew ? line.nc.sku : line.component.sku
  const unit = isNew ? line.nc.unit : line.component.unit
  const onHandC = isNew ? 0 : toCents(String(line.component.quantity_on_hand ?? 0))
  const q = checkQty(line.qty)
  const message = line.error || q.error

  return (
    <li className={cn("rounded-lg border bg-card p-3", message && "border-destructive/50")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{name}</p>
            {isNew && <Badge variant="info">New component</Badge>}
            {!isNew && line.component.is_active === 0 && <Badge variant="warning">Reactivates</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {sku}
            {isNew && ` · minimum level ${fmtQty(line.nc.min)} ${unit}`}
            {(isNew ? line.nc.category : line.category) && ` · ${isNew ? line.nc.category : line.category}`}
            {(isNew ? line.nc.size : line.size) && ` · Size ${isNew ? line.nc.size : line.size}`}
            {line.location && ` · Location: ${line.location}`}
          </p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            On hand {fmtQty(fromCents(onHandC))} {unit}
            {q.cents != null && <span className="font-medium text-success"> → {fmtQty(fromCents(onHandC + q.cents))}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <TextInput
            aria-label={`Quantity for ${name}`}
            className="w-28 text-right tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={line.qty}
            error={!!message}
            disabled={disabled}
            onChange={(e) => onQty(e.target.value)}
          />
          <span className="w-9 text-xs text-muted-foreground">{unit}</span>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name} from list`} onClick={onRemove} disabled={disabled} className="hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      </div>
      {message && <p role="alert" className="mt-2 text-xs text-destructive">{message}</p>}
    </li>
  )
}

/**
 * Stock in as a receipt: search or create components, add each to the list with its quantity,
 * review everything, then post the whole list in one go (all lines or none).
 */
export default function StockInModal({ open, onClose, onSaved, preset }) {
  const [list, setList] = useState([])
  const [mode, setMode] = useState("pick") // "pick" an existing component | "new" component form
  const [picked, setPicked] = useState(null)
  const [qty, setQty] = useState("")
  const [loc, setLoc] = useState("")
  const [cat, setCat] = useState("")
  const [sz, setSz] = useState("")
  const [nc, setNc] = useState(EMPTY_NC)
  const [errors, setErrors] = useState({})
  const [flash, setFlash] = useState("")
  const [checking, setChecking] = useState(false)
  const [baseSku, setBaseSku] = useState("CMP-001")
  const [reasonPreset, setReasonPreset] = useState(REASONS.in[0])
  const [note, setNote] = useState("")
  const [refNo, setRefNo] = useState("")
  const [formErrors, setFormErrors] = useState({})
  const [discarding, setDiscarding] = useState(false)
  const comboRef = useRef(null)
  const discardRef = useRef(null)
  const sub = useSubmission(open, (data) => onSaved(data, "in"))

  useEffect(() => {
    if (!open) return
    setList([]); setMode("pick"); setQty(""); setLoc(""); setCat(""); setSz(""); setNc(EMPTY_NC); setErrors({}); setFlash(""); setChecking(false)
    setReasonPreset(REASONS.in[0]); setNote(""); setRefNo(""); setFormErrors({}); setDiscarding(false)
    setPicked(presetPick(preset))
  }, [open, preset])

  useEffect(() => {
    if (discarding) discardRef.current?.scrollIntoView({ block: "nearest" })
  }, [discarding])

  const busy = sub.busy
  const inListIds = new Set(list.filter((l) => l.kind === "existing").map((l) => l.component.id))
  const newSkusInList = list.filter((l) => l.kind === "new").map((l) => l.nc.sku)

  const requestClose = () => {
    if (busy) return
    if (list.length > 0) setDiscarding(true)
    else onClose()
  }

  const resetDraft = () => {
    setPicked(presetPick(preset)); setQty(""); setLoc(""); setCat(""); setSz(""); setNc(EMPTY_NC); setMode("pick"); setErrors({})
    if (preset) focusSoon("si-qty")
    else setTimeout(() => comboRef.current?.focus(), 30)
  }

  const patchNc = (k, v) => {
    setNc((p) => ({ ...p, [k]: v }))
    setErrors((p) => ({ ...p, [k]: undefined, form: undefined }))
  }

  const startCreate = async (text) => {
    setPicked(null); setQty(""); setLoc(""); setCat(""); setSz(""); setErrors({}); setFlash(""); setMode("new")
    const first = suggestSku(baseSku, newSkusInList)
    setNc({ ...EMPTY_NC, name: text, sku: first })
    focusSoon(text ? "si-qty" : "nc-name")
    try {
      const { data } = await api.get("/inventory/components/next-sku")
      setBaseSku(data.sku)
      const better = suggestSku(data.sku, newSkusInList)
      // only replace the suggestion if the user has not already typed their own SKU
      setNc((p) => (p.sku === first ? { ...p, sku: better } : p))
    } catch {
      /* keep the local suggestion; the server re-checks the SKU on save */
    }
  }

  const addToList = async () => {
    if (checking || busy) return
    setFlash(""); setFormErrors((p) => ({ ...p, list: undefined }))
    const q = checkQty(qty)
    if (loc.trim().length > 100) { setErrors({ loc: "Keep the location under 100 characters" }); return focusSoon("si-loc") }

    if (mode === "pick") {
      const next = {}
      if (!picked) next.component = "Choose a component, or create a new one"
      if (q.error) next.qty = q.error
      setErrors(next)
      if (next.component) return comboRef.current?.focus()
      if (next.qty) return focusSoon("si-qty")

      const same = list.find((l) => l.kind === "existing" && l.component.id === picked.id)
      if (same) {
        const sum = toCents(same.qty) + q.cents
        const total = checkQty(fromCents(sum))
        if (total.error) { setErrors({ qty: "The combined quantity is too large" }); return focusSoon("si-qty") }
        setList((ls) => ls.map((l) => (l.uid === same.uid ? { ...l, qty: total.value, location: loc.trim() || l.location, category: cat.trim() || l.category, size: sz.trim() || l.size, error: "" } : l)))
        setFlash(`${picked.name} was already in the list: quantity increased to ${fmtQty(total.value)}.`)
      } else {
        setList((ls) => [...ls, { uid: newLineId(), kind: "existing", component: picked, qty: q.value, location: loc.trim(), category: cat.trim(), size: sz.trim(), error: "" }])
        setFlash(`${picked.name} added to the list.`)
      }
      return resetDraft()
    }

    // ---- a brand-new component
    const next = {}
    const sku = nc.sku.trim().toUpperCase()
    const name = nc.name.trim().replace(/\s+/g, " ")
    const unit = nc.unit.trim().toLowerCase()
    const min = checkQty(nc.min, "Minimum level", { allowZero: true })
    if (!SKU_RE.test(sku)) next.sku = "2-50 characters: letters, digits, dot, dash, underscore"
    if (name.length < 2) next.name = "Enter the component name"
    else if (name.length > 150) next.name = "Keep the name under 150 characters"
    if (!UNIT_RE.test(unit)) next.unit = "Enter a unit, for example pcs or kg"
    if (min.error) next.min = min.error
    if (q.error) next.qty = q.error
    if (!nc.category.trim()) next.category = "Enter the category"
    if (!nc.size.trim()) next.size = "Enter the size"
    if (!loc.trim()) next.loc = "Enter the location"
    if (!next.sku && newSkusInList.includes(sku)) next.sku = "This SKU is already in your list"
    if (!next.name && list.some((l) => l.kind === "new" && l.nc.name.toLowerCase() === name.toLowerCase())) next.name = "A component with this name is already in your list"
    if (Object.keys(next).length) {
      setErrors(next)
      const first = ["name", "sku", "unit", "min", "category", "size", "loc", "qty"].find((k) => next[k])
      return focusSoon({ name: "nc-name", sku: "nc-sku", unit: "nc-unit", min: "nc-min", category: "nc-cat", size: "nc-size", loc: "si-loc", qty: "si-qty" }[first])
    }

    // does a component with this SKU or name already exist? then offer it instead of a duplicate
    setChecking(true)
    try {
      const [bySku, byName] = await Promise.all([
        api.get("/inventory/components", { params: { q: sku, limit: 10 } }),
        api.get("/inventory/components", { params: { q: name, limit: 25 } }),
      ])
      const skuHit = bySku.data.rows.find((r) => r.sku.toUpperCase() === sku)
      const nameHit = byName.data.rows.find((r) => r.name.toLowerCase() === name.toLowerCase())
      if (skuHit) next.sku = `SKU already used by “${skuHit.name}”. Select that component instead.`
      if (nameHit) next.name = `“${nameHit.name}” already exists (${nameHit.sku}). Select it instead.`
      if (Object.keys(next).length) {
        setErrors(next)
        return focusSoon(next.name ? "nc-name" : "nc-sku")
      }
    } catch (e) {
      setErrors({ form: errorMessage(e, "Could not verify the SKU. Check your connection and try again.") })
      return
    } finally {
      setChecking(false)
    }

    setList((ls) => [...ls, { uid: newLineId(), kind: "new", nc: { sku, name, unit, min: min.value, desc: nc.desc.trim(), category: nc.category.trim(), size: nc.size.trim() }, qty: q.value, location: loc.trim(), error: "" }])
    setFlash(`${name} will be created and stocked when you add the list.`)
    resetDraft()
  }

  // Opened for one particular component: no list, the quantity goes straight to stock.
  const submitSingle = () => {
    const q = checkQty(qty)
    if (q.error) { setErrors({ qty: q.error }); return focusSoon("si-qty") }
    const reason = composeReason(reasonPreset, note)
    if (reason.length < 3) return setFormErrors({ note: "Add a short description" })
    setErrors({}); setFormErrors({})
    const items = [{ component_id: picked.id, quantity: q.value, reason, reference_no: refNo.trim() }]
    sub.run((key) => api.post("/inventory/stock-in/batch", { idempotency_key: key, items }))
  }

  const submit = (e) => {
    e.preventDefault()
    if (preset) return submitSingle()
    if (list.length === 0) return setFormErrors({ list: "Add at least one item to the list first." })

    const checked = list.map((l) => ({ l, q: checkQty(l.qty) }))
    if (checked.some((c) => c.q.error)) {
      setList((ls) => ls.map((l) => ({ ...l, error: checkQty(l.qty).error || "" })))
      return setFormErrors({ list: "Fix the quantities highlighted in the list." })
    }
    const reason = composeReason(reasonPreset, note)
    if (reason.length < 3) return setFormErrors({ note: "Add a short description" })
    setFormErrors({})

    const items = checked.map(({ l, q }) => {
      const common = { quantity: q.value, reason, reference_no: refNo.trim(), location: l.location || undefined }
      return l.kind === "existing"
        ? { component_id: l.component.id, category: l.category || undefined, size: l.size || undefined, ...common }
        : { new_component: { sku: l.nc.sku, name: l.nc.name, unit: l.nc.unit, minimum_stock_level: l.nc.min, description: l.nc.desc, category: l.nc.category || undefined, size: l.nc.size || undefined }, ...common }
    })

    sub.run(
      (key) => api.post("/inventory/stock-in/batch", { idempotency_key: key, items }),
      (err) => {
        const d = err?.response?.data
        // the server names the offending line, so point at it
        if (d && Number.isInteger(d.line)) setList((ls) => ls.map((l, i) => (i === d.line ? { ...l, error: d.message } : l)))
      }
    )
  }

  const count = list.length
  const unitOfDraft = mode === "new" ? nc.unit || "" : picked?.unit || ""

  return (
    <Modal
      open={open}
      onClose={requestClose}
      busy={busy}
      onSubmit={submit}
      size="xl"
      title="Stock in"
      description={preset ? "Enter the quantity received for this component." : "Build a receipt: add every component you are receiving, review the list, then add it all to stock at once."}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={requestClose} disabled={busy}>Cancel</Button>
          <Button type="submit" size="lg" disabled={busy || (!preset && count === 0)}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
            {preset || count === 0 ? "Add to stock" : `Add ${count} item${count === 1 ? "" : "s"} to stock`}
          </Button>
        </>
      }
    >
      {/* Enter must never post a receipt by accident: inside this dialog it only adds the draft line. */}
      <div className="space-y-5" onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault() }}>
        {sub.serverError && <Notice title="Could not add stock">{sub.serverError}</Notice>}

        {discarding && (
          <div ref={discardRef} role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-warning">Discard the {count} item{count === 1 ? "" : "s"} in your list? Nothing has been saved yet.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDiscarding(false)}>Keep editing</Button>
              <Button type="button" size="sm" onClick={onClose}>Discard</Button>
            </div>
          </div>
        )}

        {/* ---------- add an item ---------- */}
        <section
          aria-label="Add an item"
          className="rounded-xl border bg-muted/30 p-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); preset ? submitSingle() : addToList() }
          }}
        >
          {mode === "pick" ? (
            <div className="space-y-3">
            <div className={cn("grid gap-3 sm:items-start", preset ? "sm:grid-cols-[minmax(0,1fr)_9.5rem]" : "sm:grid-cols-[minmax(0,1fr)_9.5rem_auto]")}>
              <Field label="Component" htmlFor="si-component" required error={errors.component}>
                <ComponentCombobox
                  ref={comboRef}
                  id="si-component"
                  value={picked}
                  inListIds={inListIds}
                  error={!!errors.component}
                  disabled={busy}
                  locked={!!preset}
                  onSelect={(row) => { setPicked(row); setErrors((p) => ({ ...p, component: undefined })); focusSoon("si-qty") }}
                  onClear={() => setPicked(null)}
                  onCreate={startCreate}
                />
              </Field>
              <Field label={`Quantity${unitOfDraft ? ` (${unitOfDraft})` : ""}`} htmlFor="si-qty" required error={errors.qty}>
                <TextInput id="si-qty" inputMode="decimal" autoComplete="off" value={qty} error={!!errors.qty} placeholder="0" disabled={busy}
                  onChange={(e) => { setQty(e.target.value); setErrors((p) => ({ ...p, qty: undefined })) }} />
              </Field>
              {!preset && (
                <div className="sm:pt-[1.625rem]">
                  <Button type="button" size="lg" className="w-full sm:w-auto" onClick={addToList} disabled={busy || checking}>
                    <ListPlus /> Add to list
                  </Button>
                </div>
              )}
            </div>
          </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><PackagePlus className="size-4 text-primary" /> New component</p>
                <button type="button" onClick={() => { setMode("pick"); setErrors({}) }} className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
                  <ArrowLeft className="size-3.5" /> Back to search
                </button>
              </div>
              {errors.form && <Notice title="Could not verify">{errors.form}</Notice>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="nc-name" required error={errors.name}>
                  <TextInput id="nc-name" maxLength={150} autoComplete="off" value={nc.name} error={!!errors.name} placeholder="e.g. Blue LED 5mm" onChange={(e) => patchNc("name", e.target.value)} />
                </Field>
                <Field label="SKU" htmlFor="nc-sku" required error={errors.sku} hint="Unique code. Suggested for you, editable.">
                  <TextInput id="nc-sku" maxLength={50} autoComplete="off" value={nc.sku} error={!!errors.sku} onChange={(e) => patchNc("sku", e.target.value.toUpperCase())} />
                </Field>
                <Field label="Unit" htmlFor="nc-unit" required error={errors.unit}>
                  <TextInput id="nc-unit" list="si-units" maxLength={20} autoComplete="off" value={nc.unit} error={!!errors.unit} onChange={(e) => patchNc("unit", e.target.value)} />
                  <datalist id="si-units">{UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>
                </Field>
                <Field label="Minimum stock level" htmlFor="nc-min" error={errors.min} hint="Low-stock alert threshold">
                  <TextInput id="nc-min" inputMode="decimal" autoComplete="off" value={nc.min} error={!!errors.min} onChange={(e) => patchNc("min", e.target.value)} />
                </Field>
                <Field label="Description (optional)" htmlFor="nc-desc" className="sm:col-span-2">
                  <TextInput id="nc-desc" maxLength={500} autoComplete="off" value={nc.desc} onChange={(e) => patchNc("desc", e.target.value)} />
                </Field>
                <Field label="Category" htmlFor="nc-cat" required error={errors.category} hint="e.g. Resistor, PCB, Connector">
                  <TextInput id="nc-cat" maxLength={100} autoComplete="off" value={nc.category} error={!!errors.category} onChange={(e) => patchNc("category", e.target.value)} />
                </Field>
                <Field label="Size" htmlFor="nc-size" required error={errors.size} hint="e.g. 0805, 5mm, 10x20 cm">
                  <TextInput id="nc-size" maxLength={100} autoComplete="off" value={nc.size} error={!!errors.size} onChange={(e) => patchNc("size", e.target.value)} />
                </Field>
                <Field label="Location" htmlFor="si-loc" required error={errors.loc} hint="Rack / shelf / godown">
                  <TextInput id="si-loc" maxLength={100} autoComplete="off" value={loc} error={!!errors.loc} placeholder="e.g. Rack A-2"
                    onChange={(e) => { setLoc(e.target.value); setErrors((p) => ({ ...p, loc: undefined })) }} />
                </Field>
                <Field label={`Quantity to add${unitOfDraft ? ` (${unitOfDraft})` : ""}`} htmlFor="si-qty" required error={errors.qty}>
                  <TextInput id="si-qty" inputMode="decimal" autoComplete="off" value={qty} error={!!errors.qty} placeholder="0" onChange={(e) => { setQty(e.target.value); setErrors((p) => ({ ...p, qty: undefined })) }} />
                </Field>
                <div className="flex items-end sm:justify-end">
                  <Button type="button" size="lg" className="w-full sm:w-auto" onClick={addToList} disabled={busy || checking}>
                    {checking ? <Loader2 className="animate-spin" /> : <ListPlus />} Add to list
                  </Button>
                </div>
              </div>
            </div>
          )}
          <p role="status" className="mt-2 min-h-4 text-xs text-success">{flash}</p>
        </section>

        {!preset && (
        <>
        {/* ---------- the list ---------- */}
        <section aria-labelledby="si-list-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="si-list-title" className="flex items-center gap-2 text-sm font-semibold">
              Stock-in list <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{count}</span>
            </h3>
            {count > 0 && (
              <button type="button" disabled={busy} onClick={() => setList([])} className="rounded text-xs font-medium text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50">
                Clear all
              </button>
            )}
          </div>
          {count === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">
              Nothing in the list yet. Search for a component above, enter the quantity and press <span className="font-medium text-foreground">Add to list</span>.
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((l) => (
                <ListRow
                  key={l.uid}
                  line={l}
                  disabled={busy}
                  onQty={(v) => setList((ls) => ls.map((x) => (x.uid === l.uid ? { ...x, qty: v, error: "" } : x)))}
                  onRemove={() => setList((ls) => ls.filter((x) => x.uid !== l.uid))}
                />
              ))}
            </ul>
          )}
          {formErrors.list && <p role="alert" className="mt-2 text-xs text-destructive">{formErrors.list}</p>}
        </section>
        </>
        )}

        {/* ---------- receipt details ---------- */}
        <section aria-label="Receipt details">
          <h3 className="mb-3 text-sm font-semibold">Receipt details <span className="font-normal text-muted-foreground">(recorded on every line in the ledger)</span></h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reason" htmlFor="si-reason" required>
              <select id="si-reason" className={cn(selectClass, "w-full")} value={reasonPreset} disabled={busy} onChange={(e) => setReasonPreset(e.target.value)}>
                {REASONS.in.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Reference no." htmlFor="si-ref" hint="PO / GRN / invoice (optional)">
              <TextInput id="si-ref" maxLength={60} value={refNo} disabled={busy} onChange={(e) => setRefNo(e.target.value)} />
            </Field>
            <Field label={reasonPreset === "Other" ? "Describe the reason" : "Note (optional)"} htmlFor="si-note" required={reasonPreset === "Other"} error={formErrors.note} className="sm:col-span-2">
              <TextInput id="si-note" maxLength={200} value={note} error={!!formErrors.note} disabled={busy} placeholder={reasonPreset === "Other" ? "What happened?" : "e.g. supplier, batch, storage location"}
                onChange={(e) => { setNote(e.target.value); setFormErrors((p) => ({ ...p, note: undefined })) }} />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  )
}
