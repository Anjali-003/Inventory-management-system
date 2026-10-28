import { cn } from "../../lib/utils"
import { SURFACE } from "@/components/PageKit"

// White card: thin border, soft corners, almost no shadow (the surface of components/PageKit, same as the home page).
export const Card = ({ className, ...p }) => (
  <div className={cn(SURFACE, "text-card-foreground", className)} {...p} />
)
export const CardHeader = ({ className, ...p }) => (
  <div className={cn("flex min-h-[64px] items-start justify-between gap-4 rounded-t-2xl border-b border-lp-line px-5 py-4", className)} {...p} />
)
export const CardTitle = ({ className, ...p }) => (
  <h2 className={cn("flex items-center gap-2.5 font-lp-head text-base font-semibold leading-tight tracking-tight text-lp-ink", className)} {...p} />
)
export const CardDescription = ({ className, ...p }) => (
  <p className={cn("mt-1 text-xs leading-relaxed text-lp-muted", className)} {...p} />
)
export const CardContent = ({ className, ...p }) => <div className={cn("px-5 py-4", className)} {...p} />
