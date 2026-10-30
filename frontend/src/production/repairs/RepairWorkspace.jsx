import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Factory, PackageCheck, RefreshCw, Send, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback";
import { usePermissions } from "@/core/auth/usePermissions";
import { MktHero, SearchField } from "@/sales/marketing-orders/mktKit";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import RepairActionModal from "./RepairActionModal";
import {
  useCreateRepairMutation, useDecideRepairMutation, useDispatchRepairMutation,
  useGetRepairProductsQuery, useGetRepairsQuery, useInspectRepairMutation, useUpdateRepairProgressMutation,
} from "./repairsApi";

const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1 block text-sm font-medium";
const statusLabel = {
  PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", IN_REPAIR: "In repair", READY_FOR_QC: "Ready for QC",
  QC_FAILED: "QC failed — rework", QC_PASSED: "QC passed", PARTIALLY_DISPATCHED: "Partially dispatched", RETURNED: "Dispatched / returned", REJECTED: "Rejected",
};
const statusVariant = (status) => status === "REJECTED" || status === "QC_FAILED" ? "danger" : ["RETURNED", "QC_PASSED"].includes(status) ? "success" : status === "PENDING_APPROVAL" ? "warning" : "info";
const errorText = (error) => error?.response?.data?.message || error?.data?.message || error?.message || "Something went wrong. Please try again.";
const initialRequest = { productId: "", quantity: "1", customerName: "", customerReference: "", problemDescription: "" };
const initialActionForm = { quantity: "1", remarks: "", diagnosis: "", notes: "", dispatchReference: "" };
const number = (value) => Math.max(0, Number(value) || 0);
const terminal = (repair) => ["REJECTED", "RETURNED"].includes(repair.status);
const awaitingQc = (repair) => Math.max(0, number(repair.repaired_quantity) - number(repair.qc_passed_quantity));
const outstanding = (repair) => Math.max(0, number(repair.requested_quantity) - number(repair.repaired_quantity));
const dispatchable = (repair) => Math.max(0, number(repair.qc_passed_quantity) - number(repair.dispatched_quantity));
const sum = (rows, getValue) => rows.reduce((total, row) => total + getValue(row), 0);

function Progress({ repair }) {
  const requested = number(repair.requested_quantity);
  const repaired = number(repair.repaired_quantity);
  const pct = requested ? Math.min(100, Math.round((repaired / requested) * 100)) : 0;
  return <div className="space-y-2">
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Repair progress</span><span className="tabular-nums font-semibold">{fmtQty(repaired)} of {fmtQty(requested)} fixed ({pct}%)</span></div>
    <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>In production: <b className="text-foreground">{fmtQty(outstanding(repair))}</b></span><span>Awaiting QC: <b className="text-foreground">{fmtQty(awaitingQc(repair))}</b></span><span>Dispatched: <b className="text-foreground">{fmtQty(repair.dispatched_quantity)}</b></span></div>
  </div>;
}

