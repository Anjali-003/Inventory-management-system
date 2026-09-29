import { cn } from "../../lib/utils"

const field =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"

export const Input = ({ className, ...p }) => <input className={cn(field, className)} {...p} />
export const Select = ({ className, ...p }) => <select className={cn(field, "pr-8", className)} {...p} />
export const Label = ({ className, ...p }) => (
  <label className={cn("mb-1.5 block text-sm font-medium", className)} {...p} />
)
