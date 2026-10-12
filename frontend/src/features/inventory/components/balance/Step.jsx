import { BG, CHIP, TEXT } from "./balanceTheme";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/HistoryUI";
import { fmtQty } from "@/lib/stock";

const stepVariants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// One line of the working, numbered so each one can point back to the ones before it.
export function Step({ n, label, formula, caption, amount, op, tone, strong }) {
  const overlay = tone ? BG[tone] : strong ? "bg-cf-head" : "";
  return (
    <motion.li
      variants={stepVariants}
      className="relative flex min-h-[92px] items-center gap-4 px-5 py-4 transition-colors hover:bg-cf-head sm:px-[22px]"
    >
      {overlay && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0", overlay)}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-[13px] text-base font-bold ring-1 transition-transform duration-200",
          tone
            ? `${CHIP[tone]} ring-current/25`
            : "bg-slate-100 text-slate-600 ring-slate-200",
        )}
      >
        {n}
      </span>
      <div className="relative min-w-0 flex-1">
        <p
          className={cn(
            "text-[15px] leading-snug",
            strong ? "font-bold" : "font-semibold",
          )}
        >
          {label}
          {formula && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({formula})
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      </div>
      <p
        className={cn(
          "relative text-[27px] font-bold tabular-nums tracking-[-0.6px] sm:text-3xl",
          strong && "sm:text-[34px]",
          tone && TEXT[tone],
        )}
      >
        {op && (
          <span className="mr-1.5 font-normal text-muted-foreground">{op}</span>
        )}
        <CountUp value={amount} format={fmtQty} />
      </p>
    </motion.li>
  );
}