function RequestForm({ onCreated }) {
  const { data: products = [], isLoading: productsLoading } = useGetRepairProductsQuery();
  const [createRepair, state] = useCreateRepairMutation();
  const [form, setForm] = useState(initialRequest);
  const [error, setError] = useState("");
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError("");
    try { await createRepair({ ...form, productId: Number(form.productId), quantity: Number(form.quantity) }).unwrap(); setForm(initialRequest); onCreated(); }
    catch (e) { setError(errorText(e)); }
  }
  return <Card className="overflow-hidden rounded-xl border-[#dce5e0] shadow-sm"><CardHeader><CardTitle>Raise a repair request</CardTitle><p className="text-sm text-muted-foreground">Submit the customer's product and quantity. Production Admin must approve it before repair work starts.</p></CardHeader><CardContent>
    {error && <Notice title="Request not saved">{error}</Notice>}
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div><label className={labelClass}>Product *</label><select className={inputClass} required value={form.productId} onChange={change("productId")} disabled={productsLoading}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku ? `${p.sku} — ` : ""}{p.name}</option>)}</select></div>
      <div><label className={labelClass}>Items to repair *</label><input className={inputClass} type="number" min="1" max="1000000" step="1" required value={form.quantity} onChange={change("quantity")} /></div>
      <div><label className={labelClass}>Customer name *</label><input className={inputClass} maxLength="180" required value={form.customerName} onChange={change("customerName")} placeholder="Customer / company" /></div>
      <div><label className={labelClass}>Customer reference</label><input className={inputClass} maxLength="120" value={form.customerReference} onChange={change("customerReference")} placeholder="Invoice, serial or ticket no." /></div>
      <div className="sm:col-span-2"><label className={labelClass}>Reported problem *</label><textarea className={`${inputClass} min-h-20`} required maxLength="4000" value={form.problemDescription} onChange={change("problemDescription")} placeholder="Describe the fault reported by the customer" /></div>
      <div className="flex items-end"><Button type="submit" disabled={state.isLoading || productsLoading || !products.length} className="w-full sm:w-auto"><Wrench className="mr-2 h-4 w-4" />{state.isLoading ? "Submitting…" : "Submit repair request"}</Button></div>
    </form>
  </CardContent></Card>;
}

