import { ArrowRight, PackageCheck, Scale, X } from "lucide-react";
import { fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { planTotals } from "./approvalParts";
import { rejectBlockReason, reviseBlockReason } from "./DecisionButtons";

/*
  "Your decision" box at the top of the Stock check tab, for an order that waits for the Operations Admin.
  One sentence on what the stock can do, then the three decisions as cards that say what each one will DO with
  this particular order, with the one that fits best marked "Recommended". A card starts that decision directly.
  Same decisions, names and rules as the drawer footer (DecisionButtons.jsx).
*/
const units = (n) => `${fmtQty(n)} unit${Number(n) === 1 ? "" : "s"}`;
const comps = (n) => `${n} component${n === 1 ? "" : "s"}`;

function summaryOf(plan) {
  const { ordered, canMake, remaining } = planTotals(plan);
  const toBuy = plan.shortages?.length || 0;
  if (plan.missing_bom?.length) {
    return { tone: "neutral", text: "The bill of materials is incomplete, so the stock cannot be checked yet. Complete the BOM first, or reject the order." };
  }
  if (canMake >= ordered) {
    return { tone: "good", text: `Everything can be built from stock now: all ${units(ordered)}.` };
  }
  if (canMake === 0) {
    return { tone: "bad", text: `Nothing can be built from the current stock. ${comps(toBuy)} must be bought first.` };
  }
  return { tone: "part", text: `Stock can build ${fmtQty(canMake)} of ${units(ordered)} now. ${units(remaining)} need ${comps(toBuy)} that are short.` };
}

function optionsOf(order, plan) {
  const { ordered, canMake, remaining } = planTotals(plan);
  const toBuy = plan.shortages?.length || 0;
  const bomMissing = plan.missing_bom?.length > 0;

  const send = {
    kind: "plan",
    icon: PackageCheck,
    title: "Check stock & send",
    text: bomMissing
      ? "Not possible until the BOM is complete."
      : canMake >= ordered
        ? `Production builds all ${units(ordered)}. Nothing to buy.`
        : canMake === 0
          ? `Purchase buys ${comps(toBuy)}. Production starts once they are in stock.`
          : `Production starts ${units(canMake)} now. Purchase buys ${comps(toBuy)} for the other ${fmtQty(remaining)}.`,
    blocked: bomMissing ? "Complete the bill of materials first." : null,
    recommended: !bomMissing, // the normal path: build what the stock covers, buy the rest
  };
  const revise = {
    kind: "revise",
    icon: Scale,
    title: "Revise quantity",
    text: canMake < ordered
      ? `Make only ${units(canMake)} now. The other ${fmtQty(remaining)} go back to Marketing as a separate draft. Marketing has to accept first.`
      : "Make less than ordered now (for example when the line is full). The rest goes back to Marketing as a separate draft.",
    blocked: reviseBlockReason(order, plan),
    recommended: false,
  };
  const reject = {
    kind: "reject",
    icon: X,
    title: "Reject",
    text: "Stop the order and tell Marketing why. Nothing is sent to Production or Purchase.",
    blocked: rejectBlockReason(order),
    recommended: bomMissing,
    danger: true,
  };
  return [send, revise, reject];
}

const TONE = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  part: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-rose-200 bg-rose-50 text-rose-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
};

export default function DecisionGuide({ order, plan, onDecide }) {
  const summary = summaryOf(plan);
  const options = optionsOf(order, plan);

  return (
    <section aria-labelledby="decision-guide-title" className="space-y-3">
      <div className={cn("rounded-xl border px-4 py-3", TONE[summary.tone])}>
        <h3 id="decision-guide-title" className="text-xs font-bold uppercase tracking-wide opacity-70">Your decision</h3>
        <p className="mt-1 text-sm font-semibold leading-snug">{summary.text}</p>
      </div>

      {onDecide && (
        <ul className="grid gap-2 sm:grid-cols-3">
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
                    o.recommended ? "border-primary ring-1 ring-primary/30" : "border-[#E3E6EB]",
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
