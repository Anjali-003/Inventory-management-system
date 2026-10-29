/* eslint-disable react-refresh/only-export-components */
import { motion } from "motion/react"
import { CheckCircle2, ChevronRight, ClipboardList, FlaskConical, Loader2, PackageCheck, Send, ShoppingCart, Warehouse, XCircle } from "lucide-react"
import { CountUp } from "@/components/HistoryUI"
import { FigureTile, tintOf } from "@/components/PageKit"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { timeAgo } from "@/features/activity/time"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { purchaseFor } from "./purchasingUtils"
import { PurchaseForLinks } from "./PurchaseParts"

/*
  Building blocks for the Purchase Manager screens (dashboard, Purchase, Approved Orders and their popups).

  They are made the same way as the Marketing Manager screens: a gradient hero, one colour tile per stage,
  scrolling chips on a phone, cards on phones / tablets and tables from `lg` up, the same status pills, the same
  spring motion. The Marketing kit (mktKit / mktMotion) is reused as it is; nothing in it changes.

  Every stage has ONE colour family, used everywhere (tiles, chips, pills, progress bars):
    Order placed = amber   Received = sky   With IQC = violet   With store = cyan   In stock = emerald   Rejected = rose
  `s` holds full Tailwind class strings (kept whole, so Tailwind can see them).
*/

/* ------------------------------------------------------------ purchase stages */

