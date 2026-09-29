import { AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Skeleton } from "./ui/skeleton"

export function Notice({ tone = "error", title, children }) {
  const ok = tone === "success"
  const Icon = ok ? CheckCircle2 : AlertCircle
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        ok ? "border-success/25 bg-success/10 text-success" : "border-destructive/25 bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <p className={title ? "mt-0.5 opacity-90" : ""}>{children}</p>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export const TableSkeleton = ({ rows = 5 }) => (
  <div className="space-y-3 p-5">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
  </div>
)

const ORDER_STATUS = {
  PENDING: ["warning", "Pending"],
  MATERIAL_SHORTAGE: ["danger", "Material shortage"],
  READY_FOR_PRODUCTION: ["success", "Ready for production"],
  IN_PRODUCTION: ["info", "In production"],
  COMPLETED: ["neutral", "Completed"],
}

export function OrderStatus({ status }) {
  const [variant, label] = ORDER_STATUS[status] ?? [
    "neutral",
    String(status ?? "Unknown").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
  ]
  return <Badge variant={variant}>{label}</Badge>
}
