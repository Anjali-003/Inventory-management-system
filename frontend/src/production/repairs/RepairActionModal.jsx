import { CheckCircle2, XCircle, Minus, Plus, Send } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";

const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1 block text-sm font-medium";

function RepairQuantityControl({ value, max, onChange }) {
  const selected = Math.min(max, Math.max(1, Number(value) || 1));
  const adjust = (delta) => onChange(String(Math.min(max, Math.max(1, selected + delta))));

  return <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-violet-50/70 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">Newly fixed items *</span>
      <span className="text-xs font-medium text-muted-foreground">{max} unit(s) remaining</span>
    </div>
    <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
      <Button type="button" variant="outline" size="icon-lg" className="size-11 rounded-lg border-violet-200 bg-white text-violet-800 hover:bg-violet-50" aria-label="Decrease fixed quantity" disabled={selected <= 1} onClick={() => adjust(-1)}>
        <Minus className="size-4" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        max={max}
        step="1"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-lg border border-violet-200 bg-white px-2 text-center text-2xl font-bold tabular-nums text-slate-950 outline-none transition focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15"
        aria-label="Newly fixed items"
      />
      <Button type="button" variant="outline" size="icon-lg" className="size-11 rounded-lg border-violet-200 bg-white text-violet-800 hover:bg-violet-50" aria-label="Increase fixed quantity" disabled={selected >= max} onClick={() => adjust(1)}>
        <Plus className="size-4" />
      </Button>
    </div>
    <input
      type="range"
      min="1"
      max={max}
      step="1"
      value={selected}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Select quantity to mark as repaired"
      className="mt-4 h-2 w-full cursor-pointer accent-violet-600"
    />
    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>1 unit</span><span>{max} units</span></div>
    <p className="mt-2 text-xs text-muted-foreground" aria-live="polite"><span className="font-semibold text-violet-800">{selected} unit(s)</span> will be added to the repaired quantity.</p>
  </div>;
}

export default function RepairActionModal({ open, action, repair, form, onChange, onClose, onSubmit, busy, error, limits }) {
  if (!action || !repair) return null;

  const configs = {
    approve: { title: "Approve repair request", description: `Approve ${repair.repair_number} and release it to the repair register.`, submit: "Approve request" },
    reject: { title: "Reject repair request", description: `A reason is required before ${repair.repair_number} can be rejected.`, submit: "Reject request" },
    progress: { title: "Update repair progress", description: `${limits.outstanding} item(s) remain to be repaired.`, submit: "Save repair progress" },
    qc: { title: "Final repair QC", description: `All ${repair.requested_quantity} requested item(s) are ready for one batch-level QC decision.`, submit: form.decision === "FAIL" ? "Confirm QC failure" : "Confirm QC pass" },
    dispatch: { title: "Mark repair as dispatched", description: `Confirm the complete remaining batch of ${Math.max(0, Number(repair.requested_quantity) - Number(repair.dispatched_quantity || 0))} item(s) has been returned to the customer.`, submit: "Yes, mark dispatched" },
  };
  const config = configs[action];
  const field = (key, label, options = {}) => <div key={key} className={options.className || ""}>
    <label className={labelClass} htmlFor={`repair-${key}`}>{label}</label>
    {options.multiline ? <textarea id={`repair-${key}`} className={`${inputClass} min-h-24`} value={form[key]} onChange={(e) => onChange(key, e.target.value)} maxLength={options.maxLength || 4000} required={options.required} placeholder={options.placeholder || "Add details"} />
      : <input id={`repair-${key}`} className={inputClass} type={options.type || "text"} min={options.min} max={options.max} step={options.step} value={form[key]} onChange={(e) => onChange(key, e.target.value)} maxLength={options.maxLength} required={options.required} placeholder={options.placeholder || ""} />}
  </div>;

  return <Modal
    open={open}
    onClose={onClose}
    title={config.title}
    description={config.description}
    size="lg"
    busy={busy}
    onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
    footer={<>
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="submit" disabled={busy || (action === "qc" && !form.decision)}>{busy ? "Saving…" : config.submit}</Button>
    </>}
  >
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repair number</p>
        <p className="mt-1 font-semibold">{repair.repair_number} · {repair.product_name}</p>
        <p className="mt-1 text-sm text-muted-foreground">Requested quantity: {repair.requested_quantity}</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {(action === "approve" || action === "reject") && field("remarks", action === "reject" ? "Rejection reason *" : "Approval note (optional)", { multiline: true, required: action === "reject", maxLength: 2000 })}
      {action === "progress" && <div className="space-y-4">
        <RepairQuantityControl value={form.quantity} max={limits.outstanding} onChange={(value) => onChange("quantity", value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("diagnosis", "Diagnosis (optional)", { multiline: true })}
          {field("notes", "Repair notes (optional)", { multiline: true })}
        </div>
      </div>}
      {action === "qc" && <div className="space-y-4">
        <div>
          <p className={labelClass}>QC decision *</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => onChange("decision", "PASS")} aria-pressed={form.decision === "PASS"} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${form.decision === "PASS" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "hover:bg-muted/50"}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5" /></span>
              <span><span className="block font-semibold">Pass</span><span className="mt-0.5 block text-xs text-muted-foreground">Move the complete batch to Repair Dispatch</span></span>
            </button>
            <button type="button" onClick={() => onChange("decision", "FAIL")} aria-pressed={form.decision === "FAIL"} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${form.decision === "FAIL" ? "border-destructive bg-destructive/5 ring-2 ring-destructive/15" : "hover:bg-muted/50"}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><XCircle className="size-5" /></span>
              <span><span className="block font-semibold">Fail</span><span className="mt-0.5 block text-xs text-muted-foreground">Return the complete batch to Repair Production</span></span>
            </button>
          </div>
        </div>
        {field("remarks", form.decision === "FAIL" ? "Failure reason *" : "QC remarks (optional)", { multiline: true, required: form.decision === "FAIL", maxLength: 4000, placeholder: form.decision === "FAIL" ? "Explain why the repair batch failed QC" : "Add inspection observations" })}
        <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">This decision applies to the complete batch of {repair.requested_quantity} items. QC does not support partial inspection or unit selection.</p>
      </div>}
      {action === "dispatch" && <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Send className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-emerald-950">Complete batch dispatch</p>
            <p className="mt-0.5 text-sm text-emerald-800">{Math.max(0, Number(repair.requested_quantity) - Number(repair.dispatched_quantity || 0))} unit(s) are QC-passed and ready to return.</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">Confirm that the remaining units in this repair batch have been handed back to the customer. This marks the repair as fully dispatched and moves it to Dispatch history. Partial dispatch is not supported.</p>
      </div>}
    </div>
  </Modal>;
}