function RepairCard({ repair, mode }) {
  const { role } = usePermissions();
  const [action, setAction] = useState("");
  const [form, setForm] = useState(initialActionForm);
  const [actionError, setActionError] = useState("");
  const [decide, decisionState] = useDecideRepairMutation();
  const [progress, progressState] = useUpdateRepairProgressMutation();
  const [inspect, inspectState] = useInspectRepairMutation();
  const [dispatch, dispatchState] = useDispatchRepairMutation();
  const canApprove = ["PRODUCTION_ADMIN", "SUPER_ADMIN"].includes(role);
  const canRepair = ["PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"].includes(role);
  const canQc = ["QUALITY_FG_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"].includes(role);
  const canDispatch = ["QUALITY_FG_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"].includes(role);
  const limits = { outstanding: outstanding(repair), awaitingQc: awaitingQc(repair), dispatchable: dispatchable(repair) };
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  function openAction(nextAction, quantity) {
    setAction(nextAction); setActionError("");
    setForm({ ...initialActionForm, quantity: String(quantity ?? 1) });
  }
  async function submitAction() {
    setActionError("");
    const payload = { id: repair.id, quantity: Number(form.quantity), remarks: form.remarks };
    let mutation;
    if (action === "approve" || action === "reject") mutation = () => decide({ id: repair.id, decision: action.toUpperCase(), remarks: form.remarks }).unwrap();
    else if (action === "progress") mutation = () => progress({ ...payload, diagnosis: form.diagnosis, notes: form.notes }).unwrap();
    else if (action === "pass" || action === "fail") mutation = () => inspect({ ...payload, decision: action.toUpperCase() }).unwrap();
    else if (action === "dispatch") mutation = () => dispatch({ ...payload, dispatchReference: form.dispatchReference }).unwrap();
    if (!mutation) return;
    const quantity = Number(form.quantity);
    const quantityLimit = action === "progress" ? limits.outstanding : action === "pass" || action === "fail" ? limits.awaitingQc : action === "dispatch" ? limits.dispatchable : Infinity;
    if (["progress", "pass", "fail", "dispatch"].includes(action) && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > quantityLimit)) {
      setActionError(`Enter a whole number from 1 to ${quantityLimit}.`);
      return;
    }
    if (["reject", "fail"].includes(action) && !form.remarks.trim()) {
      setActionError(action === "reject" ? "Enter a rejection reason." : "Enter the QC failure reason.");
      return;
    }
    if (action === "dispatch" && !form.dispatchReference.trim()) {
      setActionError("Enter a dispatch reference or tracking number.");
      return;
    }
    try { await mutation(); setAction(""); setForm(initialActionForm); }
    catch (error) { setActionError(errorText(error)); }
  }
  const [eventOpen, setEventOpen] = useState(false);
  return <>
    <Card className="min-w-0 overflow-hidden rounded-xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{repair.repair_number}</p><CardTitle className="mt-1 text-lg">{repair.product_name} <span className="font-normal text-muted-foreground">× {fmtQty(repair.requested_quantity)}</span></CardTitle><p className="mt-1 text-sm text-muted-foreground">{repair.customer_name}{repair.customer_reference ? ` · Ref: ${repair.customer_reference}` : ""}</p></div><Badge variant={statusVariant(repair.status)}>{statusLabel[repair.status] || repair.status}</Badge></div>
        <Progress repair={repair} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reported problem</p><p className="mt-1 whitespace-pre-wrap text-sm">{repair.problem_description}</p>{repair.diagnosis && <p className="mt-2 text-sm"><b>Diagnosis:</b> {repair.diagnosis}</p>}{repair.repair_notes && <p className="mt-1 text-sm"><b>Repair notes:</b> {repair.repair_notes}</p>}</div>
        {repair.approval_remarks && <p className="text-sm"><b>Approval note:</b> {repair.approval_remarks}</p>}
        {repair.qc_remarks && <p className="text-sm"><b>Latest QC note:</b> {repair.qc_remarks}</p>}
        {repair.dispatch_reference && <p className="text-sm"><b>Latest dispatch reference:</b> {repair.dispatch_reference}{repair.dispatched_at ? ` · ${fmtDateTime(repair.dispatched_at)}` : ""}</p>}
        {mode === "approvals" && canApprove && repair.status === "PENDING_APPROVAL" && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => openAction("approve", 1)}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve</Button><Button size="sm" variant="destructive" onClick={() => openAction("reject", 1)}>Reject</Button></div>}
        {mode === "production" && canRepair && !["PENDING_APPROVAL", "REJECTED", "RETURNED"].includes(repair.status) && limits.outstanding > 0 && <Button size="sm" onClick={() => openAction("progress", Math.min(limits.outstanding, 1))}><Wrench className="mr-2 h-4 w-4"/>Update repair progress</Button>}
        {mode === "qc" && canQc && limits.awaitingQc > 0 && repair.status !== "PENDING_APPROVAL" && repair.status !== "REJECTED" && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => openAction("pass", limits.awaitingQc)}><ClipboardCheck className="mr-2 h-4 w-4"/>QC pass</Button><Button size="sm" variant="destructive" onClick={() => openAction("fail", limits.awaitingQc)}><AlertCircle className="mr-2 h-4 w-4"/>QC fail</Button></div>}
        {mode === "dispatch" && canDispatch && limits.dispatchable > 0 && <Button size="sm" onClick={() => openAction("dispatch", limits.dispatchable)}><Send className="mr-2 h-4 w-4"/>Mark repaired items dispatched</Button>}
        <div className="border-t pt-3"><button type="button" className="text-sm font-semibold text-primary hover:underline" aria-expanded={eventOpen} onClick={() => setEventOpen((v) => !v)}>{eventOpen ? "Hide repair history" : `View repair history (${repair.events?.length || 0})`}</button>
          {eventOpen && <ol className="mt-3 space-y-3 border-l pl-4">{(repair.events || []).map((event) => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary"/><p className="text-sm font-medium">{String(event.action).replaceAll("_", " ")}{event.quantity ? ` · ${event.quantity} item(s)` : ""}</p><p className="text-xs text-muted-foreground">{event.actor_name} · {fmtDateTime(event.created_at)}</p>{event.remarks && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.remarks}</p>}</li>)}</ol>}
        </div>
      </CardContent>
    </Card>
    <RepairActionModal open={Boolean(action)} action={action} repair={repair} form={form} onChange={set} onClose={() => setAction("")} onSubmit={submitAction} busy={decisionState.isLoading || progressState.isLoading || inspectState.isLoading || dispatchState.isLoading} error={actionError} limits={limits}/>
  </>;
}

function SectionTabs({ value, onChange, items }) {
  return <div role="tablist" aria-label="Repair sections" className="flex min-w-0 gap-2 overflow-x-auto rounded-xl border bg-muted/30 p-1">
    {items.map((item) => <button key={item.key} type="button" role="tab" aria-selected={value === item.key} onClick={() => onChange(item.key)} className={`min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${value === item.key ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>
      <span>{item.label}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${value === item.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{fmtQty(item.count)}</span>
    </button>)}
  </div>;
}

function QuantitySummary({ repairs }) {
  const cards = [
    { label: "To repair", value: sum(repairs, outstanding), icon: Factory, tone: "text-blue-700 bg-blue-50" },
    { label: "Awaiting QC", value: sum(repairs, awaitingQc), icon: ClipboardCheck, tone: "text-amber-700 bg-amber-50" },
    { label: "Dispatched", value: sum(repairs, (r) => number(r.dispatched_quantity)), icon: PackageCheck, tone: "text-emerald-700 bg-emerald-50" },
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{cards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="rounded-xl border-[#dce5e0] shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5"/></span><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums">{fmtQty(value)} <span className="text-sm font-medium text-muted-foreground">items</span></p></div></CardContent></Card>)}</div>;
}

const PAGE_CONFIG = {
  requests: {
    title: "Repair Requests",
    description: "Raise customer repair requests and track their progress through the repair workflow.",
    initialSection: "requests",
  },
  approvals: {
    title: "Repair Approvals",
    description: "Review customer repair requests before repair work begins. Rejections require a reason.",
    initialSection: "pending",
  },
  production: {
    title: "Repair Production",
    description: "Record repaired quantities, diagnosis and repair notes for approved customer returns.",
    initialSection: "active",
  },
  qc: {
    title: "Repair QC",
    description: "Inspect repaired items, record pass or fail results, and send failed items back for rework.",
    initialSection: "awaiting",
  },
  dispatch: {
    title: "Repair Dispatch",
    description: "Dispatch QC-passed repaired items and record the return reference for the customer.",
    initialSection: "ready",
  },
};

export default function RepairWorkspace({ mode }) {
  const config = PAGE_CONFIG[mode] || PAGE_CONFIG.production;
  const { data: repairs = [], isLoading, isFetching, error, refetch } = useGetRepairsQuery();
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState(config.initialSection);
  const requestTabs = [
    { key: "requests", label: "Open requests", count: repairs.filter((r) => !terminal(r)).length },
    { key: "history", label: "Completed / rejected", count: repairs.filter(terminal).length },
  ];
  const approvalTabs = [
    { key: "pending", label: "Awaiting approval", count: repairs.filter((r) => r.status === "PENDING_APPROVAL").length },
    { key: "history", label: "Reviewed", count: repairs.filter((r) => r.status !== "PENDING_APPROVAL").length },
  ];
  const productionTabs = [
    { key: "active", label: "To repair", count: sum(repairs.filter((r) => !["PENDING_APPROVAL", "REJECTED", "RETURNED"].includes(r.status) && outstanding(r) > 0), outstanding) },
    { key: "completed", label: "Repair completed", count: repairs.filter((r) => number(r.repaired_quantity) >= number(r.requested_quantity) && number(r.requested_quantity) > 0).length },
  ];
  const qcTabs = [
    { key: "awaiting", label: "Awaiting QC", count: sum(repairs, awaitingQc) },
    { key: "history", label: "QC history", count: repairs.filter((r) => number(r.qc_passed_quantity) > 0 || r.status === "QC_FAILED" || Boolean(r.qc_remarks)).length },
  ];
  const dispatchTabs = [
    { key: "ready", label: "Ready to dispatch", count: sum(repairs, dispatchable) },
    { key: "history", label: "Dispatch history", count: sum(repairs, (r) => number(r.dispatched_quantity)) },
  ];

  const sourceRows = useMemo(() => {
    if (mode === "requests") return repairs.filter((r) => section === "history" ? terminal(r) : !terminal(r));
    if (mode === "approvals") return repairs.filter((r) => section === "history" ? r.status !== "PENDING_APPROVAL" : r.status === "PENDING_APPROVAL");
    if (mode === "production") {
      return repairs.filter((r) => section === "completed"
        ? number(r.requested_quantity) > 0 && number(r.repaired_quantity) >= number(r.requested_quantity)
        : !["PENDING_APPROVAL", "REJECTED", "RETURNED"].includes(r.status) && outstanding(r) > 0);
    }
    if (mode === "qc") {
      return repairs.filter((r) => section === "history"
        ? number(r.qc_passed_quantity) > 0 || r.status === "QC_FAILED" || Boolean(r.qc_remarks)
        : awaitingQc(r) > 0 && !["PENDING_APPROVAL", "REJECTED"].includes(r.status));
    }
    return repairs.filter((r) => section === "history"
      ? number(r.dispatched_quantity) > 0
      : dispatchable(r) > 0);
  }, [mode, repairs, section]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return sourceRows;
    return sourceRows.filter((r) => [r.repair_number, r.product_name, r.product_sku, r.customer_name, r.customer_reference, r.problem_description, r.status, r.dispatch_reference].some((v) => String(v || "").toLocaleLowerCase().includes(needle)));
  }, [sourceRows, query]);

  const tabs = mode === "requests" ? requestTabs
    : mode === "approvals" ? approvalTabs
      : mode === "production" ? productionTabs
        : mode === "qc" ? qcTabs : dispatchTabs;
  const emptyTitle = query
    ? "No matching repair records"
    : mode === "approvals" && section === "pending" ? "No requests awaiting approval"
      : mode === "requests" && section === "history" ? "No repair history yet"
        : mode === "production" && section === "completed" ? "No completed repairs yet"
          : mode === "production" ? "No repairs waiting for production"
            : mode === "qc" && section === "history" ? "No QC history yet"
              : mode === "qc" ? "No repaired items awaiting QC"
                : mode === "dispatch" && section === "history" ? "No dispatch history yet"
                  : mode === "dispatch" ? "No repaired items ready for dispatch"
                    : "Nothing to show in this section";

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
    <MktHero eyebrow="Customer repairs" title={config.title} description={config.description}>
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </MktHero>
    {notice && <Notice title="Repair request submitted">{notice}</Notice>}
    {mode === "requests" && section === "requests" && <RequestForm onCreated={() => { setNotice("Your request was submitted to Production Admin for approval."); setSection("requests"); refetch(); }} />}
    {error && <Notice title="Repair data could not be loaded">{errorText(error)}</Notice>}
    {mode === "production" && <QuantitySummary repairs={repairs.filter((r) => !["PENDING_APPROVAL", "REJECTED"].includes(r.status))} />}
    <Card className="min-w-0 overflow-hidden rounded-xl border-[#dce5e0] shadow-sm">
      <div className="space-y-3 border-b bg-slate-50/70 p-3 sm:p-4">
        <SectionTabs value={section} onChange={setSection} items={tabs}/>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"><div className="w-full min-w-0 sm:max-w-md"><SearchField className="w-full" value={query} onChange={setQuery} placeholder="Search repair no., product, customer, status…" /></div><p className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground sm:ml-auto">{filtered.length} result{filtered.length === 1 ? "" : "s"}{isFetching ? " · Updating…" : ""}</p></div>
      </div>
      {isLoading ? <div className="p-4"><TableSkeleton rows={4}/></div> : filtered.length === 0 ? <div className="p-5"><EmptyState title={emptyTitle}>{query ? "Try another search term or clear the search field." : "New repair work will appear here when it reaches this stage."}</EmptyState></div> : <div className="grid min-w-0 gap-4 p-3 sm:p-4 xl:grid-cols-2">{filtered.map((repair) => <RepairCard key={repair.id} repair={repair} mode={mode}/>)}</div>}
    </Card>
  </div>;
}
