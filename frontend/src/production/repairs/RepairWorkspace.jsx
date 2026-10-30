import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, ImagePlus, Plus, RefreshCw, Send, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterTabs, Panel } from "@/components/PageKit";
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback";
import { usePermissions } from "@/core/auth/usePermissions";
import { MktHero, SearchField } from "@/sales/marketing-orders/mktKit";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import { useToast } from "@/components/toast";
import RepairActionModal from "./RepairActionModal";
import { repairsService } from "./repairsService";
import {
  useCreateRepairMutation, useDecideRepairMutation, useDispatchRepairMutation,
  useGetRepairProductsQuery, useGetRepairsQuery, useInspectRepairMutation, useUpdateRepairProgressMutation,
} from "./repairsApi";

const inputClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1 block text-sm font-medium";
const statusLabel = {
  PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", IN_REPAIR: "In repair", READY_FOR_QC: "Ready for final QC",
  QC_FAILED: "QC failed — rework", QC_PASSED: "QC passed", PARTIALLY_DISPATCHED: "Partially dispatched", RETURNED: "Dispatched / returned", REJECTED: "Rejected",
};
const statusVariant = (status) => status === "REJECTED" || status === "QC_FAILED" ? "danger" : ["RETURNED", "QC_PASSED"].includes(status) ? "success" : status === "PENDING_APPROVAL" ? "warning" : "info";
const errorText = (error) => error?.response?.data?.message || error?.data?.message || error?.message || "Something went wrong. Please try again.";
const initialRequest = { productId: "", quantity: "1", customerName: "", customerReference: "", problemDescription: "" };
const initialActionForm = { quantity: "1", remarks: "", diagnosis: "", notes: "", decision: "" };
const number = (value) => Math.max(0, Number(value) || 0);
const terminal = (repair) => ["REJECTED", "RETURNED"].includes(repair.status);
const outstanding = (repair) => Math.max(0, number(repair.requested_quantity) - number(repair.repaired_quantity));
const isReadyForQc = (repair) => repair.status === "READY_FOR_QC"
  && number(repair.requested_quantity) > 0
  && number(repair.repaired_quantity) === number(repair.requested_quantity);
const isReadyForDispatch = (repair) => ["QC_PASSED", "PARTIALLY_DISPATCHED"].includes(repair.status)
  && number(repair.requested_quantity) > 0
  && number(repair.qc_passed_quantity) === number(repair.requested_quantity)
  && number(repair.dispatched_quantity) < number(repair.requested_quantity);
const sum = (rows, getValue) => rows.reduce((total, row) => total + getValue(row), 0);

function Progress({ repair }) {
  const requested = number(repair.requested_quantity);
  const repaired = number(repair.repaired_quantity);
  const pct = requested ? Math.min(100, Math.round((repaired / requested) * 100)) : 0;
  return <div className="space-y-2">
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Repair progress</span><span className="tabular-nums font-semibold">{fmtQty(repaired)} of {fmtQty(requested)} fixed ({pct}%)</span></div>
    <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>Remaining: <b className="text-foreground">{fmtQty(outstanding(repair))}</b></span><span>Repaired: <b className="text-foreground">{fmtQty(repaired)}</b></span><span>Dispatched: <b className="text-foreground">{fmtQty(repair.dispatched_quantity)}</b></span></div>
  </div>;
}

const MAX_REPAIR_IMAGE_BYTES = 1024 * 1024;
const MAX_REPAIR_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024;

async function compressRepairImage(file) {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot process the picture. Try a current version of Chrome or Edge.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    let blob = null;

    for (const resizeFactor of [1, 0.85, 0.7]) {
      const width = Math.max(1, Math.round(bitmap.width * scale * resizeFactor));
      const height = Math.max(1, Math.round(bitmap.height * scale * resizeFactor));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The picture could not be processed. Please try another image.");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        // The picture is normalized to JPEG so uploads have a predictable size and MIME type.
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_REPAIR_IMAGE_BYTES) break;
      }
      if (blob && blob.size <= MAX_REPAIR_IMAGE_BYTES) break;
    }

    if (!blob || blob.size > MAX_REPAIR_IMAGE_BYTES) {
      throw new Error("This picture is too large after compression. Choose a smaller image.");
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The picture could not be read. Please try again."));
      reader.readAsDataURL(blob);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 220) || "repair-picture";
    return { fileName: `${baseName}.jpg`, mimeType: "image/jpeg", dataUrl };
  } finally {
    bitmap.close?.();
  }
}

