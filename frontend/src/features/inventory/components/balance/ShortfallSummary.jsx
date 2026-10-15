import { AlertTriangle } from "lucide-react";
import { CountUp, Pill } from "@/components/HistoryUI";
import { fmtQty } from "@/lib/stock";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Stat } from "./Stat";

export default function ShortfallSummary({
  balance,
  explained,
  inProduction,
  missing,
  open,
  segments,
  segTotal,
  status,
  unexplained,
}) {
  return (
    <div className="grid border-b lg:grid-cols-[minmax(15rem,1fr)_2.2fr] lg:divide-x">
      <div className="flex flex-col justify-center gap-2 bg-cf-red-soft/60 px-[18px] py-5">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.6px] text-muted-foreground">
          <span className="grid size-6 place-items-center rounded-full bg-cf-red-soft text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden />
          </span>
          Total shortfall
        </span>
        <p className="text-[32px] font-bold leading-none tracking-[-0.8px] tabular-nums text-destructive">
          <CountUp value={missing} />
        </p>
        <p className="text-[11px] text-muted-foreground">
          Expected{" "}
          <span className="font-medium text-foreground tabular-nums">
            {fmtQty(balance.expected_remaining)}
          </span>{" "}
          · In stock{" "}
          <span className="font-medium text-foreground tabular-nums">
            {fmtQty(balance.actual_on_hand)}
          </span>
        </p>
        <div>
          <Pill tone={status.tone} dot>
            {status.pill}
          </Pill>
        </div>
      </div>

      <div className="px-[18px] py-5">
        <p className="text-[13px] font-bold">Where the shortfall went</p>
        <div
          className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={segments
            .map((s) => `${s.label}: ${fmtQty(s.value)}`)
            .join(", ")}
        >
          {segTotal > 0 &&
            segments.map((s) =>
              s.value > 0 ? (
                <motion.span
                  key={s.key}
                  title={`${s.label}: ${fmtQty(s.value)}`}
                  className={cn("h-full", s.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.value / segTotal) * 100}%` }}
                  transition={{
                    duration: 0.9,
                    ease: [0.22, 1, 0.36, 1],
                    delay: 0.15,
                  }}
                />
              ) : null,
            )}
        </div>
        <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
          <Stat
            dot="bg-muted-foreground/45"
            label="Waiting in production"
            value={fmtQty(inProduction)}
            sub="Used, not finished yet. Not missing"
            onClick={() => open({ kind: "production" })}
          />
          <Stat
            dot="bg-primary"
            label="Taken out with a reason"
            value={fmtQty(explained)}
            sub="Stock-outs and count adjustments"
            onClick={() => open({ kind: "entries", all: true })}
          />
          <Stat
            dot="bg-destructive"
            label="Unexplained"
            value={fmtQty(Math.abs(unexplained))}
            sub={status.sub}
            onClick={() => document.getElementById("shortfall-list")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      </div>
    </div>
  );
}
