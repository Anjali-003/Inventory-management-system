import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Clock, PackageSearch, ShoppingCart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback"
import { timeAgo } from "@/features/activity/time"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { shortageOf } from "./DepartmentOverview"
import OrderShortageDrawer from "./OrderShortageDrawer"

/*
  Urgent Purchase Requirements.
  Approved customer orders that still have components to buy, nearest delivery date first (overdue on top,
  "no date" at the bottom). Each order shows WHAT has to be bought right in the row, so nothing needs opening
  just to see the list. The drawer is only for raising the PO.
*/

const VISIBLE = 5 // orders shown before "Show all"
const CHIPS = 4 // components shown per order before "+N more"

export function getDeliveryMeta(order) {
  const edd = order.estimated_delivery_date
  if (!edd) {
    return {
      category: "NO_DATE",
      daysDiff: null,
      label: "No date set",
      tone: "bg-slate-100 text-slate-700 ring-slate-200",
      badgeVariant: "neutral",
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(String(edd).replace(" ", "T"))
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const days = Math.abs(diffDays)
    return {
      category: "OVERDUE",
      daysDiff: diffDays,
      label: `Overdue by ${days} ${days === 1 ? "day" : "days"}`,
      tone: "bg-rose-100 text-rose-800 ring-rose-300 font-bold",
      badgeVariant: "danger",
    }
  }
  if (diffDays === 0) {
    return {
      category: "DUE_3",
      daysDiff: 0,
      label: "Due Today",
      tone: "bg-rose-100 text-rose-900 ring-rose-300 font-bold",
      badgeVariant: "danger",
    }
  }
  if (diffDays === 1) {
    return {
      category: "DUE_3",
      daysDiff: 1,
      label: "Due Tomorrow",
      tone: "bg-amber-100 text-amber-900 ring-amber-300 font-semibold",
      badgeVariant: "warning",
    }
  }
  if (diffDays <= 3) {
    return {
      category: "DUE_3",
      daysDiff: diffDays,
      label: `Due in ${diffDays} days`,
      tone: "bg-amber-50 text-amber-900 ring-amber-300 font-semibold",
      badgeVariant: "warning",
    }
  }
  if (diffDays <= 7) {
    return {
      category: "DUE_7",
      daysDiff: diffDays,
      label: `Due in ${diffDays} days (${edd})`,
      tone: "bg-yellow-50 text-yellow-900 ring-yellow-300 font-medium",
      badgeVariant: "warning",
    }
  }
  return {
    category: "LATER",
    daysDiff: diffDays,
    label: `Due ${edd}`,
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
    badgeVariant: "info",
  }
}


const plural = (n, s) => `${n} ${s}${n === 1 ? "" : "s"}`
const dueTime = (o) => (o.estimated_delivery_date ? new Date(String(o.estimated_delivery_date).replace(" ", "T")).getTime() : Infinity)
const isHot = (meta) => meta.category === "OVERDUE" || meta.category === "DUE_3"

function ComponentChips({ lines }) {
  const shown = lines.slice(0, CHIPS)
  const rest = lines.length - shown.length
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((c) => (
        <li key={c.component_id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs">
          <span className="truncate font-medium">{c.name}</span>
          <span className="shrink-0 font-bold tabular-nums text-destructive">{fmtQty(c.quantity)}{c.unit ? ` ${c.unit}` : ""}</span>
        </li>
      ))}
      {rest > 0 && <li className="inline-flex items-center rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground">+{rest} more</li>}
    </ul>
  )
}

export default function UrgentPurchaseSection({ orders = [], canRaise = true }) {
  const [selected, setSelected] = useState(null)
  const [showAll, setShowAll] = useState(false)

  // Approved orders with something still to buy, nearest delivery first.
  const needs = useMemo(
    () =>
      orders
        .filter((o) => shortageOf(o).length > 0)
        .sort((a, b) => dueTime(a) - dueTime(b) || a.id - b.id),
    [orders]
  )

  const shown = showAll ? needs : needs.slice(0, VISIBLE)
  const hot = useMemo(() => needs.filter((o) => isHot(getDeliveryMeta(o))).length, [needs])

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg font-bold">Urgent Purchase Requirements</CardTitle>
          {needs.length > 0 && <Badge variant="warning" className="font-semibold">{plural(needs.length, "order")} need components</Badge>}
          {hot > 0 && <Badge variant="danger" className="font-semibold">{hot} due in 3 days or less</Badge>}
        </div>
        <CardDescription>Nearest delivery date first. Buy what is listed for the orders at the top.</CardDescription>
      </CardHeader>

      {needs.length === 0 ? (
        <div className="p-8">
          <EmptyState icon={PackageSearch} title="No orders need purchase">
            All approved customer orders have components in stock or already on order.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="divide-y border-t">
            {shown.map((o) => {
              const meta = getDeliveryMeta(o)
              const lines = shortageOf(o)
              return (
                <li key={o.id} className={cn("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4", isHot(meta) && "border-s-4 border-s-rose-400")}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button type="button" onClick={() => setSelected(o)} className="text-sm font-bold tabular-nums text-primary hover:underline">
                        {o.order_number}
                      </button>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", meta.tone)}>
                        <Clock className="size-3 shrink-0" aria-hidden />
                        {meta.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(o.approved_at)}</span>
                    </div>
                    <ComponentChips lines={lines} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    <ShoppingCart className="size-3.5" aria-hidden /> Raise PO
                  </button>
                </li>
              )
            })}
          </ul>

          {needs.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-semibold text-primary hover:bg-muted/40"
            >
              {showAll ? <>Show less <ChevronUp className="size-3.5" aria-hidden /></> : <>Show all {needs.length} orders <ChevronDown className="size-3.5" aria-hidden /></>}
            </button>
          )}
        </>
      )}

      {selected && <OrderShortageDrawer order={selected} onClose={() => setSelected(null)} canRaisePurchase={canRaise} />}
    </Card>
  )
}
