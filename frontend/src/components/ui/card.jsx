import { cn } from "../../lib/utils"

export const Card = ({ className, ...p }) => (
  <div className={cn("rounded-md border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]", className)} {...p} />
)
export const CardHeader = ({ className, ...p }) => (
  <div className={cn("flex items-start justify-between gap-4 border-b px-5 py-3.5", className)} {...p} />
)
export const CardTitle = ({ className, ...p }) => (
  <h2 className={cn("text-sm font-semibold leading-none", className)} {...p} />
)
export const CardDescription = ({ className, ...p }) => (
  <p className={cn("mt-1.5 text-sm text-muted-foreground", className)} {...p} />
)
export const CardContent = ({ className, ...p }) => <div className={cn("px-5 py-4", className)} {...p} />
