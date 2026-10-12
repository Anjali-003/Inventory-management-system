import { cn } from "@/lib/utils";

export function Segmented({ value, onChange, options, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[7px] bg-muted p-[3px]"
    >
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[11px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
            value === k
              ? "bg-card font-semibold text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
