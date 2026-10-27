import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Calendar, Check, CheckCircle2, Clock3, Edit3, Loader2, Scale, Send, Trash2, X } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { useUpdateDeliveryDateMutation } from "@/features/order-approvals/orderApprovalsApi"
import { useAcceptOrderRevisionMutation, useDeclineOrderRevisionMutation } from "./marketingOrdersApi"
import UserCell from "@/components/UserCell"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { MktBtn, StatusPill } from "./mktKit"
import { SPRING, SPRING_SOFT } from "./mktMotion"
import { DECIDED_STATUSES, DRAWER_TABS, OrderValue, approvedFor, orderSteps, plural, reviewOf, sentToProduction, stageOf, sumQty } from "./orderParts"

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/*
  Right-side Order Details drawer for one marketing order. Everything shown comes from the order the list
  already loaded (GET /marketing-orders): items, totals, approval fields, sent_to_admin_at and the production /
  purchase hand-over rows. Nothing is invented: a step with no recorded time shows no time.
  The Timeline stops at the Operations Admin's decision: production / purchase steps are not shown to Marketing.

  The page keeps the open order and the tab in the URL (?order=12&tab=items), so the drawer survives a refresh
  and "View items" is simply the same drawer opened on the Items & Quantities tab.
*/

const fmtWhen = (name, at) => [name, at ? fmtDateTime(at) : ""].filter(Boolean).join(" · ")

function QtyBar({ ratio, grad }) {
  return (
    <span className="block h-1 overflow-hidden rounded-full bg-slate-200/80" aria-hidden>
      <motion.span
        className={cn("block h-full origin-left rounded-full bg-gradient-to-r rtl:origin-right", grad)}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ ...SPRING_SOFT, delay: 0.08 }}
      />
    </span>
  )
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm font-medium">{children}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ quantity revision */

const COPY_TONE = {
  approved: { ring: "border-emerald-200 bg-emerald-50/60", ink: "text-emerald-800", label: "Will be made now" },
  held: { ring: "border-orange-200 bg-orange-50/60", ink: "text-orange-800", label: "Not now · saved as a draft" },
  // the order was cancelled: the held-back draft was removed with it
  dropped: { ring: "border-slate-200 bg-slate-50/60", ink: "text-slate-600", label: "Not made · draft removed" },
}

