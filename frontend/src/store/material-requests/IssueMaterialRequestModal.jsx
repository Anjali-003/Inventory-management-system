import { useEffect, useMemo, useRef, useState } from "react";
import { useChanged } from "@/lib/useChanged";
import { Loader2, PackageCheck } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Notice } from "@/components/feedback";
import { Field, TextInput } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import QuantityStepper from "@/components/QuantityStepper";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { fmtDateTime, fmtQty } from "@/lib/stock"

const makeIssueKey = () => `issue_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
import { useIssueMaterialRequestMutation } from "./materialRequestsApi";

export default function IssueMaterialRequestModal({ request, onClose }) {
  const toast = useToast();
  const [issueRequest, { isLoading: saving }] = useIssueMaterialRequestMutation();
  const [quantities, setQuantities] = useState({});
  const [productQuantity, setProductQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const errorNoticeRef = useRef(null);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIssueKey);

  if (useChanged(request?.id) && request) {
    setQuantities(Object.fromEntries(request.items.map((item) => [item.id, String(item.remaining_quantity)])));
    setProductQuantity(Number(request.requested_product_quantity) > Number(request.issued_product_quantity || 0) ? String(Number(request.requested_product_quantity) - Number(request.issued_product_quantity || 0)) : "");
    setRemarks("");
    setError("");
    setIdempotencyKey(makeIssueKey());
  }

  const openItems = useMemo(() => (request?.items || []).filter((item) => Number(item.remaining_quantity) > 0), [request?.items]);
  const productMode = request?.requested_product_quantity !== null && request?.requested_product_quantity !== undefined;
  const maxProductQuantity = productMode ? Math.max(0, Number(request.requested_product_quantity) - Number(request.issued_product_quantity || 0)) : 0;
  const selectedProductQuantity = Math.max(0, Number(productQuantity) || 0);
  const calculatedItems = useMemo(() => openItems.map((item) => ({
    ...item,
    issue_quantity: productMode && item.quantity_per_product !== null && item.quantity_per_product !== undefined
      ? Number((Number(item.quantity_per_product) * selectedProductQuantity).toFixed(2))
      : Number(quantities[item.id] || 0),
  })), [openItems, productMode, quantities, selectedProductQuantity]);

  useEffect(() => {
    if (error) errorNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  function fillAllRemaining() {
    if (productMode) setProductQuantity(String(maxProductQuantity));
    else setQuantities(Object.fromEntries(openItems.map((item) => [item.id, String(item.remaining_quantity)])));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (productMode && (!Number.isInteger(selectedProductQuantity) || selectedProductQuantity < 1 || selectedProductQuantity > maxProductQuantity)) {
      setError(`Choose between 1 and ${maxProductQuantity} product units to allot.`);
      return;
    }
    const items = [];
    for (const item of calculatedItems) {
      const text = String(item.issue_quantity ?? quantities[item.id] ?? "0").trim();
      if (!text || Number(text) === 0) continue;
      const quantity = Number(text);
      if (!Number.isFinite(quantity) || quantity < 0 || Math.round(quantity * 100) !== quantity * 100) {
        setError(`${item.name}: use a quantity with at most 2 decimal places, or 0 to skip.`);
        return;
      }
      if (quantity > Number(item.remaining_quantity)) {
        setError(`${item.name}: you can allot at most ${fmtQty(item.remaining_quantity)} ${item.unit}.`);
        return;
      }
      items.push({ request_item_id: item.id, quantity });
    }
    if (!items.length) return setError("Enter a quantity for at least one component.");

    try {
      const result = await issueRequest({ id: request.id, items, ...(productMode ? { product_quantity: selectedProductQuantity } : {}), remarks, idempotency_key: idempotencyKey }).unwrap();
      toast.success(result.status === "ISSUED" ? "All requested components have been handed over." : "Partial component handover saved.");
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.error ||
        err?.message ||
        "Could not confirm the component handover. Check that any additional stock has been received into Inventory, then try again."
      );
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
      title={`Allot materials · ${request.order_number}`}
      description="Confirm the component quantities physically handed over by Store."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} size="lg" disabled={saving || openItems.length === 0 || (productMode ? selectedProductQuantity < 1 || selectedProductQuantity > maxProductQuantity : !openItems.some((item) => Number(quantities[item.id]) > 0))}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
            {saving ? "Saving handover…" : "Confirm component handover"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div>
            <p className="font-semibold">{request.product_name}</p>
            <p className="text-xs text-muted-foreground">{request.product_sku} · requested by {request.requested_by_name || "Production"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Request created {fmtDateTime(request.created_at)}</p>
          </div>
          <Badge variant={request.status === "PARTIALLY_ISSUED" ? "warning" : "info"}>{request.status.replace(/_/g, " ")}</Badge>
        </div>

        {request.notes && <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">Production note: {request.notes}</div>}

        {error && <div ref={errorNoticeRef}><Notice title="Could not confirm component handover">{error}</Notice></div>}

        {productMode && maxProductQuantity > 0 && (
          <QuantityStepper
            id="allot-product-quantity"
            label="Components for how many product units?"
            description="The quantities below show the components to hand over for the selected units."
            value={productQuantity}
            min={1}
            max={maxProductQuantity}
            unitLabel="product units"
            onChange={setProductQuantity}
            disabled={saving}
          />
        )}

        {openItems.length === 0 ? (
          <Notice title="Request already fully allotted">There are no outstanding quantities in this request.</Notice>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_90px_90px_130px] gap-3 bg-muted/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Component</span><span className="text-right">Requested</span><span className="text-right">Allotted</span><span className="text-right">Hand over now</span>
            </div>
            <div className="divide-y">
              {openItems.map((item) => (
                <div key={item.id} className="grid grid-cols-1 items-start gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_90px_90px_130px] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Remaining: {fmtQty(item.remaining_quantity)} {item.unit}{productMode && item.quantity_per_product != null ? ` · ${fmtQty(item.quantity_per_product)} per product` : ""}</p>
                  </div>
                  <p className="text-right text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:hidden">Requested</span>{fmtQty(item.requested_quantity)}</p>
                  <p className="text-right text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:hidden">Already allotted</span>{fmtQty(item.issued_quantity)}</p>
                  {productMode ? (
                    <p className="text-right text-sm font-semibold tabular-nums"><span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">Hand over now</span>{fmtQty(calculatedItems.find((entry) => entry.id === item.id)?.issue_quantity || 0)} {item.unit}</p>
                  ) : (
                    <Field label="Quantity" htmlFor={`allot-material-${item.id}`}>
                      <TextInput id={`allot-material-${item.id}`} type="number" min="0" max={item.remaining_quantity} step="0.01" inputMode="decimal" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} />
                    </Field>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t bg-muted/30 p-3">
              <Button type="button" variant="outline" size="sm" onClick={fillAllRemaining}>Issue components for all remaining units</Button>
            </div>
          </div>
        )}

        <Field label="Allotment note (optional)" htmlFor="material-issue-remarks">
          <TextInput id="material-issue-remarks" maxLength={255} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. remaining 2 units will be issued after shift change" />
        </Field>
      </div>
    </Modal>
  );
}
