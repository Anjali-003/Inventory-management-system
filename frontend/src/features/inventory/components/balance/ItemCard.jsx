import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

// One component (or one reason): the number is the point.
export function ItemCard({
  title,
  sub,
  value,
  unit,
  caption,
  valueClass,
  onClick,
  index = 0,
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index, 12) * 0.04,
        duration: 0.3,
        ease: "easeOut",
      }}
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-[10px] border bg-card p-3.5 text-left shadow-cf outline-none transition-all hover:-translate-y-px hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-xs font-semibold leading-snug">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-cf-faint">
            {sub}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-xl font-bold leading-none tracking-[-0.5px] tabular-nums",
              valueClass,
            )}
          >
            {value}
          </span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.5px] text-cf-faint">
            {caption || unit}
          </span>
        </span>
      </span>
      <span className="flex items-center justify-end gap-0.5 text-[11px] font-semibold text-primary">
        View entries{" "}
        <ChevronRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </motion.button>
  );
}
