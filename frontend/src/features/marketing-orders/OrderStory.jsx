import { Check, Clock3, Factory, FilePen, Scale, Send, ShoppingCart, X } from "lucide-react"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { OrderValue, sumQty } from "./orderParts"

/*
  THE story of one order between Marketing and the Operations Admin, the same for both of them (the Timeline tab of
  both order drawers). Written for someone who never used the app: who did what, when, and how many units, in plain
  sentences, with the role on every step. Read from order.events (backend order_events), oldest first.

  On top, four numbers that say where the units are: ordered · promised · in Production · waiting for parts.
*/

const ROLE = {
  MARKETING_MANAGER: { label: "Marketing", chip: "bg-sky-50 text-sky-800 ring-sky-200" },
  OPERATIONS_ADMIN: { label: "Operations", chip: "bg-violet-50 text-violet-800 ring-violet-200" },
  SUPER_ADMIN: { label: "Super Admin", chip: "bg-slate-100 text-slate-700 ring-slate-200" },
}
const roleOf = (role) => ROLE[role] || { label: "Team", chip: "bg-slate-100 text-slate-700 ring-slate-200" }
const units = (n) => `${fmtQty(n)} unit${Number(n) === 1 ? "" : "s"}`

/* kind -> icon, colour and the sentence the step says */
function sentenceOf(e) {
  const d = e.detail || {}
  switch (e.kind) {
    case "SENT":
      return { icon: Send, tone: "done", text: `Sent the order to Operations: ${units(e.quantity)}.` }
    case "REVISED":
      return {
        icon: Scale, tone: "warn",
        text: `Can make only ${fmtQty(e.quantity)} of the ${units(d.requested)}. Asked Marketing to agree. The other ${fmtQty((d.requested || 0) - e.quantity)} went back to Marketing as draft ${d.held_order_number || ""}.`,
        quote: d.remarks,
      }
    case "REVISION_ACCEPTED":
      return { icon: Check, tone: "done", text: `Agreed to ${units(e.quantity)}. The order went back to Operations.` }
    case "REVISION_DECLINED":
      return { icon: X, tone: "fail", text: `Did not agree to ${units(e.quantity)}. The order was cancelled.` }
    case "APPROVED":
      return { icon: Check, tone: "done", text: `Approved the order: ${units(e.quantity)}.`, quote: d.remarks }
    case "REJECTED":
      return { icon: X, tone: "fail", text: "Rejected the order.", quote: d.remarks }
    case "SENT_TO_PURCHASE":
      return { icon: ShoppingCart, tone: "done", text: `Asked Purchase to buy ${d.components} component${d.components === 1 ? "" : "s"} for ${units(e.quantity)}.` }
    case "SENT_TO_PRODUCTION":
      return {
        icon: Factory, tone: "done",
        text: `Sent ${units(e.quantity)} to Production. Their parts were taken from stock.`,
        lines: (d.lines || []).length > 1 ? d.lines : null,
      }
    default:
      return { icon: FilePen, tone: "done", text: e.kind }
  }
}

/* Where the order stands now, in one sentence (the last line of the story). */
function nowOf(order) {
  const left = Number(order.left_to_send || 0)
  switch (order.approval_status) {
    case "DRAFT": return { tone: "wait", text: "Draft: Marketing has not sent it yet." }
    case "PENDING_APPROVAL": return { tone: "wait", text: "Waiting for Operations to approve, revise or reject it." }
    case "QUANTITY_REVISED": return { tone: "wait", text: "Waiting for Marketing to agree to the new quantity, or not." }
    case "REJECTED": return { tone: "fail", text: "Closed: rejected by Operations." }
    case "CANCELLED": return { tone: "fail", text: "Closed: cancelled, Marketing did not agree to the new quantity." }
    case "APPROVED":
      return left > 0
        ? { tone: "wait", text: `${units(left)} not in Production yet: waiting until their parts are in stock.` }
        : { tone: "done", text: "Every unit is in Production." }
    default: return null
  }
}

const DOT = {
  done: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  fail: "bg-rose-600 text-white",
  wait: "border-2 border-primary bg-card text-primary",
}

function Figures({ order }) {
  const sent = sumQty(order.production_request?.items || [])
  const promised = sumQty(order.items)
  const ordered = order.revision?.items?.length ? order.revision.items.reduce((s, i) => s + Number(i.requested || 0), 0) : promised
  const approved = order.approval_status === "APPROVED"
  const cells = [
    ["Ordered by Marketing", ordered, ""],
    ["Promised by Operations", ["PENDING_APPROVAL", "DRAFT"].includes(order.approval_status) ? null : promised, ""],
    ["In Production", approved ? sent : null, "text-success"],
    ["Waiting for parts", approved ? Number(order.left_to_send || 0) : null, "text-warning"],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(([label, value, tone]) => (
        <div key={label} className="rounded-xl border bg-card px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-0.5 text-lg font-extrabold tabular-nums", value ? tone : "text-muted-foreground")}>{value === null ? "-" : fmtQty(value)}</p>
        </div>
      ))}
    </div>
  )
}

export default function OrderStory({ order }) {
  const events = order.events || []
  const now = nowOf(order)

  return (
    <div className="space-y-5">
      <Figures order={order} />
      <p className="text-sm text-muted-foreground">Order value: <OrderValue order={order} className="text-sm" /></p>

      <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-3.5 before:w-px before:bg-border">
        <li className="relative flex gap-3">
          <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", DOT.done)}><FilePen className="size-3.5" /></span>
          <div className="min-w-0 pt-0.5">
            <p className="text-xs text-muted-foreground">
              <span className={cn("me-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset", ROLE.MARKETING_MANAGER.chip)}>Marketing</span>
              {order.created_by_name} · {fmtDateTime(order.created_at)}
            </p>
            <p className="mt-1 text-sm">Wrote the order: {order.items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")}.</p>
          </div>
        </li>

        {events.map((e, i) => {
          const s = sentenceOf(e)
          const r = roleOf(e.by_role)
          const Icon = s.icon
          return (
            <li key={i} className="relative flex gap-3">
              <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", DOT[s.tone])}><Icon className="size-3.5" /></span>
              <div className="min-w-0 pt-0.5">
                <p className="text-xs text-muted-foreground">
                  <span className={cn("me-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset", r.chip)}>{r.label}</span>
                  {e.by_name || "-"} · {fmtDateTime(e.at)}
                </p>
                <p className="mt-1 text-sm">{s.text}</p>
                {s.lines && (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {s.lines.map((l) => <li key={l.name}>{l.name} × {fmtQty(l.quantity)}</li>)}
                  </ul>
                )}
                {s.quote && <p className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm italic">“{s.quote}”</p>}
              </div>
            </li>
          )
        })}

        {now && (
          <li className="relative flex gap-3">
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", DOT[now.tone])}>
              {now.tone === "wait" ? <Clock3 className="size-3.5" /> : now.tone === "fail" ? <X className="size-3.5" /> : <Check className="size-3.5" />}
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Now</p>
              <p className="text-sm font-semibold">{now.text}</p>
            </div>
          </li>
        )}
      </ol>
    </div>
  )
}
