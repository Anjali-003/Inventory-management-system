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
  const [productQuantity, setProductQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [requestKey] = useState(makeKey);

  useEffect(() => {
    if (data) setProductQuantity(data.requestable_product_quantity > 0 ? "1" : "0");
  }, [data?.order_item_id, data?.requestable_product_quantity]);

  const maxProductQuantity = Number(data?.requestable_product_quantity || 0);
  const selectedProductQuantity = Math.max(0, Number(productQuantity) || 0);
  const selected = useMemo(() => (data?.items || []).map((item) => ({
    ...item,
    quantity: Number((Number(item.quantity_per_product || item.quantity_per_unit || 0) * selectedProductQuantity).toFixed(2)),
  })), [data?.items, selectedProductQuantity]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!Number.isInteger(selectedProductQuantity) || selectedProductQuantity < 1 || selectedProductQuantity > maxProductQuantity) {
      setError(`Choose between 1 and ${maxProductQuantity} product units.`);
      return;
    }
    const items = selected.map((item) => ({ component_id: item.component_id, quantity: item.quantity }));
    if (!items.length || items.some((item) => item.quantity <= 0)) return setError("No component quantities are available for this product.");

    try {
      await createRequest({ order_item_id: orderItemId, product_quantity: selectedProductQuantity, items, notes, request_key: requestKey }).unwrap();
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
          <Button type="submit" size="lg" disabled={saving || isLoading || maxProductQuantity < 1 || selectedProductQuantity < 1 || selectedProductQuantity > maxProductQuantity}>
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
            <p className="mt-1 text-xs text-muted-foreground">Ordered quantity: {fmtQty(data?.approved_quantity ?? order?.ordered_quantity ?? 0)} · Available to request: {maxProductQuantity} products</p>
          </div>
          <Badge variant="info">Partial requests allowed</Badge>
        </div>

        {!isLoading && maxProductQuantity > 0 && (
          <div className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
            <div>
              <p className="text-sm font-semibold text-emerald-950">How many products need materials?</p>
              <p className="mt-1 text-xs text-emerald-800">Choose the number of finished products. Component quantities below are calculated from the BOM.</p>
            </div>
            <Field label="Product quantity" htmlFor="request-product-quantity">
              <TextInput id="request-product-quantity" type="number" min="1" max={maxProductQuantity} step="1" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} />
            </Field>
          </div>
        )}

        {isLoading && <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading BOM and remaining material allowance…</div>}
        {(error || loadError) && <Notice title="Could not load request details">{error || loadError?.response?.data?.message || loadError?.data?.message || "Refresh the production page and try again."}</Notice>}

        {!isLoading && data?.items?.length === 0 && (
          <Notice title="No remaining material allowance">All approved component quantities have already been requested, or this product has no remaining approved material allowance. Check the current request status or correct the BOM.</Notice>
        )}

        {!!data?.items?.length && (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_100px_130px] gap-3 bg-muted/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Component</span><span className="text-right">Per product</span><span className="text-right">Required quantity</span>
            </div>
            <div className="divide-y">
              {selected.map((item) => (
                <div key={item.component_id} className="grid grid-cols-1 items-start gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Remaining component allowance: {fmtQty(item.requestable_quantity)} {item.unit}</p>
                  </div>
                  <p className="text-right text-sm tabular-nums"><span className="mr-2 text-xs text-muted-foreground sm:hidden">Per product</span>{fmtQty(item.quantity_per_product)} {item.unit}</p>
                  <p className="text-right text-sm font-semibold tabular-nums"><span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">Required quantity</span>{fmtQty(item.quantity)} {item.unit}</p>
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
