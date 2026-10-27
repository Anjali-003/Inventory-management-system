import {
  BadgeCheck, Bell, BellRing, CalendarClock, CircleCheck, CircleX, ClipboardCheck, ClipboardList, Factory, Info, PackageCheck,
  PackageMinus, PackageOpen, Receipt, RotateCcw, ShoppingCart, TestTube, TriangleAlert, Truck, Warehouse, Wrench,
} from "lucide-react"

/*
  One look per severity, shared by the header bell, the toasts and the dashboard panels. Same colour language as
  the order statuses: green done, amber waiting for a decision, red problem, blue information.
    info     something happened, nothing to do
    success  something you were waiting for went through
    warning  something changed that you should know about (e.g. a delivery date)
    action   you have to do something (issue components, accept a revised quantity ...)
*/
export const SEVERITY = {
  info: { icon: Info, label: "Info", tone: "text-cf-blue", soft: "bg-cf-blue-soft", bar: "bg-cf-blue" },
  success: { icon: CircleCheck, label: "Update", tone: "text-success", soft: "bg-cf-green-soft", bar: "bg-success" },
  warning: { icon: TriangleAlert, label: "Changed", tone: "text-warning", soft: "bg-cf-amber-soft", bar: "bg-warning" },
  action: { icon: BellRing, label: "Action needed", tone: "text-warning", soft: "bg-cf-amber-soft", bar: "bg-warning" },
}

// a more specific icon for the notification types we know; anything new falls back to its severity's icon
// (in the order of the workflow: marketing -> operations -> purchase -> IQC -> store -> production -> QC & FG -> marketing)
const TYPE_ICONS = {
  ORDER_SENT: ClipboardList,
  ORDER_APPROVED: CircleCheck,
  ORDER_REJECTED: CircleX,
  QUANTITY_REVISED: PackageMinus,
  REVISION_ACCEPTED: CircleCheck,
  REVISION_DECLINED: CircleX,
  DELIVERY_DATE_CHANGED: CalendarClock,
  PRODUCTION_ASSIGNED: Factory,
  PURCHASE_REQUIRED: ShoppingCart,
  PURCHASE_SENT_TO_IQC: ClipboardCheck,
  IQC_RESULT: ClipboardCheck,
  PURCHASE_READY_FOR_STORE: Truck,
  PURCHASE_STORED: Warehouse,
  ISSUE_COMPONENTS: PackageOpen,
  MATERIAL_REQUESTED: PackageOpen,
  MATERIAL_ISSUED: PackageCheck,
  BATCH_READY_FOR_QC: TestTube,
  QC_PASSED: BadgeCheck,
  QC_FAILED: Wrench,
  REWORK_SUBMITTED: RotateCcw,
  ORDER_DISPATCHED: Receipt,
}

export const severityOf = (n) => SEVERITY[n?.severity] || SEVERITY.info
export const iconOf = (n) => TYPE_ICONS[n?.type] || severityOf(n).icon || Bell
