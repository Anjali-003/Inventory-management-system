import { cn } from "../../lib/utils"

// White card: thin border, 14px corners, very soft shadow (same surface as the Inventory History panels).
export const Card = ({ className, ...p }) => (
  <div className={cn("rounded-[14px] border border-[#dce5e0]/90 bg-card text-card-foreground shadow-[0_1px_2px_rgba(22,34,30,0.035),0_10px_28px_rgba(22,34,30,0.045)]", className)} {...p} />
)
export const CardHeader = ({ className, ...p }) => (
  <div className={cn("flex min-h-[64px] items-start justify-between gap-4 rounded-t-[14px] border-b bg-gradient-to-r from-slate-50/90 via-white to-white px-5 py-4", className)} {...p} />
)
export const CardTitle = ({ className, ...p }) => (
  <h2 className={cn("flex items-center gap-2.5 text-[14px] font-bold leading-none tracking-[-0.2px] before:h-4 before:w-[3px] before:shrink-0 before:rounded-full before:bg-gradient-to-b before:from-emerald-400 before:to-primary", className)} {...p} />
)
export const CardDescription = ({ className, ...p }) => (
  <p className={cn("mt-1.5 pl-[13px] text-xs leading-relaxed text-muted-foreground", className)} {...p} />
)
export const CardContent = ({ className, ...p }) => <div className={cn("px-5 py-4", className)} {...p} />