function RequestForm({ open, onClose, onCreated }) {
  const { data: products = [], isLoading: productsLoading } = useGetRepairProductsQuery();
  const [createRepair, state] = useCreateRepairMutation();
  const [form, setForm] = useState(initialRequest);
  const [picture, setPicture] = useState(null);
  const [picturePreview, setPicturePreview] = useState("");
  const [pictureError, setPictureError] = useState("");
  const [error, setError] = useState("");
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    if (!picture) {
      setPicturePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(picture);
    setPicturePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [picture]);

  function close() {
    if (state.isLoading) return;
    setForm(initialRequest);
    setPicture(null);
    setPictureError("");
    setError("");
    onClose();
  }

  function selectPicture(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPictureError("");
    if (!file) return;
    setPicture(null);
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setPictureError("Choose a JPG, PNG or WEBP image.");
      return;
    }
    if (!file.size || file.size > MAX_REPAIR_IMAGE_SOURCE_BYTES) {
      setPictureError("Choose a non-empty image smaller than 10 MB.");
      return;
    }
    setPicture(file);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.productId) return setError("Select a product.");
    if (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > 1000000) {
      return setError("Enter a valid repair quantity between 1 and 1,000,000.");
    }
    if (!form.customerName.trim()) return setError("Enter the company or customer name.");
    if (!form.problemDescription.trim()) return setError("Describe the problem reported by the customer.");

    try {
      const customerImage = picture ? await compressRepairImage(picture) : undefined;
      const createdRepair = await createRepair({
        ...form,
        productId: Number(form.productId),
        quantity: Number(form.quantity),
        ...(customerImage ? { customerImage } : {}),
      }).unwrap();
      setForm(initialRequest);
      setPicture(null);
      setPictureError("");
      onCreated(createdRepair);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return <Modal
    open={open}
    onClose={close}
    onSubmit={submit}
    title="New repair request"
    description="Submit the customer's product and quantity. Production Admin must approve it before repair work starts."
    size="xl"
    busy={state.isLoading}
    footer={<>
      <Button type="button" variant="outline" onClick={close} disabled={state.isLoading}>Cancel</Button>
      <Button type="submit" disabled={state.isLoading || productsLoading || !products.length}>
        <Wrench className="mr-2 h-4 w-4" />{state.isLoading ? "Submitting…" : "Submit repair request"}
      </Button>
    </>}
  >
    <div className="space-y-4">
      {error && <Notice title="Request not saved">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="repair-request-product">Product *</label>
          <select id="repair-request-product" className={inputClass} required value={form.productId} onChange={change("productId")} disabled={productsLoading}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.sku ? `${product.sku} — ` : ""}{product.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="repair-request-quantity">Items to repair *</label>
          <input id="repair-request-quantity" className={inputClass} type="number" min="1" max="1000000" step="1" required value={form.quantity} onChange={change("quantity")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="repair-request-customer">Company / customer name *</label>
          <input id="repair-request-customer" className={inputClass} maxLength="180" required value={form.customerName} onChange={change("customerName")} placeholder="Company or customer name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="repair-request-reference">Customer reference</label>
          <input id="repair-request-reference" className={inputClass} maxLength="120" value={form.customerReference} onChange={change("customerReference")} placeholder="Invoice, serial or ticket no." />
        </div>
        <div className="sm:col-span-2 xl:col-span-2">
          <label className={labelClass} htmlFor="repair-request-problem">Reported problem *</label>
          <textarea id="repair-request-problem" className={`${inputClass} min-h-24`} required maxLength="4000" value={form.problemDescription} onChange={change("problemDescription")} placeholder="Describe the fault reported by the customer" />
        </div>
      </div>

      <section className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-4" aria-labelledby="repair-picture-title">
        <div>
          <h3 id="repair-picture-title" className="text-sm font-semibold">Product picture <span className="font-normal text-muted-foreground">(optional)</span></h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Attach a photo of the returned product or the reported damage. JPG, PNG or WEBP; maximum source size 10 MB.</p>
        </div>
        {picturePreview ? (
          <div className="flex flex-wrap items-center gap-3">
            <img src={picturePreview} alt="Selected repair product" className="size-20 rounded-lg border bg-white object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{picture?.name}</p>
              <p className="text-xs text-muted-foreground">Picture attached to this request</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPicture(null)} disabled={state.isLoading}>
              <Trash2 className="mr-1.5 h-4 w-4" />Remove
            </Button>
          </div>
        ) : (
          <label htmlFor="repair-request-picture" className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
            <ImagePlus className="h-5 w-5" />Add picture
            <input id="repair-request-picture" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPicture} disabled={state.isLoading} />
          </label>
        )}
        {pictureError && <p role="alert" className="text-xs font-medium text-destructive">{pictureError}</p>}
      </section>
    </div>
  </Modal>;
}
function RepairImageAttachment({ repair }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!imageUrl) return undefined;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  async function openPicture() {
    setOpen(true);
    if (imageUrl || loading) return;

    setLoading(true);
    setError("");
    try {
      // Use the shared Axios client so the role header and login cookie accompany the request.
      const image = await repairsService.getImage(repair.id);
      setImageUrl(URL.createObjectURL(image));
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }

  function closePicture() {
    setOpen(false);
    setImageUrl("");
    setError("");
  }

  return <>
    <button
      type="button"
      onClick={openPicture}
      className="inline-flex items-center gap-2 text-left text-sm font-semibold text-primary hover:underline"
    >
      <ImagePlus className="size-4 shrink-0" />
      <span>View attached product picture</span>
      <span className="max-w-[180px] truncate font-normal text-muted-foreground">· {repair.customer_image.file_name}</span>
    </button>
    <Modal
      open={open}
      onClose={closePicture}
      title="Attached product picture"
      description={`${repair.repair_number} · ${repair.product_name}`}
      size="xl"
      busy={loading}
    >
      <div className="flex min-h-48 items-center justify-center">
        {loading && <p className="text-sm text-muted-foreground" role="status">Loading picture…</p>}
        {error && <Notice title="Unable to open picture">{error}</Notice>}
        {imageUrl && <img src={imageUrl} alt={`Attached picture for ${repair.repair_number}`} className="max-h-[70vh] max-w-full rounded-lg object-contain" />}
      </div>
    </Modal>
  </>;
}

