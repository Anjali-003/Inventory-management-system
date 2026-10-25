import {
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  UserRound,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtQty } from "@/lib/stock";

const STATUS_META = {
  PENDING: { label: "Waiting for Store", variant: "warning", accent: "from-amber-700 to-orange-800", soft: "bg-amber-50 text-amber-800 ring-amber-100" },
  PARTIALLY_ISSUED: { label: "Partially allotted", variant: "info", accent: "from-blue-600 to-cyan-800", soft: "bg-blue-50 text-blue-800 ring-blue-100" },
  ISSUED: { label: "Fully allotted", variant: "success", accent: "from-emerald-600 to-teal-800", soft: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
};

export default function MaterialRequestDetailsModal({ request, onClose, onAllot }) {
  if (!request) return null;

  const items = Array.isArray(request.items) ? request.items : [];
  const meta = STATUS_META[request.status] || STATUS_META.PENDING;
  const completedLines = items.filter((item) => Number(item.remaining_quantity) <= 0).length;
  const outstandingLines = items.filter((item) => Number(item.remaining_quantity) > 0).length;
  const totalLines = items.length;
  const progress = totalLines ? Math.round((completedLines / totalLines) * 100) : 0;
  const canIssue = request.status !== "ISSUED" && outstandingLines > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Material request list"
      description="Review requested quantities and previous handovers before allotting more material."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Close</Button>
          {canIssue && (
            <Button
              type="button"
              size="lg"
              onClick={() => onAllot(request)}
              className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white hover:from-emerald-800 hover:to-teal-800"
            >
              <PackageCheck className="size-4" />
              Allot materials
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${meta.accent} p-[1px]`}>
          <div className="rounded-[15px] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ${meta.soft}`}>
                  <PackageOpen className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Request #{request.id}</p>
                  <h3 className="mt-1 break-words text-lg font-bold leading-snug text-slate-900">{request.product_name || "Product request"}</h3>
                  <p className="mt-1 text-xs text-slate-500">{request.order_number || `Order #${request.order_id}`} · {request.product_sku || "No SKU"}</p>
                </div>
              </div>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>

            {request.requested_product_quantity !== null && request.requested_product_quantity !== undefined && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Products requested</p>
                  <p className="mt-1 text-sm font-bold text-emerald-950">{fmtQty(request.requested_product_quantity)}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Products allotted</p>
                  <p className="mt-1 text-sm font-bold text-blue-950">{fmtQty(request.issued_product_quantity || 0)} / {fmtQty(request.requested_product_quantity)}</p>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <CalendarClock className="size-4 shrink-0 text-emerald-700" />
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Requested on</p><p className="mt-0.5 truncate text-xs font-semibold text-slate-800">{fmtDateTime(request.created_at)}</p></div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <UserRound className="size-4 shrink-0 text-blue-700" />
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Requested by</p><p className="mt-0.5 truncate text-xs font-semibold text-slate-800">{request.requested_by_name || "Production"}</p></div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600">Component lines fully allotted</span>
              <span className="font-bold tabular-nums text-slate-800">{completedLines} of {totalLines}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full bg-gradient-to-r ${meta.accent} transition-[width]`} style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {request.notes && (
          <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-3 text-sm text-amber-950">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Note from Production</p>
            <p className="mt-1 whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Requested components</h3>
            <p className="mt-0.5 text-xs text-slate-500">Compare the original request with what has already been handed over.</p>
          </div>
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold tabular-nums text-emerald-800">{items.length} lines</span>
        </div>

        {items.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(0,1fr)_76px_76px_76px] gap-2 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid sm:px-4">
              <span>Component</span><span className="text-right">Requested</span><span className="text-right">Handed over</span><span className="text-right">Remaining</span>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const remaining = Number(item.remaining_quantity || 0);
                const itemComplete = remaining <= 0;
                return (
                  <div key={item.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_76px_76px_76px] sm:items-center sm:gap-2 sm:px-4">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${itemComplete ? "bg-emerald-50 text-emerald-700" : Number(item.issued_quantity) > 0 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                        {itemComplete ? <BadgeCheck className="size-4" /> : <ClipboardList className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{item.sku || "No SKU"} · {item.unit}</p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-500 sm:hidden">
                          Requested {fmtQty(item.requested_quantity)} · Allotted {fmtQty(item.issued_quantity)} · Remaining {fmtQty(item.remaining_quantity)}
                        </p>
                      </div>
                    </div>
                    <span className="hidden text-right text-sm tabular-nums text-slate-700 sm:block">{fmtQty(item.requested_quantity)}</span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums text-emerald-700 sm:block">{fmtQty(item.issued_quantity)}</span>
                    <span className={`hidden text-right text-sm font-bold tabular-nums sm:block ${remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>{fmtQty(item.remaining_quantity)}</span>
                    <div className="flex items-center justify-between sm:hidden">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${itemComplete ? "bg-emerald-50 text-emerald-700" : Number(item.issued_quantity) > 0 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                        <span className="size-1.5 rounded-full bg-current" />{itemComplete ? "Complete" : Number(item.issued_quantity) > 0 ? "Partial" : "Waiting"}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">{fmtQty(item.remaining_quantity)} {item.unit} left</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <PackageOpen className="mx-auto size-7 text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No component lines found</p>
            <p className="mt-1 text-xs text-slate-500">Refresh requests or contact Production if you expected a material list.</p>
          </div>
        )}

        <div className="flex gap-2 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/60 px-3.5 py-3 text-xs leading-relaxed text-emerald-900">
          <PackageCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <p>Material stock was deducted when Operations approved the order. Confirming an allotment records the physical handover only; it does not deduct inventory again.</p>
        </div>
      </div>
    </Modal>
  );
}