export const PURCHASE_STAGES = [
  {
    status: "ORDER_PLACED", label: "Order placed", short: "Placed", icon: ShoppingCart, hint: "Waiting for the goods",
    bar: "bg-gradient-to-r from-amber-700 to-orange-800", dot: "bg-amber-500",
    s: { grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30", pill: "bg-amber-50 text-amber-800 ring-amber-200", ink: "text-amber-700" },
  },
  {
    status: "RECEIVED", label: "Received", short: "Received", icon: PackageCheck, hint: "Not sent to IQC yet",
    bar: "bg-gradient-to-r from-sky-700 to-blue-800", dot: "bg-sky-500",
    s: { grad: "from-sky-700 to-blue-800", glow: "shadow-blue-500/30", pill: "bg-sky-50 text-sky-800 ring-sky-200", ink: "text-sky-700" },
  },
  {
    status: "PENDING_IQC", label: "With IQC", short: "IQC", icon: FlaskConical, hint: "Waiting for inspection",
    bar: "bg-gradient-to-r from-violet-600 to-purple-800", dot: "bg-violet-500",
    s: { grad: "from-violet-600 to-purple-800", glow: "shadow-purple-500/30", pill: "bg-violet-50 text-violet-800 ring-violet-200", ink: "text-violet-700" },
  },
  {
    status: "PENDING_STORE", label: "With store", short: "Store", icon: Warehouse, hint: "Approved, waiting to be accepted",
    bar: "bg-gradient-to-r from-cyan-700 to-teal-800", dot: "bg-cyan-500",
    s: { grad: "from-cyan-700 to-teal-800", glow: "shadow-teal-500/30", pill: "bg-cyan-50 text-cyan-800 ring-cyan-200", ink: "text-cyan-700" },
  },
  {
    status: "STORED", label: "In stock", short: "In stock", icon: CheckCircle2, hint: "Accepted by the store",
    bar: "bg-gradient-to-r from-emerald-700 to-emerald-800", dot: "bg-emerald-600",
    s: { grad: "from-emerald-700 to-emerald-800", glow: "shadow-emerald-600/30", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", ink: "text-emerald-700" },
  },
  {
    status: "REJECTED", label: "Rejected", short: "Rejected", icon: XCircle, hint: "Rejected by IQC",
    bar: "bg-gradient-to-r from-rose-600 to-red-800", dot: "bg-rose-500",
    s: { grad: "from-rose-600 to-red-800", glow: "shadow-red-500/30", pill: "bg-rose-50 text-rose-800 ring-rose-200", ink: "text-rose-700" },
  },
]

/* The "everything" filter: not a real status, so it is kept out of PURCHASE_STAGES. */
export const PURCHASE_ALL = {
  status: "ALL", label: "All purchases", short: "All", icon: ClipboardList, hint: "Everything you ordered",
  bar: "bg-gradient-to-r from-slate-600 to-slate-800", dot: "bg-slate-500",
  s: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30", pill: "bg-slate-100 text-slate-800 ring-slate-200", ink: "text-slate-700" },
}

export const purchaseStageOf = (status) => PURCHASE_STAGES.find((s) => s.status === status)
export const isPurchaseStatus = (value) => PURCHASE_STAGES.some((s) => s.status === value)

/** Link to the Purchase page with a filter already applied: purchaseHref("RECEIVED"). */
export function purchaseHref(status, extra = {}) {
  const p = new URLSearchParams()
  if (status) p.set("status", status)
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, v)
  const s = p.toString()
  return `/purchase${s ? `?${s}` : ""}`
}

export function countPurchases(list = []) {
  const counts = { total: list.length }
  for (const s of PURCHASE_STAGES) counts[s.status] = 0
  for (const p of list) if (p.status in counts) counts[p.status] += 1
  return counts
}

/* ------------------------------------------------- approved orders: what is left to buy */

export const openLinesOf = (order) => (order.purchase_request?.items || []).filter((c) => c.purchase_order_id == null)

/** TO_ORDER: components still to buy.  ORDERED: every component is on a purchase.  NONE: nothing was short. */
export function buyState(order) {
  const items = order.purchase_request?.items || []
  if (items.length === 0) return "NONE"
  return items.some((c) => c.purchase_order_id == null) ? "TO_ORDER" : "ORDERED"
}

export const BUY_STAGES = [
  {
    status: "TO_ORDER", label: "To order", short: "To order", icon: ShoppingCart, hint: "Components still to buy",
    bar: "bg-gradient-to-r from-amber-700 to-orange-800", dot: "bg-amber-500",
    s: { grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30", pill: "bg-amber-50 text-amber-800 ring-amber-200", ink: "text-amber-700" },
  },
  {
    status: "ORDERED", label: "All ordered", short: "Ordered", icon: CheckCircle2, hint: "Purchases placed",
    bar: "bg-gradient-to-r from-emerald-700 to-emerald-800", dot: "bg-emerald-600",
    s: { grad: "from-emerald-700 to-emerald-800", glow: "shadow-emerald-600/30", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", ink: "text-emerald-700" },
  },
  {
    status: "NONE", label: "Nothing to buy", short: "In stock", icon: PackageCheck, hint: "Everything was in stock",
    bar: "bg-gradient-to-r from-sky-700 to-blue-800", dot: "bg-sky-500",
    s: { grad: "from-sky-700 to-blue-800", glow: "shadow-blue-500/30", pill: "bg-sky-50 text-sky-800 ring-sky-200", ink: "text-sky-700" },
  },
]

export const BUY_ALL = {
  status: "ALL", label: "All approved", short: "All", icon: ClipboardList, hint: "Approved by the Operations Admin",
  bar: "bg-gradient-to-r from-slate-600 to-slate-800", dot: "bg-slate-500",
  s: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30", pill: "bg-slate-100 text-slate-800 ring-slate-200", ink: "text-slate-700" },
}

export const buyStageOf = (status) => BUY_STAGES.find((s) => s.status === status)
export const isBuyState = (value) => BUY_STAGES.some((s) => s.status === value)

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset"

/* Soft colour + icon + word for a purchase status. `short` uses the one-word label for tight spaces. */
export function PurchaseStatusPill({ value, short, className }) {
  const stage = purchaseStageOf(value)
  if (!stage) return <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600", className)}>{value || "Unknown"}</span>
  const Icon = stage.icon
  return (
    <span className={cn(PILL, stage.s.pill, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {short ? stage.short : stage.label}
    </span>
  )
}

/* "3 to order" / "All ordered" / "Nothing to buy" for one approved order. */
export function BuyStatePill({ order, className }) {
  const state = buyState(order)
  const stage = buyStageOf(state)
  const Icon = stage.icon
  const open = openLinesOf(order).length
  return (
    <span className={cn(PILL, stage.s.pill, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {state === "TO_ORDER" ? `${open} to order` : stage.label}
    </span>
  )
}

/* -------------------------------------------------------------------- tiles */

/** The grid of figures. Children are <PurchaseTile/>; they rise in one after another. Pass the column classes. */
export function PurchaseTileGrid({ children, className }) {
  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="hidden" animate="show" className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}>
      {children}
    </motion.div>
  )
}

/**
 * One big figure, the same tile as the Marketing one. `stage` is any object with { label, hint, icon, s: { grad, glow } }.
 * Give it `to` (a link) or `onClick`. `toggle` makes it a filter button (`active` = the chosen one);
 * `solid` fills it with the stage colour all the time.
 */
export function PurchaseTile({ stage, value, loading, active, to, onClick, toggle, className }) {
  return (
    <FigureTile
      icon={stage.icon}
      label={stage.label}
      hint={stage.hint}
      tint={tintOf(stage)}
      value={<CountUp value={value} />}
      loading={loading}
      active={active}
      to={to}
      onClick={onClick}
      toggle={!!toggle}
      className={className}
    />
  )
}

/* ------------------------------------------------------------------ progress */

/* [label, state] for the four steps of a purchase. state: done | current | todo | fail */
export function purchaseSteps(status) {
  switch (status) {
    case "RECEIVED":
    case "PENDING_IQC":
      return [["Ordered", "done"], ["Received", "done"], ["IQC", "current"], ["Store", "todo"]]
    case "PENDING_STORE":
      return [["Ordered", "done"], ["Received", "done"], ["IQC", "done"], ["Store", "current"]]
    case "STORED":
      return [["Ordered", "done"], ["Received", "done"], ["IQC", "done"], ["Store", "done"]]
    case "REJECTED":
      return [["Ordered", "done"], ["Received", "done"], ["IQC", "fail"], ["Store", "todo"]]
    default:
      return [["Ordered", "done"], ["Received", "current"], ["IQC", "todo"], ["Store", "todo"]]
  }
}

const FILL = {
  done: "bg-gradient-to-r from-emerald-700 to-emerald-800",
  fail: "bg-gradient-to-r from-rose-600 to-red-800",
}

/* The four steps as a labelled bar that fills in: ordered, received, inspected by IQC, accepted by the store. */
export function PurchaseSteps({ status, className }) {
  const steps = purchaseSteps(status)
  const stage = purchaseStageOf(status)
  return (
    <div role="img" aria-label={steps.map(([l, s]) => `${l}: ${s}`).join(", ")} className={cn("grid grid-cols-4 gap-1.5", className)}>
      {steps.map(([label, state], i) => (
        <div key={label} className="min-w-0">
          <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200/80">
            <motion.span
              className={cn("block h-full origin-left rounded-full", state === "current" ? stage?.bar : FILL[state])}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: state === "todo" ? 0 : state === "current" ? 0.5 : 1 }}
              transition={{ ...SPRING_SOFT, delay: 0.08 * i }}
            />
          </span>
          <span className={cn("mt-1.5 block truncate text-[11px] font-medium", state === "todo" ? "text-cf-faint" : state === "fail" ? "text-destructive" : "text-muted-foreground")}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- actions */

/*
  The one button that moves a purchase on: "Received" for a placed order, "Send to IQC" for a received one.
  Nothing for any other status, or when the page is read-only. `stop` keeps a click in a table row from also opening it.
*/
export function StepButton({ purchase: p, editable, busy, onReceive, onSendIqc, size = "md", stop, className }) {
  if (!editable) return null
  const isPlaced = p.status === "ORDER_PLACED"
  const isReceived = p.status === "RECEIVED"
  if (!isPlaced && !isReceived) return null
  const run = isPlaced ? onReceive : onSendIqc
  return (
    <MktBtn
      variant="primary"
      size={size}
      disabled={busy}
      className={className}
      onClick={(e) => { if (stop) e.stopPropagation(); run(p) }}
      aria-label={`${isPlaced ? "Mark received" : "Send to IQC"}: ${p.po_number}`}
    >
      {busy ? <Loader2 className="animate-spin" /> : isPlaced ? <PackageCheck /> : <Send />}
      {isPlaced ? "Received" : "Send to IQC"}
    </MktBtn>
  )
}

/* -------------------------------------------------------------------- cards */

/* The `<motion.ul>` the cards live in: they rise in one after another. */
export const PurchaseCardList = ({ children, className }) => (
  <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className={cn("grid gap-3", className)}>
    {children}
  </motion.ul>
)

/*
  One purchase as a card (phones and tablets). The whole body opens the popup; the button under it
  (Received / Send to IQC) sits above the tap area and only does its own job.
*/
export function PurchaseCard({ purchase: p, editable, busy, onOpen, onReceive, onSendIqc }) {
  const lines = p.totals?.lines ?? p.items?.length ?? 0
  const canStep = editable && (p.status === "ORDER_PLACED" || p.status === "RECEIVED")
  return (
    <motion.li variants={rise} className="relative rounded-xl border border-border bg-card transition-colors duration-200 hover:border-lp-rule">
      <button type="button" onClick={onOpen} aria-label={`Open ${p.po_number}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
      <div className="pointer-events-none relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all text-[15px] font-semibold leading-snug tabular-nums">{p.po_number}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.supplier}{purchaseFor(p) && <> · <PurchaseForLinks purchase={p} /></>}</p>
          </div>
          <PurchaseStatusPill value={p.status} short className="shrink-0" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{lines} item{lines === 1 ? "" : "s"} · {fmtQty(p.totals?.ordered ?? 0)} ordered</p>
            <p className="truncate text-xs text-muted-foreground">{p.created_by_name ? `${p.created_by_name} · ` : ""}{timeAgo(p.created_at)}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <PurchaseSteps status={p.status} className="mt-4" />
      </div>

      {canStep && (
        <div className="relative border-t border-dashed p-3">
          <StepButton purchase={p} editable={editable} busy={busy} onReceive={onReceive} onSendIqc={onSendIqc} className="w-full" />
        </div>
      )}
    </motion.li>
  )
}