function RepairCard({ repair, mode }) {
  const { role } = usePermissions();
  const toast = useToast();
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
  const limits = { outstanding: outstanding(repair) };
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
    else if (action === "qc") mutation = () => inspect({ id: repair.id, decision: form.decision, remarks: form.remarks }).unwrap();
    else if (action === "dispatch") mutation = () => dispatch({ id: repair.id }).unwrap();
    if (!mutation) return;
    const quantity = Number(form.quantity);
    if (action === "progress" && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limits.outstanding)) {
      setActionError(`Enter a whole number from 1 to ${limits.outstanding}.`);
      return;
    }
    if (action === "qc" && !["PASS", "FAIL"].includes(form.decision)) {
      setActionError("Select Pass or Fail to continue.");
      return;
    }
    if (action === "reject" && !form.remarks.trim()) {
      setActionError("Enter a rejection reason.");
      return;
    }
    if (action === "qc" && form.decision === "FAIL" && !form.remarks.trim()) {
      setActionError("Enter the QC failure reason.");
      return;
    }
    try {
      await mutation();
      if (action === "dispatch") toast.success(`${repair.repair_number} marked as dispatched`);
      setAction("");
      setForm(initialActionForm);
    } catch (error) { setActionError(errorText(error)); }
  }
  const [eventOpen, setEventOpen] = useState(false);
  return <>
    <Card className="min-w-0 overflow-hidden rounded-xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{repair.repair_number}</p><CardTitle className="mt-1 text-lg">{repair.product_name} <span className="font-normal text-muted-foreground">× {fmtQty(repair.requested_quantity)}</span></CardTitle><p className="mt-1 text-sm text-muted-foreground">{repair.customer_name}{repair.customer_reference ? ` · Ref: ${repair.customer_reference}` : ""}</p></div><Badge variant={statusVariant(repair.status)}>{statusLabel[repair.status] || repair.status}</Badge></div>
        {!["qc", "dispatch"].includes(mode) && <Progress repair={repair} />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reported problem</p><p className="mt-1 whitespace-pre-wrap text-sm">{repair.problem_description}</p>{repair.diagnosis && <p className="mt-2 text-sm"><b>Diagnosis:</b> {repair.diagnosis}</p>}{repair.repair_notes && <p className="mt-1 text-sm"><b>Repair notes:</b> {repair.repair_notes}</p>}</div>
        {repair.customer_image && <RepairImageAttachment repair={repair} />}
        {repair.approval_remarks && <p className="text-sm"><b>Approval note:</b> {repair.approval_remarks}</p>}
        {repair.qc_remarks && <p className="text-sm"><b>Latest QC note:</b> {repair.qc_remarks}</p>}
        {repair.dispatch_reference && <p className="text-sm"><b>Dispatch reference:</b> {repair.dispatch_reference}</p>}
        {repair.dispatched_at && <p className="text-sm"><b>Marked dispatched:</b> {fmtDateTime(repair.dispatched_at)}</p>}
        {mode === "approvals" && canApprove && repair.status === "PENDING_APPROVAL" && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => openAction("approve", 1)}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve</Button><Button size="sm" variant="destructive" onClick={() => openAction("reject", 1)}>Reject</Button></div>}
        {mode === "production" && canRepair && !["PENDING_APPROVAL", "REJECTED", "RETURNED"].includes(repair.status) && limits.outstanding > 0 && <Button size="sm" onClick={() => openAction("progress", Math.min(limits.outstanding, 1))}><Wrench className="mr-2 h-4 w-4"/>Update repair progress</Button>}
        {mode === "qc" && canQc && isReadyForQc(repair) && <Button size="sm" onClick={() => openAction("qc")}><ClipboardCheck className="mr-2 h-4 w-4"/>Review repair QC</Button>}
        {mode === "dispatch" && canDispatch && isReadyForDispatch(repair) && <Button size="sm" onClick={() => openAction("dispatch")}><Send className="mr-2 h-4 w-4"/>Mark as dispatched</Button>}
        <div className="border-t pt-3"><button type="button" className="text-sm font-semibold text-primary hover:underline" aria-expanded={eventOpen} onClick={() => setEventOpen((v) => !v)}>{eventOpen ? "Hide repair history" : `View repair history (${repair.events?.length || 0})`}</button>
          {eventOpen && <ol className="mt-3 space-y-3 border-l pl-4">{(repair.events || []).map((event) => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary"/><p className="text-sm font-medium">{String(event.action).replaceAll("_", " ")}{event.quantity ? ` · ${event.quantity} item(s)` : ""}</p><p className="text-xs text-muted-foreground">{event.actor_name} · {fmtDateTime(event.created_at)}</p>{event.remarks && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.remarks}</p>}</li>)}</ol>}
        </div>
      </CardContent>
    </Card>
    <RepairActionModal open={Boolean(action)} action={action} repair={repair} form={form} onChange={set} onClose={() => setAction("")} onSubmit={submitAction} busy={decisionState.isLoading || progressState.isLoading || inspectState.isLoading || dispatchState.isLoading} error={actionError} limits={limits}/>
  </>;
}

function SectionTabs({ value, onChange, items }) {
  return <FilterTabs
    label="Filter repair records by stage"
    items={items.map((item) => ({
      key: item.key,
      label: item.label,
      value: item.count,
      active: value === item.key,
      onClick: () => onChange(item.key),
    }))}
  />;
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
    description: "Make one final pass or fail decision after the complete repair batch is finished.",
    initialSection: "awaiting",
  },
  dispatch: {
    title: "Repair Dispatch",
    description: "Mark complete QC-passed repair batches as returned to the customer in one action.",
    initialSection: "ready",
  },
};

export default function RepairWorkspace({ mode }) {
  const config = PAGE_CONFIG[mode] || PAGE_CONFIG.production;
  const toast = useToast();
  const { data: repairs = [], isLoading, isFetching, error, refetch } = useGetRepairsQuery();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
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
    { key: "awaiting", label: "Awaiting QC", count: repairs.filter(isReadyForQc).length },
    { key: "history", label: "QC history", count: repairs.filter((r) => ["QC_PASSED", "QC_FAILED", "PARTIALLY_DISPATCHED", "RETURNED"].includes(r.status) || Boolean(r.qc_remarks)).length },
  ];
  const dispatchTabs = [
    { key: "ready", label: "Ready to dispatch", count: repairs.filter(isReadyForDispatch).length },
    { key: "history", label: "Dispatch history", count: repairs.filter((r) => r.status === "RETURNED").length },
  ];

  const sourceRows = useMemo(() => {
    if (mode === "requests") return repairs.filter((r) => section === "history" ? terminal(r) : !terminal(r));
    if (mode === "approvals") return repairs.filter((r) => section === "history" ? r.status !== "PENDING_APPROVAL" : r.status === "PENDING_APPROVAL");
    if (mode === "production") {
      return repairs.filter((r) => section === "completed"
        ? number(r.requested_quantity) > 0 && number(r.repaired_quantity) >= number(r.requested_quantity)
        : !["PENDING_APPROVAL", "REJECTED", "QC_PASSED", "PARTIALLY_DISPATCHED", "RETURNED"].includes(r.status) && outstanding(r) > 0);
    }
    if (mode === "qc") {
      return repairs.filter((r) => section === "history"
        ? number(r.qc_passed_quantity) > 0 || r.status === "QC_FAILED" || Boolean(r.qc_remarks)
        : isReadyForQc(r));
    }
    return repairs.filter((r) => section === "history"
      ? r.status === "RETURNED"
      : isReadyForDispatch(r));
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
              : mode === "qc" ? "No complete repair batches awaiting QC"
                : mode === "dispatch" && section === "history" ? "No dispatch history yet"
                  : mode === "dispatch" ? "No QC-passed repair batches ready for dispatch"
                    : "Nothing to show in this section";

  return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-8">
    <MktHero eyebrow="Customer repairs" title={config.title} description={config.description}>
      {mode === "requests" && <Button onClick={() => setRequestModalOpen(true)}><Plus className="mr-2 h-4 w-4" />New request</Button>}
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </MktHero>
    {mode === "requests" && <RequestForm
      open={requestModalOpen}
      onClose={() => setRequestModalOpen(false)}
      onCreated={(createdRepair) => {
        setRequestModalOpen(false);
        setSection("requests");
        refetch();
        toast.success(`${createdRepair?.repair_number || "Repair request"} sent to Production Admin`);
      }}
    />}
    {error && <Notice title="Repair data could not be loaded">{errorText(error)}</Notice>}

    <SectionTabs value={section} onChange={setSection} items={tabs}/>
    <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-4 md:bg-transparent md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
      <SearchField className="min-w-0 flex-1 sm:max-w-md sm:flex-none" value={query} onChange={setQuery} placeholder="Search repair no., product, customer, status…" />
      <div className="flex shrink-0 items-center gap-3 text-[13px] text-muted-foreground sm:flex-1 sm:justify-end" aria-live="polite">
        <span className="tabular-nums">{filtered.length} result{filtered.length === 1 ? "" : "s"}{isFetching ? " · Updating…" : ""}</span>
        {query.trim() && <button type="button" onClick={() => setQuery("")} className="whitespace-nowrap font-semibold text-primary hover:underline">Clear</button>}
      </div>
    </div>

    <div className="@container">
      {isLoading ? <Panel className="p-4"><TableSkeleton rows={4}/></Panel>
        : filtered.length === 0 ? <Panel className="p-5"><EmptyState title={emptyTitle}>{query ? "Try another search term or clear the search field." : "New repair work will appear here when it reaches this stage."}</EmptyState></Panel>
          : <div className="grid min-w-0 gap-3 @2xl:grid-cols-2">{filtered.map((repair) => <RepairCard key={repair.id} repair={repair} mode={mode}/>)}</div>}
    </div>
  </div>;
}
