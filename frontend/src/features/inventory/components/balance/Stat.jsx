import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

// A summary figure. With onClick it opens a pop-up with the detail behind the number.
export function Stat({ dot, label, value, sub, onClick }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden />
          {label}
        </span>
        {onClick && (
          <ChevronRight
            className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden
          />
        )}
      </span>
      <span className="mt-1.5 block text-xl font-bold leading-none tracking-[-0.5px] tabular-nums">
        {value}
      </span>
      <span className="mt-1.5 block text-[11px] text-muted-foreground">
        {sub}
      </span>
    </>
  );
  const base =
    "block w-full rounded-[10px] border bg-card px-3.5 py-3 text-left shadow-cf";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "group outline-none transition-all hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}
