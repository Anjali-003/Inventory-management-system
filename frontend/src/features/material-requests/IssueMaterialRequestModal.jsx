import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Notice } from "@/components/feedback";
import { Field, TextInput } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { useIssueMaterialRequestMutation } from "./materialRequestsApi";

const makeIssueKey = () => `issue_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/*
  Store hands Production EVERYTHING the request asks for, in one go: the Operations Admin approved that quantity and
  its stock was already set aside on approval, so there is nothing to choose. (The server refuses a smaller handover.)
*/
export default function IssueMaterialRequestModal({ request, onClose }) {
  const toast = useToast();
  const [issueRequest, { isLoading: saving }] = useIssueMaterialRequestMutation();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const errorNoticeRef = useRef(null);
  // the modal is mounted once per request (see StoreMaterialRequests), so a fresh key per opening
  const [idempotencyKey] = useState(makeIssueKey);

  useEffect(() => {
    if (error) errorNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  const openItems = useMemo(() => (request?.items || []).filter((item) => Number(item.remaining_quantity) > 0), [request?.items]);
  const productMode = request?.requested_product_quantity !== null && request?.requested_product_quantity !== undefined;
  const units = productMode ? Math.max(0, Number(request.requested_product_quantity) - Number(request.issued_product_quantity || 0)) : 0;
  // the full remaining quantity of every component (in product mode: per-product ratio x remaining units)
  const lines = useMemo(() => openItems.map((item) => ({
    ...item,
    issue_quantity: productMode && item.quantity_per_product != null
      ? Number((Number(item.quantity_per_product) * units).toFixed(2))
      : Number(item.remaining_quantity),
  })), [openItems, productMode, units]);

  async function submit(event) {
    event?.preventDefault();
    setError("");
    try {
      await issueRequest({
        id: request.id,
        items: lines.map((item) => ({ request_item_id: item.id, quantity: item.issue_quantity })),
        ...(productMode ? { product_quantity: units } : {}),
        remarks,
        idempotency_key: idempotencyKey,
      }).unwrap();
      toast.success("Every requested component has been handed over to Production.");
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.data?.message || err?.message || "Could not confirm the handover. Try again.");
    }
  }

  if (!request) return null;

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="xl"
      onSubmit={submit}
      title={`Hand over to Production · ${request.order_number}`}
      description="Give Production everything below, then confirm. The full request must be handed over."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving || lines.length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
            {saving ? "Saving…" : "Handed over, confirm"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="font-semibold">{request.product_name}{productMode && units > 0 ? ` × ${units} units` : ""}</p>
          <p className="text-xs text-muted-foreground">{request.product_sku} · asked by {request.requested_by_name || "Production"} · {fmtDateTime(request.created_at)}</p>
        </div>

        {request.notes && <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">Production note: {request.notes}</div>}
        {error && <div ref={errorNoticeRef}><Notice title="Could not confirm the handover">{error}</Notice></div>}

        {lines.length === 0 ? (
          <Notice title="Already handed over">Everything in this request has been given to Production.</Notice>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3 bg-muted/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Component</span><span className="text-right">Give now</span>
            </div>
            <div className="divide-y">
              {lines.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums">{fmtQty(item.issue_quantity)} {item.unit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Note (optional)" htmlFor="material-issue-remarks">
          <TextInput id="material-issue-remarks" maxLength={255} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. handed to line supervisor Ramesh" />
        </Field>
      </div>
    </Modal>
  );
}
