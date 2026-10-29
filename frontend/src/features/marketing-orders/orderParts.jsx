/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { Check, CheckCircle2, ClipboardList, FilePen, Hourglass, Scale, X, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { SPRING, SPRING_SOFT } from "./mktMotion"

/*
  Small pieces shared by the Marketing Manager dashboard and the Marketing Orders page.

  The orders page keeps its filter in the URL (?status=APPROVED&q=...&order=12&new=1), so every stat on the
  dashboard can simply link to ordersHref("APPROVED") and the page opens already filtered.

  Every stage has ONE colour family, used everywhere (tiles, chips, pills, bars, timeline):
    Draft = amber   Waiting = sky   Approved = emerald   Rejected = rose   Cancelled = slate   All = violet
  Rejected = the Operations Admin said no. Cancelled = Marketing did not accept the reduced quantity.
  `s` holds the full Tailwind class strings (kept whole, so Tailwind can see them).
*/

/* One entry per approval stage, in the order an order moves through them. */
export const STAGES = [
  {
    status: "DRAFT", label: "Drafts", short: "Draft", icon: FilePen, tone: "neutral", dotTone: "neutral",
    bar: "bg-gradient-to-r from-slate-600 to-slate-800", dot: "bg-slate-400", hint: "Not sent to Operations Admin yet",
    s: {
      grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30", soft: "bg-slate-50 ring-slate-200/70",
      pill: "bg-slate-100 text-slate-700 ring-slate-200", ink: "text-slate-600",
    },
  },
  {
    status: "PENDING_APPROVAL", label: "Waiting for approval", short: "Pending", icon: Hourglass, tone: "amber", dotTone: "warning",
    bar: "bg-gradient-to-r from-amber-700 to-orange-800", dot: "bg-amber-500", hint: "With the Operations Admin",
    s: {
      grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30", soft: "bg-amber-50 ring-amber-200/70",
      pill: "bg-amber-50 text-amber-800 ring-amber-200", ink: "text-amber-700",
    },
  },
  {
    status: "APPROVED", label: "Approved", short: "Approved", icon: CheckCircle2, tone: "green", dotTone: "success",
    bar: "bg-gradient-to-r from-emerald-700 to-emerald-800", dot: "bg-emerald-600", hint: "The Operations Admin Agreed to Make the Order",
    s: {
      grad: "from-emerald-700 to-emerald-800", glow: "shadow-emerald-600/30", soft: "bg-emerald-50 ring-emerald-200/70",
      pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", ink: "text-emerald-700",
    },
  },
  {
    status: "REJECTED", label: "Rejected", short: "Rejected", icon: XCircle, tone: "red", dotTone: "danger",
    bar: "bg-gradient-to-r from-rose-600 to-red-800", dot: "bg-rose-500", hint: "See the remarks",
    s: {
      grad: "from-rose-600 to-red-800", glow: "shadow-red-500/30", soft: "bg-rose-50 ring-rose-200/70",
      pill: "bg-rose-50 text-rose-800 ring-rose-200", ink: "text-rose-700",
    },
  },
  {
    status: "CANCELLED", label: "Cancelled", short: "Cancelled", icon: XCircle, tone: "slate", dotTone: "neutral",
    bar: "bg-gradient-to-r from-slate-500 to-slate-700", dot: "bg-slate-400",
    s: {
      grad: "from-slate-500 to-slate-700", glow: "shadow-slate-500/30", soft: "bg-slate-50 ring-slate-200/70",
      pill: "bg-slate-100 text-slate-700 ring-slate-200", ink: "text-slate-600",
    },
  },
]

/* The "everything" filter: not a real status, so it is kept out of STAGES. */
export const ALL_STAGE = {
  status: "ALL", label: "All orders", short: "All", icon: ClipboardList, hint: "",
  bar: "bg-gradient-to-r from-slate-600 to-slate-800", dot: "bg-slate-500",
  s: {
    grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30", soft: "bg-slate-50 ring-slate-200/70",
    pill: "bg-slate-100 text-slate-700 ring-slate-200", ink: "text-slate-600",
  },
}

/*
  The Operations Admin reduced the quantity and waits for Marketing to accept it. Kept out of STAGES (no tile / filter
  of its own, the grids stay four wide), but pills, cards and the drawer find it through stageOf().
*/
export const REVISED_STAGE = {
  status: "QUANTITY_REVISED", label: "Quantity revised", short: "Qty revised", icon: Scale, tone: "amber", dotTone: "warning",
  bar: "bg-gradient-to-r from-amber-700 to-orange-800", dot: "bg-amber-500", hint: "Waiting for Marketing to accept the reduced quantity",
  s: {
    grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30", soft: "bg-amber-50 ring-amber-200/70",
    pill: "bg-amber-50 text-amber-800 ring-amber-200", ink: "text-amber-700",
  },
}

/* An approved order cancelled before production (its components went back into stock). No tile of its own either. */
export const CANCELLED_STAGE = {
  ...STAGES.find((s) => s.status === "REJECTED"),
  status: "CANCELLED", label: "Cancelled", short: "Cancelled", tone: "neutral", dotTone: "neutral",
  bar: "bg-gradient-to-r from-slate-600 to-slate-800", dot: "bg-slate-400", hint: "Cancelled after approval: see the remarks",
  s: {
    grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30", soft: "bg-slate-50 ring-slate-200/70",
    pill: "bg-slate-100 text-slate-700 ring-slate-200", ink: "text-slate-600",
  },
}

export const stageOf = (status) => STAGES.find((s) => s.status === status)
  ?? (status === REVISED_STAGE.status ? REVISED_STAGE : status === CANCELLED_STAGE.status ? CANCELLED_STAGE : undefined)
export const isStatus = (value) => STAGES.some((s) => s.status === value)

/** Link to the Marketing Orders page with a filter already applied: ordersHref("DRAFT"), ordersHref(null, { new: 1 }). */
export function ordersHref(status, extra = {}) {
  const p = new URLSearchParams()
  if (status) p.set("status", status)
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, v)
  const s = p.toString()
  return `/marketing-orders${s ? `?${s}` : ""}`
}