/* One of the two copies of a revised order: the products with units in `field` (approved | held). */
function RevisionCopy({ number, field, items, tone = field }) {
  const t = COPY_TONE[tone]
  const lines = items.filter((i) => Number(i[field]) > 0)
  return (
    <div className={cn("min-w-0 rounded-xl border p-3", t.ring)}>
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.5px]", t.ink)}>{t.label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{number || "-"}</p>
      <ul className="mt-2 space-y-1">
        {lines.map((i) => (
          <li key={i.product_id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{i.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{fmtQty(i[field])}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-dashed pt-1.5 text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{fmtQty(lines.reduce((s, i) => s + Number(i[field]), 0))}</span> units
      </p>
    </div>
  )
}

/*
  The Operations Admin makes only part of this order. Both copies are shown side by side: this order (what will be
  made) and the held-back draft (the rest), with the admin's reason and whether Marketing has accepted yet.
*/
function RevisionSection({ order }) {
  const r = order.revision
  if (!r) return null
  const waiting = order.approval_status === "QUANTITY_REVISED"
  const items = r.items || []

  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-4 text-orange-600" aria-hidden /> Quantity revised by Operations Admin</h3>
      <div className="space-y-3 rounded-2xl bg-orange-50/40 px-4 py-3.5 ring-1 ring-inset ring-orange-200/70">
        <UserCell name={order.revised_by_name} sub={fmtDateTime(order.revised_at)} />
        {r.remarks && <p className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-snug">{r.remarks}</p>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <RevisionCopy number={order.order_number} field="approved" items={items} />
          <RevisionCopy number={r.held_order_number} field="held" items={items} tone={order.approval_status === "CANCELLED" ? "dropped" : "held"} />
        </div>
        {waiting ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-800">
            <Clock3 className="size-4 motion-safe:animate-pulse" aria-hidden /> Waiting for the Marketing Manager to accept
          </p>
        ) : r.declined_at ? (
          <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-700">
            <X className="size-4" aria-hidden /> Not accepted by {r.declined_by_name || "Marketing"}: the order was cancelled
            <span className="font-normal text-muted-foreground">· {fmtDateTime(r.declined_at)}</span>
          </p>
        ) : order.revision_accepted_at ? (
          <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden /> Accepted by {order.revision_accepted_by_name || "Marketing"}
            <span className="font-normal text-muted-foreground">· {fmtDateTime(order.revision_accepted_at)}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Overview */

function OverviewTab({ order }) {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const canModifyDate = canEdit("orderApprovals")
  const [updateDeliveryDate, { isLoading: updatingDate }] = useUpdateDeliveryDateMutation()
  const [isEditingDate, setIsEditingDate] = useState(false)
  const [newDeliveryDate, setNewDeliveryDate] = useState("")
  const [dateChangeReason, setDateChangeReason] = useState("")

  const handleSaveDeliveryDate = async () => {
    if (!newDeliveryDate) return
    try {
      await updateDeliveryDate({
        id: order.id,
        estimated_delivery_date: newDeliveryDate,
        reason: dateChangeReason,
      }).unwrap()
      toast.success("Delivery date updated and Marketing Manager notified")
      setIsEditingDate(false)
      setDateChangeReason("")
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update delivery date"))
    }
  }
  const stage = stageOf(order.approval_status)
  const decided = DECIDED_STATUSES.includes(order.approval_status)
  const { requested, approved, ratio } = reviewOf(order)
  const Icon = stage?.icon

  return (
    <div className="space-y-5">
      {stage && (
        <motion.div
          key={order.approval_status}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
          className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", stage.s.grad, stage.s.glow)}
        >
          <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
          <div className="relative flex items-center gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.short === "Pending" ? "Waiting for approval" : stage.short}</p>
              {stage.hint && <p className="mt-0.5 text-xs text-white/95">{stage.hint}</p>}
            </div>
            <div className="shrink-0 text-end">
              <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(requested)}</p>
              <p className="mt-1 text-[11px] text-white/95">units ordered</p>
            </div>
          </div>
        </motion.div>
      )}

            {/* Estimated Delivery Date */}
      <div className="rounded-xl border bg-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated Delivery Date</span>
          </div>
          {canModifyDate && !isEditingDate && (
            <button
              type="button"
              onClick={() => {
                setNewDeliveryDate(order.estimated_delivery_date || "")
                setIsEditingDate(true)
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Edit3 className="size-3.5" /> Modify Date
            </button>
          )}
        </div>
        {!isEditingDate ? (
          <p className="mt-1.5 text-sm font-semibold tabular-nums text-foreground">
            {order.estimated_delivery_date ? order.estimated_delivery_date : <span className="text-muted-foreground font-normal">Not set by marketing</span>}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={newDeliveryDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNewDeliveryDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <input
              type="text"
              placeholder="Reason for change (optional, sent to marketing)"
              value={dateChangeReason}
              onChange={(e) => setDateChangeReason(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <div className="flex gap-2 justify-end">
              <MktBtn size="sm" onClick={() => setIsEditingDate(false)} disabled={updatingDate}>Cancel</MktBtn>
              <MktBtn size="sm" variant="primary" onClick={handleSaveDeliveryDate} disabled={updatingDate || !newDeliveryDate}>
                {updatingDate ? <Loader2 className="animate-spin size-3.5" /> : <Check className="size-3.5" />} Save & Notify Marketing
              </MktBtn>
            </div>
          </div>
        )}
      </div>

      {order.parent_order_number && (
        <p className="rounded-xl border border-orange-200 bg-orange-50/60 px-3.5 py-3 text-sm leading-snug text-orange-900">
          The part of <span className="font-semibold tabular-nums">{order.parent_order_number}</span> the Operations Admin is not making now.
          {order.approval_status === "DRAFT" && " Send it again when you are ready."}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Created by">{order.created_by_name || "-"}</Fact>
        <Fact label="Created on">{fmtDateTime(order.created_at)}</Fact>
        <Fact label="Sent to admin">{order.approval_status === "DRAFT" ? <span className="text-muted-foreground">Not sent yet</span> : order.sent_to_admin_at ? fmtDateTime(order.sent_to_admin_at) : "Sent"}</Fact>
        <Fact label="Products">{plural(order.items.length, "product")}</Fact>
      </dl>

      <RevisionSection order={order} />

      {/* a cancelled order needs no review: what happened is in the revision box above */}
      {order.approval_status !== "CANCELLED" && <section className="space-y-2.5">
        <h3 className="text-sm font-semibold">Operations review</h3>
        {decided ? (
          <div className={cn("space-y-3 rounded-2xl px-4 py-3.5 ring-1 ring-inset", stage.s.soft)}>
            <div>
              <p className={cn("flex items-center gap-1.5 text-sm font-bold", stage.s.ink)}>
                <Icon className="size-4 shrink-0" aria-hidden />
                {stage.short}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{fmtQty(approved)}</span> of <span className="tabular-nums">{fmtQty(requested)}</span> units approved
              </p>
              <div className="mt-2"><QtyBar ratio={ratio} grad={stage.s.grad} /></div>
            </div>
            <UserCell name={order.approved_by_name} sub={fmtDateTime(order.approved_at)} />
            {order.approval_remarks && <p className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-snug">{order.approval_remarks}</p>}
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
            {order.approval_status !== "DRAFT" && <Clock3 className="size-4 motion-safe:animate-pulse" aria-hidden />}
            {order.approval_status === "DRAFT"
              ? "This order has not been sent for review yet."
              : order.approval_status === "QUANTITY_REVISED"
                ? "The Operations Admin decides once Marketing accepts the revised quantity."
                : "Waiting for the Operations Admin to decide."}
          </p>
        )}
      </section>}
    </div>
  )
}

/* ------------------------------------------------------------ Items & Quantities */

function ItemsTab({ order }) {
  const decided = DECIDED_STATUSES.includes(order.approval_status)
  const hasProduction = Boolean(order.production_request)
  const rows = order.items.map((it) => ({ ...it, approved: approvedFor(order, it), toProduction: sentToProduction(order, it) }))
  const requested = sumQty(order.items)
  const approved = decided ? rows.reduce((s, r) => s + (r.approved ?? 0), 0) : null
  const cards = [
    ["Requested", requested],
    ...(decided ? [["Approved", approved]] : []),
    ...(hasProduction ? [["To production", sumQty(order.production_request.items)]] : []),
  ]

  return (
    <div className="space-y-4">
      {cards.length > 1 && (
        <div className={cn("grid gap-2.5", cards.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">{label}</p>
              <p className="mt-1 text-lg font-bold leading-none tabular-nums">{fmtQty(value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead className="text-end">Requested</TableHead>
              {decided && <TableHead className="text-end">Approved</TableHead>}
              {hasProduction && <TableHead className="text-end">To production</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.product_id} className="hover:bg-accent/40">
                <TableCell className="whitespace-normal">
                  <p className="font-medium leading-snug">{r.name}</p>
                  {r.sku && <p className="text-xs text-muted-foreground">{r.sku}</p>}
                </TableCell>
                <TableCell className="text-end font-semibold tabular-nums">{fmtQty(r.quantity)}</TableCell>
                {decided && <TableCell className={cn("text-end font-semibold tabular-nums", r.approved === 0 && "text-muted-foreground")}>{fmtQty(r.approved)}</TableCell>}
                {hasProduction && <TableCell className={cn("text-end tabular-nums", r.toProduction === 0 && "text-muted-foreground")}>{fmtQty(r.toProduction)}</TableCell>}
              </TableRow>
            ))}
            <TableRow className="bg-cf-head hover:bg-cf-head">
              <TableCell className="text-xs font-semibold text-muted-foreground">Total units</TableCell>
              <TableCell className="text-end font-bold tabular-nums">{fmtQty(requested)}</TableCell>
              {decided && <TableCell className="text-end font-bold tabular-nums">{fmtQty(approved)}</TableCell>}
              {hasProduction && <TableCell className="text-end font-bold tabular-nums">{fmtQty(sumQty(order.production_request.items))}</TableCell>}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {hasProduction && <p className="text-xs text-muted-foreground">"To production" is what the stock could cover when the Operations Admin approved the order.</p>}
      {!decided && <p className="text-xs text-muted-foreground">Approved quantities appear here once the Operations Admin has decided.</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ Timeline */

const MARK = {
  done: "bg-gradient-to-br from-emerald-700 to-emerald-800 text-white shadow-sm",
  current: "border-2 border-primary bg-card text-primary",
  todo: "border-2 border-border bg-card text-transparent",
  fail: "bg-gradient-to-br from-rose-600 to-red-800 text-white shadow-sm",
}

/* Only the three steps Marketing cares about (created, sent to admin, decision). What happens after approval is not shown. */
function timelineRows(order) {
  const status = order.approval_status
  const steps = orderSteps(status)
  const decided = DECIDED_STATUSES.includes(status)
  const cancelled = status === "CANCELLED"
  const { requested, approved } = reviewOf(order)

  const rows = [
    { title: "Order created", state: steps[0][1], sub: fmtWhen(order.created_by_name || "-", order.created_at) },
    {
      title: "Sent to Operations Admin",
      state: steps[1][1],
      sub: status === "DRAFT" ? "Not sent yet. Send it when it is ready." : order.sent_to_admin_at ? fmtDateTime(order.sent_to_admin_at) : "Handed over for approval",
    },
    {
      title: steps[2][0],
      state: steps[2][1],
      sub: decided
        ? fmtWhen(order.approved_by_name || "-", order.approved_at)
        : cancelled
          ? fmtWhen(order.revision?.declined_by_name || "-", order.revision?.declined_at)
          : status === "QUANTITY_REVISED"
          ? fmtWhen(order.revised_by_name || "-", order.revised_at)
          : status === "PENDING_APPROVAL" ? "Waiting for the Operations Admin" : "Starts after you send the order",
      extra: decided
        ? `${fmtQty(approved)} of ${fmtQty(requested)} units approved`
        : cancelled
          ? `You did not accept the reduced quantity (revised by ${order.revised_by_name || "the Operations Admin"}), so the order was cancelled`
          : status === "QUANTITY_REVISED" ? "Waiting for Marketing to accept the reduced quantity" : "",
      remarks: decided ? order.approval_remarks : status === "QUANTITY_REVISED" || cancelled ? order.revision?.remarks : "",
    },
  ]
  return rows
}

function TimelineTab({ order }) {
  const rows = timelineRows(order)
  return (
    <ol>
      {rows.map((r, i) => {
        const last = i === rows.length - 1
        return (
          <motion.li
            key={r.title}
            className="relative flex gap-3.5 pb-6 last:pb-0"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING, delay: 0.06 * i }}
          >
            {!last && <span aria-hidden className={cn("absolute start-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 rounded-full", r.state === "done" ? "bg-emerald-300" : "bg-border")} />}
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", MARK[r.state])}>
              {r.state === "done" && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {r.state === "fail" && <X className="size-4" strokeWidth={3} aria-hidden />}
              {r.state === "current" && <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", r.state === "todo" && "text-muted-foreground", r.state === "fail" && "text-destructive")}>{r.title}</p>
              {r.sub && <p className="text-xs text-muted-foreground">{r.sub}</p>}
              {r.extra && <p className="mt-0.5 text-xs font-medium tabular-nums">{r.extra}</p>}
              {r.remarks && (
                <p className={cn("mt-2 rounded-xl border px-3 py-2 text-sm leading-snug", r.state === "fail" ? "border-destructive/20 bg-cf-red-soft text-destructive" : "bg-muted/60 text-foreground")}>{r.remarks}</p>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ the drawer */

function Panel({ order, tab, onTab, onClose, editable, busy, onSend, onDelete, actions, tabs = DRAWER_TABS, tabContent, wide = false }) {
  const ref = useRef(null)
  const bodyRef = useRef(null)
  const uid = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl"
  const offscreen = `${rtl ? -100 : 100}%`
  const draft = order.approval_status === "DRAFT"
  const revised = order.approval_status === "QUANTITY_REVISED"
  const units = sumQty(order.items)
  const toast = useToast()
  const [acceptRevision, { isLoading: accepting }] = useAcceptOrderRevisionMutation()
  const [declineRevision, { isLoading: declining }] = useDeclineOrderRevisionMutation()

  const accept = async () => {
    try {
      await acceptRevision(order.id).unwrap()
      toast.success(`${order.order_number}: revised quantity accepted, back with the Operations Admin`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not accept the revised quantity."))
    }
  }

  const decline = async () => {
    if (!window.confirm(`Do not accept the reduced quantity? Order ${order.order_number} will be cancelled.`)) return
    try {
      await declineRevision(order.id).unwrap()
      toast.success(`${order.order_number} cancelled. The Operations Admin has been told.`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not cancel the order."))
    }
  }

  // Focus, scroll lock, Escape and Tab trapping while the drawer is mounted (same behaviour as the Modal).
  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement
    const body = document.body
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = "hidden"
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    ;(el.querySelector("[data-autofocus]") || el).focus()

    const onKey = (e) => {
      if (e.key === "Escape") { closeRef.current(); return }
      if (e.key !== "Tab") return
      const nodes = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (nodes.length === 0) { e.preventDefault(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      body.style.overflow = before.overflow
      body.style.paddingRight = before.paddingRight
      if (previous && previous.focus) previous.focus()
    }
  }, [])

  // a new tab starts at the top
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0 }, [tab])

  const tabId = (id) => `${uid}-tab-${id}`
  const panelId = (id) => `${uid}-panel-${id}`

  const onTabKey = (e) => {
    const i = tabs.findIndex((t) => t.id === tab)
    const n = tabs.length
    const next = rtl ? -1 : 1
    let to = null
    if (e.key === "ArrowRight") to = (i + next + n) % n
    else if (e.key === "ArrowLeft") to = (i - next + n) % n
    else if (e.key === "Home") to = 0
    else if (e.key === "End") to = n - 1
    if (to === null) return
    e.preventDefault()
    onTab(tabs[to].id)
    document.getElementById(tabId(tabs[to].id))?.focus()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-[#101a17]/45 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current() }}
    >
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        className={cn("absolute inset-y-0 end-0 flex w-full flex-col bg-card shadow-[-24px_0_64px_-12px_rgba(16,26,23,0.35)] outline-none ring-1 ring-[#E3E6EB]", wide ? "sm:max-w-3xl" : "sm:max-w-xl")}
        initial={{ x: offscreen }}
        animate={{ x: 0 }}
        exit={{ x: offscreen }}
        transition={SPRING}
      >
        <div className="flex items-start justify-between gap-4 border-b bg-gradient-to-r from-accent/70 via-white to-white px-5 pt-4">
          <div className="min-w-0 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">Order details</p>
            <h2 id={`${uid}-title`} className="mt-0.5 truncate text-[17px] font-bold leading-snug tracking-[-0.2px] tabular-nums">{order.order_number}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
              <StatusPill value={order.approval_status} short />
              <span>{plural(order.items.length, "product")} · {fmtQty(units)} units</span>
              <OrderValue order={order} className="text-sm" />
            </p>
          </div>
          <button
            type="button"
            aria-label="Close order details"
            data-autofocus
            onClick={onClose}
            className="-me-1.5 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="size-4" />
          </button>
        </div>

        <div role="tablist" aria-label="Order sections" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b px-3">
          {tabs.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={panelId(t.id)}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t.id)}
                className={cn(
                  "relative shrink-0 whitespace-nowrap rounded-t-md px-3 py-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {active && <motion.span layoutId={`${uid}-ink`} transition={SPRING} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <motion.div
            key={tab}
            id={panelId(tab)}
            role="tabpanel"
            aria-labelledby={tabId(tab)}
            tabIndex={0}
            className="outline-none"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: SPRING }}
          >
            {tabContent?.[tab] ?? (tab === "items" ? <ItemsTab order={order} /> : tab === "timeline" ? <TimelineTab order={order} /> : <OverviewTab order={order} />)}
          </motion.div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-cf-head px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end">
          {editable && draft && (
            <MktBtn variant="danger" className="sm:me-auto" disabled={busy} onClick={() => onDelete(order)}>
              <Trash2 /> Delete draft
            </MktBtn>
          )}
          <MktBtn onClick={onClose} className={actions ? "sm:me-auto" : undefined}>Close</MktBtn>
          {actions}
          {editable && revised && (
            <MktBtn variant="danger" disabled={accepting || declining} onClick={decline}>
              {declining ? <Loader2 className="animate-spin" /> : <X />} Don&apos;t accept
            </MktBtn>
          )}
          {editable && revised && (
            <MktBtn variant="primary" disabled={accepting || declining} onClick={accept}>
              {accepting ? <Loader2 className="animate-spin" /> : <Check />} Accept revised quantity
            </MktBtn>
          )}
          {editable && draft && (
            <MktBtn variant="primary" disabled={busy} onClick={() => onSend(order)}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
            </MktBtn>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

/** Pass `order={null}` to keep it closed; the slide-out plays on the way out. */
export default function OrderDrawer({ order, ...props }) {
  if (typeof document === "undefined") return null
  return createPortal(<AnimatePresence>{order && <Panel key="order-drawer" order={order} {...props} />}</AnimatePresence>, document.body)
}
