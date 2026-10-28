/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowRight, ChevronRight } from "lucide-react"
import UserCell from "@/components/UserCell"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MktBtn, StatusPill } from "@/features/marketing-orders/mktKit"
import { PRESS_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { ALL_STAGE, CustomerName, OrderSteps, OrderValue, STAGES, declinedOf, plural, stageOf } from "@/features/marketing-orders/orderParts"
import { timeAgo } from "@/features/activity/time"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import PlanSummary from "./PlanSummary"
import { canApprove } from "./approvalParts"

/*
  Building blocks for the Operations Admin screens (dashboard + Incoming Orders), made from the same
  pieces as the Marketing Manager screens (hero, colour tiles, status pills, cards on a phone, tables from
  `md`/`lg` up). Nothing in the Marketing files changes: the kit is reused as it is.

  The Operations Admin never sees drafts, so the stages are Waiting / Approved / Rejected, in the same colours
  the Marketing Manager sees for them. Only the small hint under each figure is worded for the admin.
*/

/* ------------------------------------------------------------------- stages */

const HINT = {
  PENDING_APPROVAL: "Needs your decision",
  APPROVED: "You said yes: send it on to Production and Purchase",
  REJECTED: "With the reason you gave",
  // CANCELLED: "Marketing said no to your reduced quantity, or you cancelled it",
}

export const OPS_STAGES = STAGES.filter((s) => s.status !== "DRAFT").map((s) => ({ ...s, hint: HINT[s.status] ?? s.hint }))
export const OPS_ALL = { ...ALL_STAGE,label: "All orders", hint: "Everything that came in" }

export const isOpsStatus = (value) => OPS_STAGES.some((s) => s.status === value)

/** Link to Incoming Orders with a filter on. No status means the page's own default: the waiting queue. "ALL" shows every order. */
export function opsHref(status, extra = {}) {
  const p = new URLSearchParams()
  if (status) p.set("status", status)
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, v)
  const s = p.toString()
  return `/order-approvals${s ? `?${s}` : ""}`
}

/* ------------------------------------------------------------------ helpers */

export const productsSummary = (items = []) => (items.length === 0 ? "No products" : items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`)
export const unitsOf = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
export const isDecided = (o) => ["APPROVED", "REJECTED"].includes(o.approval_status)

/*
  Small line under a status: the quantity was revised, and where that stands. Once Marketing agrees the order is
  Pending again, waiting for the admin's Approve, so the line says whose turn it is (not just "accepted").
*/
export function RevisionTag({ order, className }) {
  if (!order?.revision) return null
  const accepted = Boolean(order.revision_accepted_at)
  const declined = Boolean(order.revision.declined_at) || declinedOf(order)?.who === "Marketing"
  const units = fmtQty(unitsOf(order.items))
  const text = declined
    ? "Marketing did not agree to the reduced qty"
    : !accepted
      ? "Qty reduced, waiting for Marketing"
      : order.approval_status === "PENDING_APPROVAL"
        ? `Marketing agreed to ${units} · your turn to approve`
        : `Marketing agreed to ${units}`
  const tone = declined ? "text-slate-600" : !accepted ? "text-orange-700" : order.approval_status === "PENDING_APPROVAL" ? "text-amber-700" : "text-emerald-700"
  return <span className={cn("mt-1 block text-xs font-medium leading-snug", tone, className)}>{text}</span>
}

/* -------------------------------------------------------------------- tiles */

/** The grid of figures. Children are <StageTile/>; they rise in one after another. Four stages + "All" = five tiles. */
export function OpsTileGrid({ children, className }) {
  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="hidden" animate="show" className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5", className)}>
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------- panels */

/** A card with a title, an optional "view all" link and a body. Hairline border, no shadow. */
export function OpsPanel({ title, description, to, toLabel, loading, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className="inline-flex h-9 shrink-0 items-center rounded-[10px] border border-cf-line-strong bg-card px-3 text-xs font-semibold text-primary outline-none transition-colors hover:bg-cf-green-soft focus-visible:ring-2 focus-visible:ring-ring/60">{toLabel}</Link>}
      </CardHeader>
      {loading ? <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : children}
    </Card>
  )
}

/* The list of cards inside a panel or page: they rise in one after another. */
export const CardList = ({ children, className }) => (
  <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className={cn("grid gap-3", className)}>
    {children}
  </motion.ul>
)

/* -------------------------------------------------------------------- cards */

/*
  One order as a card (the dashboard panels). The whole card opens the order drawer, where the decisions are
  (OpsOrderDrawer): a card never has decision buttons of its own. `showPlan` adds the live stock check.
*/
export function ApprovalCard({ order, showPlan, onOpen }) {
  const items = order.items ?? []
  const approvable = canApprove(order)
  const rejected = order.approval_status === "REJECTED"

  return (
    <motion.li variants={rise} className="relative rounded-xl border border-[#E3E6EB] bg-card transition-colors duration-200 hover:border-[#CDD2DA]">
      <button type="button" onClick={onOpen} aria-label={`Open ${order.order_number}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
      <div className="pointer-events-none relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all text-[15px] font-semibold leading-snug tabular-nums">{order.order_number}</p>
            <CustomerName order={order} />
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fmtDateTime(order.created_at)}>
              {order.created_by_name ? `${order.created_by_name} · ` : ""}{timeAgo(order.created_at)}
            </p>
          </div>
          <StatusPill value={order.approval_status} short className="shrink-0" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{productsSummary(items)}</p>
            <p className="text-xs text-muted-foreground">{plural(items.length, "product")} · {fmtQty(unitsOf(items))} units</p>
            <OrderValue order={order} className="block" />
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        {showPlan && approvable && (
          <div className="mt-3 rounded-xl border border-[#E3E6EB] px-3 py-2.5">
            <PlanSummary orderId={order.id} items={items} />
          </div>
        )}

        <OrderSteps status={order.approval_status} className="mt-4" />

        {isDecided(order) && order.approval_remarks && (
          <p className={cn("mt-3 line-clamp-2 rounded-lg border px-3 py-2 text-xs leading-snug", rejected ? "border-rose-200 text-rose-800" : "border-emerald-200 text-emerald-800")}>{order.approval_remarks}</p>
        )}
      </div>

    </motion.li>
  )
}