export function countByStatus(orders = []) {
  const counts = { total: orders.length }
  for (const s of STAGES) counts[s.status] = 0
  for (const o of orders) if (o.approval_status in counts) counts[o.approval_status] += 1
  return counts
}

export const newestFirst = (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

/* ------------------------------------------------------------ pipeline bar */

/* One bar split by stage. Each segment and each legend entry is a link to the page with that filter on.
   `stages` and `hrefFor` default to the Marketing ones; the Operations Admin dashboard passes its own. */
export function OrderPipeline({ counts, loading, stages = STAGES, hrefFor = ordersHref }) {
  const [hover, setHover] = useState(null)

  if (loading) {
    return (
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stages.map((s) => <Skeleton key={s.status} className="h-12" />)}</div>
      </div>
    )
  }

  const hoverProps = (status) => ({
    onMouseEnter: () => setHover(status),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(status),
    onBlur: () => setHover(null),
  })

  return (
    <div className="@container px-4 py-5 sm:px-5">
      {counts.total === 0 ? (
        <div className="h-3.5 rounded-full bg-muted" aria-hidden />
      ) : (
        <motion.div
          className="flex h-3.5 origin-left gap-1 rtl:origin-right"
          role="list"
          aria-label="Orders by stage"
          initial={{ scaleX: 0.15, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={SPRING_SOFT}
        >
          {stages.filter((s) => counts[s.status] > 0).map((s) => (
            <Link
              key={s.status}
              role="listitem"
              to={hrefFor(s.status)}
              aria-label={`${s.label}: ${plural(counts[s.status], "order")}`}
              style={{ flexGrow: counts[s.status] }}
              className={cn(
                "block min-w-3 basis-0 rounded-full outline-none transition-[opacity,transform,filter] duration-200 hover:-translate-y-px hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
                s.bar,
                hover && hover !== s.status && "opacity-30"
              )}
              {...hoverProps(s.status)}
            />
          ))}
        </motion.div>
      )}

      <ul className={cn("mt-4 grid grid-cols-2 gap-2", stages.length === 3 ? "@2xl:grid-cols-3" : "@2xl:grid-cols-4")}>
        {stages.map((s) => (
          <li key={s.status}>
            <Link
              to={hrefFor(s.status)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 outline-none transition-[background-color,opacity,transform] duration-150 hover:bg-muted active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60",
                hover && hover !== s.status && "opacity-60"
              )}
              {...hoverProps(s.status)}
            >
              <span className={cn("mt-[3px] size-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
              <span className="min-w-0">
                <span className="block break-words text-xs leading-snug text-muted-foreground">{s.label}</span>
                <span className="block text-sm font-bold tabular-nums">{counts[s.status]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------- progress + timeline */

/* [label, state] for the three steps of an order. state: done | current | todo | fail */
export function orderSteps(status) {
  switch (status) {
    case "PENDING_APPROVAL":
      return [["Created", "done"], ["Sent to admin", "done"], ["Decision", "current"]]
    case "QUANTITY_REVISED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Qty revised", "current"]]
    case "APPROVED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Approved", "done"]]
    case "REJECTED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Rejected", "fail"]]
    case "CANCELLED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Cancelled", "fail"]]
    default:
      return [["Created", "done"], ["Sent to admin", "current"], ["Decision", "todo"]]
  }
}

const DOT_STATE = {
  done: "border-primary bg-primary",
  current: "border-primary bg-card motion-safe:animate-pulse",
  todo: "border-border bg-card",
  fail: "border-destructive bg-destructive",
}

/* Three dots joined by a line: where this order is on its way to a decision. (Used in the table.) */
export function OrderProgress({ status, className }) {
  const steps = orderSteps(status)
  return (
    <span role="img" aria-label={steps.map(([l, s]) => `${l}: ${s}`).join(", ")} className={cn("flex items-center", className)}>
      {steps.map(([label, state], i) => (
        <span key={label} className="flex items-center">
          {i > 0 && <span className={cn("h-px w-4", steps[i - 1][1] === "done" && state !== "todo" ? "bg-primary" : "bg-border")} />}
          <span title={label} className={cn("size-2.5 rounded-full border-2", DOT_STATE[state])} />
        </span>
      ))}
    </span>
  )
}

const FILL = {
  done: "bg-gradient-to-r from-emerald-700 to-emerald-800",
  fail: "bg-gradient-to-r from-rose-600 to-red-800",
}

/* The same three steps as a labelled bar that fills in. (Used on the phone cards.) */
export function OrderSteps({ status, className }) {
  const steps = orderSteps(status)
  const stage = stageOf(status)
  return (
    <div role="img" aria-label={steps.map(([l, s]) => `${l}: ${s}`).join(", ")} className={cn("grid grid-cols-3 gap-1.5", className)}>
      {steps.map(([label, state], i) => (
        <div key={label} className="min-w-0">
          <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200/80">
            <motion.span
              className={cn("block h-full origin-left rounded-full rtl:origin-right", state === "current" ? stage?.bar : FILL[state])}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: state === "todo" ? 0 : state === "current" ? 0.5 : 1 }}
              transition={{ ...SPRING_SOFT, delay: 0.08 * i }}
            />
          </span>
          <span className={cn("mt-1.5 block text-[10px] font-medium leading-tight", state === "todo" ? "text-cf-faint" : state === "fail" ? "text-destructive" : "text-muted-foreground")}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

const MARK = {
  done: "bg-gradient-to-br from-emerald-700 to-emerald-800 text-white shadow-sm",
  current: "border-2 border-primary bg-card text-primary",
  todo: "border-2 border-border bg-card text-transparent",
  fail: "bg-gradient-to-br from-rose-600 to-red-800 text-white shadow-sm",
}

/* Vertical timeline for the order popup. There is no "sent at" time in the data, so none is shown. */
export function OrderTimeline({ order }) {
  const status = order.approval_status
  const steps = orderSteps(status)
  const decided = ["APPROVED", "REJECTED"].includes(status)

  const rows = [
    {
      title: "Order created",
      sub: `${order.created_by_name || "-"} · ${fmtDateTime(order.created_at)}`,
    },
    {
      title: "Sent to Operations Admin",
      sub: status === "DRAFT" ? "Not sent yet. Send it when it is ready." : "Handed over for approval",
    },
    {
      title: steps[2][0],
      sub: decided
        ? `${order.approved_by_name || "-"} · ${fmtDateTime(order.approved_at)}`
        : status === "QUANTITY_REVISED"
          ? "Quantity reduced by the Operations Admin, waiting for Marketing to accept"
          : status === "PENDING_APPROVAL"
          ? "Waiting for the Operations Admin"
          : "Starts after you send the order",
      remarks: decided ? order.approval_remarks : "",
    },
  ]

  return (
    <ol>
      {rows.map((r, i) => {
        const state = steps[i][1]
        const last = i === rows.length - 1
        return (
          <motion.li
            key={r.title}
            className="relative flex gap-3.5 pb-5 last:pb-0"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING, delay: 0.06 * i }}
          >
            {!last && <span aria-hidden className={cn("absolute start-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 rounded-full", state === "done" ? "bg-emerald-300" : "bg-border")} />}
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", MARK[state])}>
              {state === "done" && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {state === "fail" && <X className="size-4" strokeWidth={3} aria-hidden />}
              {state === "current" && <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", state === "todo" && "text-muted-foreground", state === "fail" && "text-destructive")}>{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.sub}</p>
              {r.remarks && (
                <p className={cn("mt-2 rounded-xl border px-3 py-2 text-sm leading-snug", state === "fail" ? "border-destructive/20 bg-cf-red-soft text-destructive" : "bg-muted/60 text-foreground")}>
                  {r.remarks}
                </p>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------ review numbers (table + drawer) */

export const DECIDED_STATUSES = ["APPROVED", "REJECTED"]

/* The customer an order is for, the first thing the reader looks for. Older orders may have none. */
export function CustomerName({ order, className }) {
  return order?.customer_name
    ? <p className={cn("truncate text-sm font-semibold text-foreground", className)}>{order.customer_name}</p>
    : <p className={cn("truncate text-xs text-muted-foreground", className)}>No customer</p>
}

/* ₹12,40,000 (Indian grouping, whole rupees) */
export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

/**
 * What the order is worth at the price list: units x each product's selling price (totals.value from
 * the backend). An estimate: the bill sets the real rate. Says so when a product has no price yet.
 */
export function OrderValue({ order, className }) {
  const t = order?.totals || {}
  const lines = order?.items?.length || 0
  // a product without a price is not worth ₹0: its value is unknown, so it is never shown as ₹0
  if (t.unpriced && t.unpriced === lines) {
    return <span className={cn("text-xs text-warning", className)}>Price not set yet</span>
  }
  return (
    <span className={cn("text-xs text-muted-foreground", className)} title="At the agreed rates (the price list where none was agreed)">
      <b className="font-semibold tabular-nums text-foreground">{rupees(t.value)}</b>
      {t.unpriced > 0 && <span className="text-warning"> · {t.unpriced === 1 ? "1 product has" : `${t.unpriced} products have`} no price yet, not counted</span>}
    </span>
  )
}

/*
  Who closed a CANCELLED order, when and why. Two ways an order is cancelled:
    Marketing said no to a reduced quantity (who / when kept in the revision), or
    Operations cancelled an approved order before production (the reason is in approval_remarks).
  null for any other order.
*/
export const declinedOf = (o) => {
  if (o?.approval_status !== "CANCELLED") return null
  if (o.revision?.declined_at || o.revision?.declined_by_name) {
    return { who: "Marketing", by: o.revision.declined_by_name || "Marketing", at: o.revision.declined_at || null, why: "Did not accept the reduced quantity" }
  }
  return { who: "Operations", by: "Operations", at: null, why: o.approval_remarks ? `Cancelled after approval: ${o.approval_remarks}` : "Cancelled after approval" }
}
export const sumQty = (lines = []) => lines.reduce((s, l) => s + Number(l.quantity || 0), 0)

/**
 * How far the making of an APPROVED order is, in one line: what Marketing (and anyone reading the order) sees of
 * Operations' own work. null for an order that is not approved.
 */
export function MakingLine({ order, className }) {
  if (order?.approval_status !== "APPROVED") return null
  const total = sumQty(order.items)
  const sent = sumQty(order.production_request?.items || [])
  const left = Number(order.left_to_send || 0)
  const text = left === 0
    ? `Production has been asked to make all ${fmtQty(total)} units.`
    : sent === 0
      ? `Not sent to Production yet: waiting for components (${fmtQty(total)} units).`
      : `Production has been asked to make ${fmtQty(sent)} of ${fmtQty(total)} units · ${fmtQty(left)} waiting for components.`
  return <p className={cn("text-xs font-medium", left === 0 ? "text-success" : "text-warning", className)}>{text}</p>
}

/*
  What the Operations Admin decided, in numbers. There is no partial approval: an approved order is approved as a
  whole (approved = requested) and a rejected one has 0 approved.
  What the stock could cover at that moment goes to production: see sentToProduction().
*/
export function reviewOf(o) {
  const requested = o.totals?.quantity ?? sumQty(o.items)
  const approved = o.approval_status === "APPROVED" ? requested : 0
  return { requested, approved, ratio: requested > 0 ? Math.min(approved / requested, 1) : 0 }
}

/* Approved quantity of ONE product line. null while the order has no decision yet. */
export function approvedFor(o, line) {
  if (!DECIDED_STATUSES.includes(o.approval_status)) return null
  return o.approval_status === "APPROVED" ? Number(line.quantity) : 0
}

/* Units of ONE product line the admin sent to production when approving. null when nothing was sent. */
export function sentToProduction(o, line) {
  if (!o.production_request) return null
  const hit = o.production_request.items.find((i) => i.product_id === line.product_id)
  return hit ? Number(hit.quantity) : 0
}

/* ------------------------------------------------------------ order drawer tabs */

export const DRAWER_TABS = [
  { id: "overview", label: "Order" },
  { id: "items", label: "Products" },
  { id: "timeline", label: "Timeline" },
]
export const isDrawerTab = (value) => DRAWER_TABS.some((t) => t.id === value)
