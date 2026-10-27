import { ArrowRight, Check, Factory, Scale, ShoppingCart, X } from "lucide-react";
import { fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { hasLeftToSend, planTotals } from "./approvalParts";
import { productionBlockReason, purchaseBlockReason, rejectBlockReason, reviseBlockReason } from "./DecisionButtons";

/*
  Box at the top of the Stock check tab. One sentence on what the stock can do, then what the admin can do now, as
  cards that say what each one will DO with this order. Same names and rules as the drawer footer (DecisionButtons.jsx).
    The order waits:       Approve (the decision; Marketing is told) · Revise quantity · Reject
    The order is approved: Send list to Purchase · Send to Production
*/
const units = (n) => `${fmtQty(n)} unit${Number(n) === 1 ? "" : "s"}`;
const comps = (n) => `${n} component${n === 1 ? "" : "s"}`;

function summaryOf(order, plan) {
  const { ordered, canMake, remaining } = planTotals(plan);
  const toBuy = plan.shortages?.length || 0;
  const of = hasLeftToSend(order) ? "not in Production yet" : "ordered";
  if (plan.missing_bom?.length) {
    return { tone: "neutral", text: "The bill of materials is incomplete, so the stock cannot be checked yet. Complete the BOM first, or reject the order." };
  }
  if (canMake >= ordered) return { tone: "good", text: `The stock can build all ${units(ordered)} ${of} now.` };
  if (canMake === 0) return { tone: "bad", text: `Nothing can be built from the current stock (${units(ordered)} ${of}). ${comps(toBuy)} must be bought first.` };
  return { tone: "part", text: `The stock can build ${fmtQty(canMake)} of the ${units(ordered)} ${of} now. The other ${fmtQty(remaining)} need ${comps(toBuy)} that are short.` };
}

function waitingOptions(order, plan) {
  const bomMissing = plan.missing_bom?.length > 0;
  return [
    {
      kind: "approve",
      icon: Check,
      title: "Approve",
      text: "Accept the order and tell the Marketing Manager. Then send the lists to Purchase and Production from here.",
      blocked: null,
      recommended: !bomMissing,
    },
    {
      kind: "revise",
      icon: Scale,
      title: "Revise quantity",
      text: "Promise less than ordered. The rest goes back to Marketing as a separate draft. Marketing has to accept first.",
      blocked: reviseBlockReason(order, plan),
      recommended: false,
    },
    {
      kind: "reject",
      icon: X,
      title: "Reject",
      text: "Stop the order and tell Marketing why. Nothing is sent to Production or Purchase.",
      blocked: rejectBlockReason(order),
      recommended: bomMissing,
      danger: true,
    },
  ];
}

function approvedOptions(plan) {
  const { canMake, remaining } = planTotals(plan);
  const toBuy = plan.shortages?.length || 0;
  const purchaseWhy = purchaseBlockReason(plan);
  const productionWhy = productionBlockReason(plan);
  return [
    {
      kind: "purchase",
      icon: ShoppingCart,
      title: "Send list to Purchase",
      text: `The Purchase Manager buys ${comps(toBuy)} for the other ${units(remaining)}.`,
      blocked: purchaseWhy,
      recommended: !purchaseWhy && !!productionWhy,
    },
    {
      kind: "production",
      icon: Factory,
      title: "Send to Production",
      text: `The Production Manager builds ${units(canMake)} now. Their stock is deducted when you send.`,
      blocked: productionWhy,
      recommended: !productionWhy,
    },
  ];
}

const TONE = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  part: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-rose-200 bg-rose-50 text-rose-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
};

export default function DecisionGuide({ order, plan, onDecide }) {
  const approved = hasLeftToSend(order);
  const summary = summaryOf(order, plan);
  const options = approved ? approvedOptions(plan) : waitingOptions(order, plan);

  return (
    <section aria-labelledby="decision-guide-title" className="space-y-3">
      <div className={cn("rounded-xl border px-4 py-3", TONE[summary.tone])}>
        <h3 id="decision-guide-title" className="text-xs font-bold uppercase tracking-wide opacity-70">
          {approved ? "Approved · next: send the lists" : "Your decision"}
        </h3>
        <p className="mt-1 text-sm font-semibold leading-snug">{summary.text}</p>
      </div>

      {onDecide && (
        <ul className={cn("grid gap-2", approved ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <li key={o.kind}>
                <button
                  type="button"
                  disabled={!!o.blocked}
                  title={o.blocked || undefined}
                  onClick={() => onDecide(o.kind)}
                  className={cn(
                    "group flex h-full w-full flex-col rounded-xl border bg-card p-3 text-start outline-none transition-[border-color,box-shadow,transform] duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring/60 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_12px_24px_-16px_rgba(16,26,23,0.4)] enabled:active:translate-y-0",
                    o.recommended && !o.blocked ? "border-primary ring-1 ring-primary/30" : "border-[#E3E6EB]",
                    o.danger ? "enabled:hover:border-destructive" : "enabled:hover:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-55"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", o.danger ? "text-destructive" : "text-foreground")}>
                      <Icon className="size-4" /> {o.title}
                    </span>
                    {o.recommended && !o.blocked && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Recommended</span>
                    )}
                  </span>
                  <span className="mt-1.5 flex-1 text-xs leading-snug text-muted-foreground">{o.blocked || o.text}</span>
                  {!o.blocked && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      Start <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
