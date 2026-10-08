import { cn } from "../../lib/utils"

const field =
  "h-9 w-full rounded-[8px] border border-cf-line-strong bg-card px-3 text-[13px] outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 disabled:opacity-50"

export const Input = ({ className, ...p }) => <input className={cn(field, className)} {...p} />
export const Select = ({ className, ...p }) => <select className={cn(field, "pr-8", className)} {...p} />
export const Label = ({ className, ...p }) => (
  <label className={cn("mb-1.5 block text-[13px] font-semibold", className)} {...p} />
)
