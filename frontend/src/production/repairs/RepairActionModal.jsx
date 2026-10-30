import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";

const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1 block text-sm font-medium";

export default function RepairActionModal({ open, action, repair, form, onChange, onClose, onSubmit, busy, error, limits }) {
  if (!action || !repair) return null;
  const configs = {
    approve: { title: "Approve repair request", description: `Approve ${repair.repair_number} and release it to the repair register.`, submit: "Approve request" },
    reject: { title: "Reject repair request", description: `A reason is required before ${repair.repair_number} can be rejected.`, submit: "Reject request" },
    progress: { title: "Update repair progress", description: `${limits.outstanding} item(s) remain to be repaired.`, submit: "Save repair progress" },
    pass: { title: "Repair QC — Pass", description: `${limits.awaitingQc} item(s) are waiting for inspection.`, submit: "Record QC pass" },
    fail: { title: "Repair QC — Fail", description: `Failed items return to Production for another repair attempt. ${limits.awaitingQc} item(s) are awaiting inspection.`, submit: "Record QC failure" },
    dispatch: { title: "Dispatch repaired items", description: `${limits.dispatchable} QC-passed item(s) are available to dispatch.`, submit: "Confirm dispatch" },
  };
  const config = configs[action];
  const field = (key, label, options = {}) => <div key={key} className={options.className || ""}>
    <label className={labelClass} htmlFor={`repair-${key}`}>{label}</label>
    {options.multiline ? <textarea id={`repair-${key}`} className={`${inputClass} min-h-24`} value={form[key]} onChange={(e) => onChange(key, e.target.value)} maxLength={options.maxLength || 4000} required={options.required} placeholder={options.placeholder || "Add details"} />
      : <input id={`repair-${key}`} className={inputClass} type={options.type || "text"} min={options.min} max={options.max} step={options.step} value={form[key]} onChange={(e) => onChange(key, e.target.value)} maxLength={options.maxLength} required={options.required} placeholder={options.placeholder || ""} />}
  </div>;
  return <Modal open={open} onClose={onClose} title={config.title} description={config.description} size="lg" busy={busy}
    onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
    footer={<><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : config.submit}</Button></>}>
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repair number</p><p className="mt-1 font-semibold">{repair.repair_number} · {repair.product_name}</p><p className="mt-1 text-sm text-muted-foreground">Requested quantity: {repair.requested_quantity}</p></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {(action === "approve" || action === "reject") && field("remarks", action === "reject" ? "Rejection reason *" : "Approval note (optional)", { multiline: true, required: action === "reject", maxLength: 2000 })}
      {action === "progress" && <div className="grid gap-4 sm:grid-cols-2">{field("quantity", "Newly fixed items *", { type: "number", min: 1, max: limits.outstanding, step: 1, required: true })}{field("diagnosis", "Diagnosis (optional)", { multiline: true })}{field("notes", "Repair notes (optional)", { multiline: true, className: "sm:col-span-2" })}</div>}
      {(action === "pass" || action === "fail") && <div className="space-y-4">{field("quantity", "Items inspected *", { type: "number", min: 1, max: limits.awaitingQc, step: 1, required: true })}{field("remarks", action === "fail" ? "Failure reason *" : "QC remarks (optional)", { multiline: true, required: action === "fail" })}</div>}
      {action === "dispatch" && <div className="space-y-4">{field("quantity", "Items dispatched *", { type: "number", min: 1, max: limits.dispatchable, step: 1, required: true })}{field("dispatchReference", "Dispatch reference / tracking number *", { required: true, maxLength: 120, placeholder: "Courier, challan or tracking reference" })}{field("remarks", "Dispatch note (optional)", { multiline: true, maxLength: 2000 })}</div>}
    </div>
  </Modal>;
}
