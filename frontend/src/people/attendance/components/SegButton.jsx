import { Loader2 } from "lucide-react"

/* ------------------------------------------------------------------ */
/* Daily sheet                                                         */
/* ------------------------------------------------------------------ */
export function SegButton({ label, reason, disabled, spinning, onClick }) {
  return (
    <span title={disabled && reason ? reason : undefined} className="flex border-r last:border-r-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex h-7 items-center gap-1 bg-background px-2.5 text-xs font-medium text-foreground/85 outline-none transition-colors hover:bg-muted focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:bg-muted/40 disabled:text-muted-foreground/60"
      >
        {spinning && <Loader2 className="size-3 animate-spin" />}
        {label}
      </button>
    </span>
  )
}
