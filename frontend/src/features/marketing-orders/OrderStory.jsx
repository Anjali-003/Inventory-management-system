import { Check, Clock3, Factory, FilePen, Handshake, Scale, Send, ShoppingCart, X } from "lucide-react"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { MakingLine, OrderValue, sumQty } from "./orderParts"

/*
  THE story of one order, in two parts that are never mixed:

    1. Order & agreement   Marketing <-> Operations: what was ordered for the customer, what Operations promised,
                           whether Marketing agreed, the decision. The same for both roles.
    2. Making it           Operations' own work: the list to Purchase, each send to Production (stock taken).
                           Operations sees every step; Marketing sees one line ("500 of 800 given to Production ...").

  Written for someone who never used the app: who did what, when, and how many units, in plain sentences, with the
  role on every step. Read from order.events (backend order_events), oldest first.
  audience: "marketing" | "operations"
*/

const AGREEMENT = new Set(["SENT", "REVISED", "REVISION_ACCEPTED", "REVISION_DECLINED", "APPROVED", "REJECTED"])

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
        text: `Promised ${fmtQty(e.quantity)} of the ${units(d.requested)} and asked Marketing to agree. The other ${fmtQty((d.requested || 0) - e.quantity)} went back to Marketing as draft ${d.held_order_number || ""}.`,
        quote: d.remarks,
      }
    case "REVISION_ACCEPTED":
      return { icon: Check, tone: "done", text: `Agreed to ${units(e.quantity)}. The order went back to Operations.` }
    case "REVISION_DECLINED":
      return { icon: X, tone: "fail", text: `Did not agree to ${units(e.quantity)}. The order was cancelled.` }
    case "APPROVED":
      return { icon: Check, tone: "done", text: `Approved the order: ${units(e.quantity)} will be made.`, quote: d.remarks }
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

/* Where the agreement stands now (part 1). */
function agreementNow(order) {
  switch (order.approval_status) {
    case "DRAFT": return { tone: "wait", text: "Draft: Marketing has not sent it yet." }
    case "PENDING_APPROVAL": return { tone: "wait", text: "Waiting for Operations to approve, revise or reject it." }
    case "QUANTITY_REVISED": return { tone: "wait", text: "Waiting for Marketing to agree to the promised quantity, or not." }
    case "REJECTED": return { tone: "fail", text: "Closed: rejected by Operations." }
    case "CANCELLED":
      return order.revision?.declined_at
        ? { tone: "fail", text: "Closed: cancelled, Marketing did not agree to the promised quantity." }
        : { tone: "fail", text: `Closed: cancelled by Operations after approval${order.approval_remarks ? ` (${order.approval_remarks})` : ""}.` }
    case "APPROVED": return { tone: "done", text: `Agreed: ${units(sumQty(order.items))} will be made.` }
    default: return null
  }
}

/* Where the making stands now (part 2, Operations). */
function makingNow(order) {
  const left = Number(order.left_to_send || 0)
  const sent = sumQty(order.production_request?.items || [])
  if (left === 0) return { tone: "done", text: `Every unit has been given to Production to build (${units(sent)}).` }
  return { tone: "wait", text: `${units(left)} not given to Production yet: waiting until their parts are in stock.` }
}

const DOT = {
  done: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  fail: "bg-rose-600 text-white",
  wait: "border-2 border-primary bg-card text-primary",
}

function Figures({ cells }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map(([label, value, tone]) => (
        <div key={label} className="rounded-xl border bg-card px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-0.5 text-lg font-extrabold tabular-nums", value ? tone : "text-muted-foreground")}>{value === null ? "-" : fmtQty(value)}</p>
        </div>
      ))}
    </div>
  )
}

function Step({ role, name, at, icon: Icon, tone, children }) {
  const r = roleOf(role)
  return (
    <li className="relative flex gap-3">
      <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", DOT[tone])}><Icon className="size-3.5" /></span>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs text-muted-foreground">
          <span className={cn("me-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset", r.chip)}>{r.label}</span>
          {name || "-"} · {fmtDateTime(at)}
        </p>
        {children}
      </div>
    </li>
  )
}

function EventStep({ e }) {
  const s = sentenceOf(e)
  return (
    <Step role={e.by_role} name={e.by_name} at={e.at} icon={s.icon} tone={s.tone}>
      <p className="mt-1 text-sm">{s.text}</p>
      {s.lines && (
        <ul className="mt-1 text-xs text-muted-foreground">
          {s.lines.map((l) => <li key={l.name}>{l.name} × {fmtQty(l.quantity)}</li>)}
        </ul>
      )}
      {s.quote && <p className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm italic">“{s.quote}”</p>}
    </Step>
  )
}

function NowStep({ now }) {
  if (!now) return null
  return (
    <li className="relative flex gap-3">
      <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", DOT[now.tone])}>
        {now.tone === "wait" ? <Clock3 className="size-3.5" /> : now.tone === "fail" ? <X className="size-3.5" /> : <Check className="size-3.5" />}
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Now</p>
        <p className="text-sm font-semibold">{now.text}</p>
      </div>
    </li>
  )
}

function Part({ icon: Icon, title, hint, children }) {
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-bold"><Icon className="size-4 text-primary" aria-hidden /> {title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}

const LINE = "relative space-y-4 before:absolute before:inset-y-2 before:start-3.5 before:w-px before:bg-border"

export default function OrderStory({ order, audience = "marketing" }) {
  const events = order.events || []
  const agreement = events.filter((e) => AGREEMENT.has(e.kind))
  const making = events.filter((e) => !AGREEMENT.has(e.kind))
  const promised = sumQty(order.items)
  const ordered = order.revision?.items?.length ? order.revision.items.reduce((s, i) => s + Number(i.requested || 0), 0) : promised
  const approved = order.approval_status === "APPROVED"

  return (
    <div className="space-y-4">
      <Part icon={Handshake} title="Order & agreement" hint="Between Marketing and Operations: what the customer ordered and what Operations promised.">
        <Figures cells={[
          ["Ordered by Marketing", ordered, ""],
          ["Promised by Operations", ["PENDING_APPROVAL", "DRAFT"].includes(order.approval_status) ? null : promised, ""],
        ]} />
        <p className="text-sm text-muted-foreground">
          {order.customer_name ? <>For <b className="text-foreground">{order.customer_name}</b> · </> : null}
          <OrderValue order={order} className="text-sm" />
        </p>
        <ol className={LINE}>
          <Step role="MARKETING_MANAGER" name={order.created_by_name} at={order.created_at} icon={FilePen} tone="done">
            <p className="mt-1 text-sm">Wrote the order: {order.items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")}.</p>
          </Step>
          {agreement.map((e, i) => <EventStep key={i} e={e} />)}
          <NowStep now={agreementNow(order)} />
        </ol>
      </Part>

      {approved && (audience === "operations" ? (
        <Part icon={Factory} title="Making it" hint="Operations' own work: parts from Purchase, units sent to Production.">
          <Figures cells={[
            ["Given to Production", sumQty(order.production_request?.items || []), "text-success"],
            ["Waiting for parts", Number(order.left_to_send || 0), "text-warning"],
          ]} />
          <ol className={LINE}>
            {making.map((e, i) => <EventStep key={i} e={e} />)}
            <NowStep now={makingNow(order)} />
          </ol>
        </Part>
      ) : (
        <Part icon={Factory} title="Making it" hint="Operations' work after the agreement, in one line.">
          <MakingLine order={order} className="text-sm" />
        </Part>
      ))}
    </div>
  )
}
