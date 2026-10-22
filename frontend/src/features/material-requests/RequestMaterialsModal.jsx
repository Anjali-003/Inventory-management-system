import { useEffect, useMemo, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Notice } from "@/components/feedback";
import { Field, TextInput } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { fmtQty } from "@/lib/stock";
import { useCreateMaterialRequestMutation, useGetMaterialRequestOptionsQuery } from "./materialRequestsApi";

const makeKey = () => `mr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

export default function RequestMaterialsModal({ order, onClose, onSubmitted }) {
  const toast = useToast();
  const orderItemId = order?.order_item_id;
  const { data, isLoading, error: loadError } = useGetMaterialRequestOptionsQuery(orderItemId, { skip: !orderItemId });
  const [createRequest, { isLoading: saving }] = useCreateMaterialRequestMutation();
  const [quantities, setQuantities] = useState({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [requestKey] = useState(makeKey);

  useEffect(() => {
    if (data?.items) {
      setQuantities(Object.fromEntries(data.items.map((item) => [item.component_id, String(item.requestable_quantity)])));
    }
  }, [data?.order_item_id, data?.items]);

  const selected = useMemo(() => (data?.items || []).map((item) => ({
    ...item,
    quantity: quantities[item.component_id] ?? String(item.requestable_quantity),
  })), [data?.items, quantities]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const items = [];
    for (const item of selected) {
      const text = String(item.quantity).trim();
      if (!text || Number(text) === 0) continue;
      const quantity = Number(text);
      if (!Number.isFinite(quantity) || quantity < 0 || Math.round(quantity * 100) !== quantity * 100) {
        setError(`${item.name}: enter a positive quantity with at most 2 decimal places, or 0 to skip it.`);
        return;
      }
      if (quantity > Number(item.requestable_quantity)) {
        setError(`${item.name}: the remaining requestable quantity is ${fmtQty(item.requestable_quantity)} ${item.unit}.`);
        return;
      }
      items.push({ component_id: item.component_id, quantity });
    }
    if (!items.length) return setError("Enter a quantity for at least one component.");

    try {
      await createRequest({ order_item_id: orderItemId, items, notes, request_key: requestKey }).unwrap();
      toast.success("Material request sent to Store Manager.");
      onSubmitted?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.data?.message || err?.message || "Could not submit the material request.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="xl"
      onSubmit={submit}
      title="Request materials from Store"
      description="Inventory was deducted at order approval. This request records the quantities Production needs Store to physically allot; it does not deduct stock again."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving || isLoading || !selected.some((item) => Number(item.quantity) > 0)}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
            {saving ? "Sending request..." : "Send material request"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div className="min-w-0">
            <p className="font-semibold">{data?.order_number || order?.order_number || `Order #${order?.order_id}`}</p>
            <p className="text-sm text-muted-foreground">{data?.product_name || order?.product_name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Order quantity to supply: {fmtQty(data?.approved_quantity ?? order?.ordered_quantity ?? 0)}</p>
          </div>
          <Badge variant="info">Partial requests allowed</Badge>
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading BOM and remaining material allowance…</div>}
        {(error || loadError) && <Notice title="Could not load request details">{error || loadError?.response?.data?.message || loadError?.data?.message || "Refresh the production page and try again."}</Notice>}

        {!isLoading && data?.items?.length === 0 && (
          <Notice title="No remaining material allowance">All approved component quantities have already been requested, or this product has no remaining approved material allowance. Check the current request status or correct the BOM.</Notice>
        )}

        {!!data?.items?.length && (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_100px_130px] gap-3 bg-muted/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Component</span><span className="text-right">Still requestable</span><span className="text-right">Request quantity</span>
            </div>
            <div className="divide-y">
              {selected.map((item) => (
                <div key={item.component_id} className="grid grid-cols-1 items-start gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Already requested: {fmtQty(item.requested_quantity)} · issued: {fmtQty(item.issued_quantity)}</p>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums"><span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">Still requestable</span>{fmtQty(item.requestable_quantity)} {item.unit}</p>
                  <Field label="Quantity" htmlFor={`request-material-${item.component_id}`}>
                    <TextInput
                      id={`request-material-${item.component_id}`}
                      type="number"
                      min="0"
                      max={item.requestable_quantity}
                      step="0.01"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) => setQuantities((current) => ({ ...current, [item.component_id]: event.target.value }))}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Note for Store (optional)" htmlFor="material-request-notes" hint="For example, issue the first 5 units now; the balance can follow later.">
          <textarea id="material-request-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-cf-line-strong bg-card px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/15" />
        </Field>
        {error && !loadError && <Notice>{error}</Notice>}
      </div>
    </Modal>
  );
}