/*
  One order as the big card on the Incoming Orders page (phones and tablets): the same card the Marketing Manager
  sees on Marketing Orders (colour stripe, product lines, progress steps, decision box), plus the live stock check
  and the Reject / Check stock & send buttons for an order that is waiting. The body opens the order; the buttons never do.
*/
const SHOW_LINES = 2
export function ApprovalPageCard({ order: o, canAct, onOpen, onReview }) {
  const stage = stageOf(o.approval_status)
  const items = o.items ?? []
  const approvable = canApprove(o)
  const extra = items.length - SHOW_LINES

  return (
    <motion.article
      layout="position"
      variants={rise}
      className="relative overflow-hidden rounded-2xl border border-[#E3E6EB] bg-card shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]"
    >
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1 bg-gradient-to-b", stage?.s.grad ?? "from-slate-600 to-slate-800")} />

      <motion.div
        role="button"
        tabIndex={0}
        whileTap={PRESS_SOFT}
        onClick={() => onOpen(o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(o) }
        }}
        className="cursor-pointer p-4 ps-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold tabular-nums tracking-[-0.01em]">{o.order_number}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fmtDateTime(o.created_at)}>
              {o.created_by_name ? `${o.created_by_name} · ` : ""}{timeAgo(o.created_at)}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <StatusPill value={o.approval_status} short />
            <RevisionTag order={o} />
          </div>
        </div>

        <ul className="mt-3.5 space-y-1.5">
          {items.slice(0, SHOW_LINES).map((it) => (
            <li key={it.product_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{it.name}</span>
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">× {fmtQty(it.quantity)}</span>
            </li>
          ))}
          {extra > 0 && <li className="text-xs font-semibold text-primary">+ {plural(extra, "more product")}</li>}
        </ul>

        {approvable && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <PlanSummary orderId={o.id} items={items} />
          </div>
        )}

        <OrderSteps status={o.approval_status} className="mt-4" />

        {declinedOf(o) && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <UserCell name={declinedOf(o).by} sub={declinedOf(o).at ? fmtDateTime(declinedOf(o).at) : "Marketing"} />
            <p className="mt-1.5 text-xs leading-snug text-foreground/80">{declinedOf(o).why}</p>
          </div>
        )}
        {isDecided(o) && (
          <div className={cn("mt-3.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", stage?.s.soft)}>
            <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
            {o.approval_remarks && <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-foreground/80">{o.approval_remarks}</p>}
          </div>
        )}
      </motion.div>

      {canAct && approvable && (
        <div className="flex gap-2 border-t bg-cf-head/70 px-4 py-3 ps-5">
          {/* one entry point: the order drawer on its stock check, where Reject · Revise quantity · Check stock & send are */}
          <MktBtn variant="primary" className="flex-1" onClick={() => onReview(o)} aria-label={`Review ${o.order_number}`}>
            Review order <ArrowRight />
          </MktBtn>
        </div>
      )}
    </motion.article>
  )
}

/* ------------------------------------------------------------ compact lists */

/* Dashboard panels: a compact table from 768px up (click a row to open it), cards below. */
export function ApprovalList({ orders, onOpen }) {
  return (
    <>
      <div className="hidden md:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end"><span className="sr-only">Open</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const items = o.items ?? []
              return (
                <TableRow key={o.id} onClick={() => onOpen(o)} className="cursor-pointer">
                  <TableCell>
                    <button type="button" onClick={() => onOpen(o)} className="font-semibold tabular-nums text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{o.order_number}</button>
                    <CustomerName order={o} />
                    <p className="text-xs text-muted-foreground">{timeAgo(o.created_at)}</p>
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    <p className="break-words leading-snug">{productsSummary(items)}</p>
                    <p className="text-xs text-muted-foreground">{fmtQty(unitsOf(items))} units</p>
                    <OrderValue order={o} className="block" />
                  </TableCell>
                  <TableCell><StatusPill value={o.approval_status} short /><RevisionTag order={o} /></TableCell>
                  <TableCell className="text-end"><ChevronRight className="ms-auto size-4 text-muted-foreground rtl:-scale-x-100" aria-hidden /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden">
        <CardList className="p-3 sm:p-4">
          {orders.map((o) => <ApprovalCard key={o.id} order={o} onOpen={() => onOpen(o)} />)}
        </CardList>
      </div>
    </>
  )
}

/* "Who decided it, when, and why": the Decision column of the table. */
export function DecisionCell({ order }) {
  const declined = declinedOf(order)
  if (declined) {
    return (
      <div className="space-y-0.5">
        <UserCell name={declined.by} sub={declined.at ? fmtDateTime(declined.at) : declined.who} />
        <p className="max-w-64 whitespace-normal text-xs text-muted-foreground">{declined.why}</p>
      </div>
    )
  }
  if (!isDecided(order)) return <span className="text-muted-foreground">-</span>
  return (
    <div className="space-y-0.5">
      <UserCell name={order.approved_by_name} sub={fmtDateTime(order.approved_at)} />
      {order.approval_remarks && <p className="line-clamp-2 max-w-64 whitespace-normal text-xs text-muted-foreground">{order.approval_remarks}</p>}
    </div>
  )
}
