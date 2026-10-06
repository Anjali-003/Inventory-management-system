import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { TextInput } from "../FormField"
import { Notice } from "../feedback"
import ComponentCombobox from "../inventory/ComponentCombobox"
import { QTY_RE, errorMessage, newKey } from "../../lib/stock"

const blankLine = () => ({ key: newKey(), component: null, isNew: false, name: "", size: "", category: "", quantity: "", location: "" })

// a BOM row coming from GET /products/:id/bom -> an editor line
const fromBom = (b) => ({
  key: newKey(),
  component: {
    id: b.component_id,
    sku: b.component_sku,
    name: b.component_name,
    size: b.size,
    category: b.category,
    unit: b.unit,
    quantity_on_hand: b.quantity_on_hand,
    inventory_id: 1,
    is_active: 1,
  },
  isNew: false,
  name: "",
  size: "",
  category: "",
  quantity: b.quantity_required == null ? "" : String(Number(b.quantity_required)),
  location: b.location || "",
})

/**
 * Write a product's BOM by hand: pick components (or create a new one on the spot), then give the quantity per
 * unit and the PCB location. Saving replaces the whole BOM.   onSaved(bom, createdComponents)
 */
export default function BomEditorModal({ open, product, bom, onClose, onSaved }) {
  const [lines, setLines] = useState([])
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  useEffect(() => {
    if (!open) return
    setLines(bom && bom.length ? bom.map(fromBom) : [blankLine()])
    setErrors({})
    setFormError("")
    setBusy(false)
    lock.current = false
    // only when the dialog opens: later changes to `bom` must not wipe what is being typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (key, changes) => {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...changes } : l)))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }
  const remove = (key) => setLines((xs) => (xs.length === 1 ? [blankLine()] : xs.filter((l) => l.key !== key)))
  const add = () => setLines((xs) => [...xs, blankLine()])

  const usedIds = useMemo(() => new Set(lines.filter((l) => l.component).map((l) => l.component.id)), [lines])
  const filled = lines.filter((l) => l.component || l.isNew)

  const validate = () => {
    const e = {}
    const seen = new Map()
    lines.forEach((l, i) => {
      const empty = !l.component && !l.isNew
      if (empty && lines.length > 1 && !l.quantity.trim() && !l.location.trim()) return // untouched blank row: ignored
      if (empty) return void (e[l.key] = "Choose a component")
      if (l.isNew && !l.name.trim()) return void (e[l.key] = "Part name is required")
      if (l.isNew && l.name.trim().length > 150) return void (e[l.key] = "Part name is longer than 150 characters")
      const q = l.quantity.trim().replace(/,/g, "")
      if (q && !QTY_RE.test(q)) return void (e[l.key] = "Quantity must be a number with up to 2 decimals")
      if (q && Number(q) <= 0) return void (e[l.key] = "Quantity must be greater than zero")
      if (l.location.trim().length > 255) return void (e[l.key] = "Location is longer than 255 characters")
      const ident = l.component ? `id:${l.component.id}` : `new:${l.name.trim().toLowerCase()}|${l.size.trim().toLowerCase()}`
      if (seen.has(ident)) return void (e[l.key] = `Already on line ${seen.get(ident) + 1}`)
      seen.set(ident, i)
    })
    return e
  }

  const save = async () => {
    if (lock.current) return
    const e = validate()
    setErrors(e)
    setFormError("")
    if (Object.values(e).some(Boolean)) {
      setFormError("Fix the highlighted lines and save again.")
      return
    }
    const payload = lines
      .filter((l) => l.component || l.isNew)
      .map((l) => ({
        ...(l.component ? { component_id: l.component.id } : { newComponent: { name: l.name.trim(), size: l.size.trim(), category: l.category.trim() } }),
        quantity_required: l.quantity.trim() || null,
        location: l.location.trim(),
      }))
    lock.current = true
    setBusy(true)
    try {
      const { data } = await api.put(`/products/${product.id}/bom`, { lines: payload })
      onSaved(data.bom, data.createdComponents)
    } catch (err) {
      setFormError(errorMessage(err))
      lock.current = false
      setBusy(false)
    }
  }

  const newCount = lines.filter((l) => l.isNew).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      title={product ? `Edit BOM · ${product.name}` : "Edit BOM"}
      description={product ? `${product.sku} · components needed for ONE unit. Saving replaces the whole BOM.` : undefined}
      footer={
        <>
          <span className="text-sm text-muted-foreground sm:mr-auto">
            {filled.length} line{filled.length === 1 ? "" : "s"}
            {newCount > 0 && ` · ${newCount} new component${newCount === 1 ? "" : "s"} will be added to Inventory`}
          </span>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" size="lg" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            Save BOM
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <Notice title="Could not save the BOM">{formError}</Notice>}

        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={l.key} className={`rounded-lg border p-3 ${errors[l.key] ? "border-destructive" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="mt-2 w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.5fr)]">
                  {l.isNew ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="info">New component</Badge>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patch(l.key, { isNew: false, name: "", size: "", category: "" })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          <Undo2 className="size-3.5" />
                          Pick existing instead
                        </button>
                      </div>
                      <TextInput data-autofocus aria-label="Part No." placeholder="Part No. (name)" value={l.name} maxLength={150} disabled={busy} error={!!errors[l.key]} onChange={(e) => patch(l.key, { name: e.target.value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <TextInput aria-label="Size" placeholder="Size" value={l.size} maxLength={100} disabled={busy} onChange={(e) => patch(l.key, { size: e.target.value })} />
                        <TextInput aria-label="Category" placeholder="Category" value={l.category} maxLength={100} disabled={busy} onChange={(e) => patch(l.key, { category: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <ComponentCombobox
                      value={l.component}
                      error={!!errors[l.key]}
                      disabled={busy}
                      inListIds={usedIds}
                      onSelect={(c) => patch(l.key, { component: c })}
                      onClear={() => patch(l.key, { component: null })}
                      onCreate={(text) => patch(l.key, { isNew: true, name: text })}
                    />
                  )}
                  <TextInput
                    aria-label="Quantity per unit"
                    placeholder="Qty / unit"
                    inputMode="decimal"
                    value={l.quantity}
                    disabled={busy}
                    error={!!errors[l.key] && /Quantity/.test(errors[l.key])}
                    onChange={(e) => patch(l.key, { quantity: e.target.value })}
                  />
                  <TextInput aria-label="PCB location" placeholder="PCB location (e.g. R1, R2)" value={l.location} maxLength={255} disabled={busy} onChange={(e) => patch(l.key, { location: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={busy} onClick={() => remove(l.key)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 />
                </Button>
              </div>
              {errors[l.key] && <p className="mt-2 pl-9 text-xs text-destructive">{errors[l.key]}</p>}
            </li>
          ))}
        </ul>

        <Button type="button" variant="outline" size="lg" onClick={add} disabled={busy}>
          <Plus />
          Add line
        </Button>
        <p className="text-xs text-muted-foreground">
          Quantity can stay blank if it is not decided yet. Type a part that is not in Inventory and choose “Create new component”; it is added with 0 stock.
        </p>
      </div>
    </Modal>
  )
}
