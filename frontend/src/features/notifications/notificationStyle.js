import { Bell, BellRing, CalendarClock, CircleCheck, Info, PackageMinus, PackageOpen, TriangleAlert, Truck } from "lucide-react"

/*
  One look per severity, shared by the header bell, the toasts and the dashboard panels.
    info     something happened, nothing to do
    success  something you were waiting for went through
    warning  something changed that you should know about (e.g. a delivery date)
    action   you have to do something (issue components, accept a revised quantity ...)
*/
export const SEVERITY = {
  info: { icon: Info, label: "Info", tone: "text-cf-blue", soft: "bg-cf-blue-soft", bar: "bg-cf-blue" },
  success: { icon: CircleCheck, label: "Update", tone: "text-primary", soft: "bg-cf-green-soft", bar: "bg-primary" },
  warning: { icon: TriangleAlert, label: "Changed", tone: "text-warning", soft: "bg-cf-amber-soft", bar: "bg-warning" },
  action: { icon: BellRing, label: "Action needed", tone: "text-cf-violet", soft: "bg-cf-violet-soft", bar: "bg-cf-violet" },
}

// a more specific icon for the notification types we know; anything new falls back to its severity's icon
const TYPE_ICONS = {
  ISSUE_COMPONENTS: PackageOpen,
  PURCHASE_READY_FOR_STORE: Truck,
  QUANTITY_REVISED: PackageMinus,
  DELIVERY_DATE_CHANGED: CalendarClock,
  REVISION_ACCEPTED: CircleCheck,
}

export const severityOf = (n) => SEVERITY[n?.severity] || SEVERITY.info
export const iconOf = (n) => TYPE_ICONS[n?.type] || severityOf(n).icon || Bell
