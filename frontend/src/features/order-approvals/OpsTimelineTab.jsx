import { Check, Clock3, Download, X } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { downloadPurchaseList } from "@/features/purchasing/purchasingUtils";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { DECIDED_STATUSES, reviewOf, sumQty } from "@/features/marketing-orders/orderParts";

/*
  "Timeline" tab of the Operations Admin order drawer.
  Built only from what the order row already carries: created_by_name / created_at, sent_to_admin_at,
  approved_by_name / approved_at / approval_remarks, items, production_request and purchase_request
  (sent_at / sent_by_name when present). A step with no recorded time shows no time; nothing is invented.
*/

const MARK = {
  done: "bg-emerald-600 text-white",
  fail: "bg-red-600 text-white",
  wait: "border-2 border-primary bg-card text-primary",
};

const who = (name, at) => [name, at ? fmtDateTime(at) : ""].filter(Boolean).join(" · ");
const stamp = (at) => {
  const t = at ? new Date(String(at).replace(" ", "T")).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

function buildEvents(order) {
  const status = order.approval_status;
  const decided = DECIDED_STATUSES.includes(status);
  const rejected = status === "REJECTED";
  const { requested, approved } = reviewOf(order);
  const prod = order.production_request;
  const purch = order.purchase_request;
  const prodUnits = prod?.items?.length ? sumQty(prod.items) : 0;
  const events = [];

  events.push({
    key: "created",
    title: "Order created",
    state: "done",
    at: order.created_at,
    sub: who(order.created_by_name || "-", order.created_at),
    detail: `${fmtQty(requested)} units requested`,
  });

  if (status !== "DRAFT") {
    events.push({
      key: "sent",
      title: "Sent to Operations Admin",
      state: "done",
      at: order.sent_to_admin_at,
      sub: order.sent_to_admin_at ? fmtDateTime(order.sent_to_admin_at) : "",
    });
  }

  const rev = order.revision;
  if (rev) {
    const now = (rev.items || []).reduce((s, i) => s + Number(i.approved || 0), 0);
    const asked = (rev.items || []).reduce((s, i) => s + Number(i.requested || 0), 0);
    events.push({
      key: "revised",
      title: "Quantity revised",
      state: "done",
      at: order.revised_at,
      sub: who(order.revised_by_name || "-", order.revised_at),
      detail: `${fmtQty(now)} of ${fmtQty(asked)} units now, the rest saved for Marketing as ${rev.held_order_number || "a draft"}`,
      remarks: rev.remarks,
    });
  }
  if (order.revision_accepted_at) {
    events.push({
      key: "revision-accepted",
      title: "Marketing accepted the revised quantity",
      state: "done",
      at: order.revision_accepted_at,
      sub: who(order.revision_accepted_by_name || "-", order.revision_accepted_at),
    });
  }

  if (decided) {
    events.push({
      key: "decision",
      title: rejected ? "Rejected" : "Approved",
      state: rejected ? "fail" : "done",
      at: order.approved_at,
      sub: who(order.approved_by_name || "-", order.approved_at),
      detail: rejected ? "" : `${fmtQty(approved)} of ${fmtQty(requested)} units approved`,
      remarks: order.approval_remarks,
    });
  }

  if (!rejected && prod?.items?.length) {
    events.push({
      key: "production",
      title: "Sent to Production",
      state: "done",
      at: prod.sent_at,
      sub: who(prod.sent_by_name, prod.sent_at),
      detail: `${fmtQty(prodUnits)} of ${fmtQty(requested)} units`,
      lines: prod.items.map((i) => [i.name, fmtQty(i.quantity)]),
    });
  }

  if (!rejected && purch?.items?.length) {
    events.push({
      key: "purchase",
      title: "Shortage sent to Purchase",
      state: "done",
      at: purch.sent_at,
      sub: who(purch.sent_by_name, purch.sent_at),
      detail: `${purch.items.length} component${purch.items.length === 1 ? "" : "s"} short`,
      collapsible: true, // closed it previews the first 3 names; open it lists every component
      download: () => downloadPurchaseList(order, purch.items),
      lines: purch.items.map((i) => [i.name, `${fmtQty(i.quantity)}${i.unit ? ` ${i.unit}` : ""}`]),
    });
  }

  // Chronological: sort by recorded time; a step without a time keeps its place right after the step before it.
  let last = -Infinity;
  const keyed = events.map((e, i) => {
    const t = stamp(e.at);
    if (t !== null) last = t;
    return { e, t: t ?? last, i };
  });
  keyed.sort((a, b) => a.t - b.t || a.i - b.i);
  const ordered = keyed.map((k) => k.e);

  if (status === "PENDING_APPROVAL") {
    ordered.push({ key: "waiting", title: "Waiting for your decision", state: "wait" });
  }
  if (status === "QUANTITY_REVISED") {
    ordered.push({ key: "waiting", title: "Waiting for Marketing to accept the revised quantity", state: "wait" });
  }
  return ordered;
}

export default function OpsTimelineTab({ order }) {
  const events = buildEvents(order);
  return (
    <ol aria-label="Order timeline">
      {events.map((e, i) => {
        const lastRow = i === events.length - 1;
        return (
          <li key={e.key} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!lastRow && (
              <span
                aria-hidden
                className={cn("absolute start-[9px] top-5 h-[calc(100%-1.25rem)] w-px", e.state === "wait" ? "bg-border" : "bg-emerald-300")}
              />
            )}
            <span className={cn("relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", MARK[e.state])}>
              {e.state === "done" && <Check className="size-3" strokeWidth={3} aria-hidden />}
              {e.state === "fail" && <X className="size-3" strokeWidth={3} aria-hidden />}
              {e.state === "wait" && <Clock3 className="size-3" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              {(() => {
                const head = (
                  <>
                    <p className={cn("text-[13px] font-semibold leading-snug", e.state === "fail" && "text-destructive")}>{e.title}</p>
                    {e.sub && <p className="text-xs text-muted-foreground">{e.sub}</p>}
                    {e.detail && <p className="text-xs font-medium tabular-nums">{e.detail}</p>}
                  </>
                );
                const list = e.lines?.length > 0 && (
                  <ul className="mt-1 space-y-0.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs">
                    {e.lines.map(([name, qty], n) => (
                      <li key={`${name}-${n}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{name}</span>
                        <b className="shrink-0 tabular-nums">{qty}</b>
                      </li>
                    ))}
                  </ul>
                );
                if (!(e.collapsible && e.lines?.length > 0)) {
                  return (
                    <>
                      {head}
                      {list}
                    </>
                  );
                }
                return (
                  <Accordion
                    headerClassName="rounded-lg"
                    actions={
                      e.download && (
                        <Button type="button" size="sm" variant="ghost" aria-label="Download shortage list (Excel)" onClick={e.download}>
                          <Download /> Excel
                        </Button>
                      )
                    }
                    header={(open) => (
                      <>
                        {head}
                        {!open && (
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                            {e.lines.slice(0, 3).map(([name]) => name).join(", ")}
                            {e.lines.length > 3 && ` +${e.lines.length - 3} more`}
                          </p>
                        )}
                      </>
                    )}
                  >
                    {list}
                  </Accordion>
                );
              })()}
              {e.remarks && (
                <p
                  className={cn(
                    "mt-1 rounded-lg border px-2.5 py-1.5 text-xs leading-snug",
                    e.state === "fail" ? "border-destructive/20 bg-cf-red-soft text-destructive" : "bg-muted/60 text-foreground"
                  )}
                >
                  {e.remarks}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
