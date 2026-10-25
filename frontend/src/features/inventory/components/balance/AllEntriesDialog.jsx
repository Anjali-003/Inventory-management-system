import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Modal } from "@/components/Modal";
import { fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { CfButton } from "@/components/HistoryUI";

// where an order with stock "waiting in production" is right now
const WHERE = {
  PENDING: "Approved, production not started",
  IN_PRODUCTION: "In production",
  TESTING: "In quality check",
};

function ComponentRow({ c }) {
  return (
    <li className="flex items-center justify-between gap-3 px-[18px] py-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{c.name}</p>
        <p className="mt-0.5 text-[10px] text-cf-faint">{c.sku}</p>
      </div>
      <p className="whitespace-nowrap text-xs font-bold tabular-nums">
        {fmtQty(c.quantity)}{" "}
        <span className="text-[10px] font-normal text-muted-foreground">{c.unit}</span>
      </p>
    </li>
  );
}

/* Stock that left the shelf on order approval but is not in a finished product yet: by order, or by component */
export default function AllEntriesDialog({
  dialog,
  inProduction,
  setDialog,
  sf,
}) {
  const [view, setView] = useState("orders");
  const [openOrder, setOpenOrder] = useState(null);
  const orders = sf.unfinished_orders || [];

  return (
    <Modal
      open={dialog?.kind === "production"}
      onClose={() => setDialog(null)}
      size="md"
      className="cf-scope"
      title="Waiting in production"
      description={`${fmtQty(inProduction)} components · not missing`}
      footer={
        <CfButton variant="secondary" onClick={() => setDialog(null)}>
          Close
        </CfButton>
      }
    >
      <div className="-mx-5 -my-5">
        <div className="border-b bg-cf-head px-[18px] py-3">
          <p className="text-[11px] leading-5 text-muted-foreground">
            These components left the stock when Operations Admin approved the order. They are counted as
            used only when the order passes Quality Control, so until then they wait here.
          </p>
          <div role="tablist" className="mt-2 inline-flex rounded-lg border bg-card p-0.5 text-xs">
            {[["orders", `By order (${orders.length})`], ["components", "By component"]].map(([k, l]) => (
              <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => setView(k)}
                className={cn("h-7 rounded-md px-3 font-semibold", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {view === "orders" ? (
          orders.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No order is holding stock right now.</p>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => {
                const isOpen = openOrder === o.order_id;
                return (
                  <li key={o.order_id}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpenOrder(isOpen ? null : o.order_id)}
                      className="flex w-full items-center justify-between gap-3 px-[18px] py-3 text-left hover:bg-muted/40">
                      <span className="flex min-w-0 items-center gap-2">
                        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold tabular-nums">{o.order_number}</span>
                          <span className="mt-0.5 block text-[10px] text-cf-faint">
                            {WHERE[o.status] || o.status} · {o.components.length} components
                          </span>
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-xs font-bold tabular-nums">{fmtQty(o.quantity)}</span>
                    </button>
                    {isOpen && (
                      <ul className="divide-y border-t bg-muted/20">
                        {o.components.map((c) => <ComponentRow key={c.component_id} c={c} />)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : sf.unfinished_components.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">No order is holding stock right now.</p>
        ) : (
          <ul className="divide-y">
            {sf.unfinished_components.map((c) => <ComponentRow key={c.component_id} c={c} />)}
          </ul>
        )}
      </div>
    </Modal>
  );
}
