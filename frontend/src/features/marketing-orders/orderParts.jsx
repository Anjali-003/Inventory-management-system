/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { Check, CheckCircle2, FilePen, Hourglass, X, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  Small pieces shared by the Marketing Manager dashboard and the Marketing Orders page.

  The orders page keeps its filter in the URL (?status=APPROVED&q=...&order=12&new=1), so every stat on the
  dashboard can simply link to ordersHref("APPROVED") and the page opens already filtered.
*/

const EASE = [0.22, 1, 0.36, 1]

/* One entry per approval stage, in the order an order moves through them. */
export const STAGES = [
  { status: "DRAFT", label: "Drafts", icon: FilePen, tone: "amber", dotTone: "neutral", bar: "bg-slate-400", dot: "bg-slate-400", hint: "Not sent yet" },
  { status: "PENDING_APPROVAL", label: "Waiting for approval", icon: Hourglass, tone: "blue", dotTone: "warning", bar: "bg-sky-500", dot: "bg-sky-500", hint: "With Operations Admin" },
  { status: "APPROVED", label: "Approved", icon: CheckCircle2, tone: "green", dotTone: "success", bar: "bg-emerald-600", dot: "bg-emerald-600", hint: "Sent on to purchase" },
  { status: "REJECTED", label: "Rejected", icon: XCircle, tone: "red", dotTone: "danger", bar: "bg-rose-500", dot: "bg-rose-500", hint: "See the remarks" },
]

export const stageOf = (status) => STAGES.find((s) => s.status === status)
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

/* One bar split by stage. Each segment and each legend entry is a link to the page with that filter on. */
export function OrderPipeline({ counts, loading }) {
  const [hover, setHover] = useState(null)

  if (loading) {
    return (
      <div className="space-y-4 px-5 py-5">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STAGES.map((s) => <Skeleton key={s.status} className="h-12" />)}</div>
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
    <div className="px-5 py-5">
      {counts.total === 0 ? (
        <div className="h-3 rounded-full bg-muted" aria-hidden />
      ) : (
        <motion.div
          className="flex h-3 origin-left gap-1"
          role="list"
          aria-label="Orders by stage"
          initial={{ scaleX: 0.15, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {STAGES.filter((s) => counts[s.status] > 0).map((s) => (
            <Link
              key={s.status}
              role="listitem"
              to={ordersHref(s.status)}
              aria-label={`${s.label}: ${plural(counts[s.status], "order")}`}
              style={{ flexGrow: counts[s.status] }}
              className={cn(
                "block min-w-3 basis-0 rounded-full outline-none transition-[opacity,transform] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
                s.bar,
                hover && hover !== s.status && "opacity-30"
              )}
              {...hoverProps(s.status)}
            />
          ))}
        </motion.div>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s) => (
          <li key={s.status}>
            <Link
              to={ordersHref(s.status)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
                hover && hover !== s.status && "opacity-60"
              )}
              {...hoverProps(s.status)}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-xs text-muted-foreground">{s.label}</span>
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
    case "APPROVED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Approved", "done"]]
    case "REJECTED":
      return [["Created", "done"], ["Sent to admin", "done"], ["Rejected", "fail"]]
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

/* Three dots joined by a line: where this order is on its way to a decision. */
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

const MARK = {
  done: "bg-primary text-primary-foreground",
  current: "border-2 border-primary bg-card text-primary",
  todo: "border-2 border-border bg-card text-transparent",
  fail: "bg-destructive text-white",
}

/* Vertical timeline for the order popup. There is no "sent at" time in the data, so none is shown. */
export function OrderTimeline({ order }) {
  const status = order.approval_status
  const steps = orderSteps(status)
  const decided = status === "APPROVED" || status === "REJECTED"

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
        : status === "PENDING_APPROVAL"
          ? "Waiting for the Operations Admin"
          : "Starts after you send the order",
      remarks: decided ? order.approval_remarks : "",
    },
  ]

  return (
    <ol className="space-y-0">
      {rows.map((r, i) => {
        const state = steps[i][1]
        const last = i === rows.length - 1
        return (
          <li key={r.title} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className={cn("absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px", state === "done" ? "bg-primary/40" : "bg-border")} />}
            <span className={cn("relative z-10 grid size-6 shrink-0 place-items-center rounded-full", MARK[state])}>
              {state === "done" && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              {state === "fail" && <X className="size-3.5" strokeWidth={3} aria-hidden />}
              {state === "current" && <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", state === "todo" && "text-muted-foreground", state === "fail" && "text-destructive")}>{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.sub}</p>
              {r.remarks && (
                <p className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", state === "fail" ? "border-destructive/20 bg-cf-red-soft text-destructive" : "bg-muted/60 text-foreground")}>
                  {r.remarks}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
