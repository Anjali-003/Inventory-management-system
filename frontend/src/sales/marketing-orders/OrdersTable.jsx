import { motion } from "motion/react"
import { Clock3, Loader2, Send, Trash2 } from "lucide-react"
import UserCell from "@/components/UserCell"
import { PageButton, Panel } from "@/components/PageKit"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { timeAgo } from "@/core/activity/time"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { StatusPill } from "./mktKit"
import { SPRING_SOFT } from "./mktMotion"
import { CustomerName, DECIDED_STATUSES, MakingLine, OrderValue, declinedOf, plural, reviewOf, stageOf } from "./orderParts"

const SHOW_LINES = 2
const DECIDED = DECIDED_STATUSES

/* Column 4: decision, approved of requested, the admin who decided and when. */
function ReviewCell({ o }) {
  const stage = stageOf(o.approval_status)
  const declined = declinedOf(o)

  if (declined) {
    return (
      <div className="max-w-64 space-y-0.5 whitespace-normal">
        <p className={cn("text-[13px] font-bold", stage.s.ink)}>Cancelled</p>
        <p className="text-xs text-muted-foreground">{declined.who === "Marketing" ? "You did not accept the reduced quantity" : declined.why}</p>
        {declined.at && <p className="text-xs text-muted-foreground">{declined.by} · {fmtDateTime(declined.at)}</p>}
      </div>
    )
  }

  if (!DECIDED.includes(o.approval_status)) {
    const draft = o.approval_status === "DRAFT"
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {!draft && <Clock3 className="size-3.5 motion-safe:animate-pulse" aria-hidden />}
        {draft ? "Not sent for review yet" : "Waiting for the Operations Admin"}
      </span>
    )
  }

  const { requested, approved, ratio } = reviewOf(o)
  const Icon = stage.icon

  return (
    <div className="max-w-64 space-y-2 whitespace-normal">
      <div>
        <p className={cn("flex items-center gap-1.5 text-[13px] font-bold", stage.s.ink)}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {stage.short}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{fmtQty(approved)}</span>
          {" of "}
          <span className="tabular-nums">{fmtQty(requested)}</span> units approved
        </p>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-lp-bg" aria-hidden>
          <motion.span
            className={cn("block h-full origin-left rounded-full rtl:origin-right", stage.dot)}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: ratio }}
            transition={{ ...SPRING_SOFT, delay: 0.1 }}
          />
        </span>
      </div>
      <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
      <MakingLine order={o} />
      {o.approval_remarks && (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground" title={o.approval_remarks}>{o.approval_remarks}</p>
      )}
    </div>
  )
}

/* Desktop table. Exactly four columns; the draft actions (Send / Delete) sit under the status. */
export default function OrdersTable({ orders, filterKey, editable, busyId, onOpen, onViewItems, onSend, onDelete, className }) {
  return (
    <Panel className={cn("overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[22%]">Order ID</TableHead>
            <TableHead className="w-[28%]">Order Items</TableHead>
            <TableHead className="w-[22%]">Order Status</TableHead>
            <TableHead className="w-[28%]">Operations Review</TableHead>
          </TableRow>
        </TableHeader>
        {/* keyed by the filter so the rows glide in again whenever the filter changes */}
        <TableBody key={filterKey}>
          {orders.map((o, i) => {
            const extra = o.items.length - SHOW_LINES
            const canAct = editable && o.approval_status === "DRAFT"
            return (
              <TableRow
                key={o.id}
                onClick={() => onOpen(o)}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, animationFillMode: "backwards" }}
                className="group cursor-pointer motion-reduce:animate-none"
              >
                <TableCell className="min-w-40 py-3.5">
                  <button type="button" className="block text-start font-semibold tabular-nums text-lp-ink outline-none transition-colors group-hover:text-lp-green focus-visible:text-lp-green focus-visible:underline">
                    {o.order_number}
                  </button>
                  <CustomerName order={o} />
                  <span className="mt-0.5 block text-xs text-muted-foreground" title={fmtDateTime(o.created_at)}>
                    {o.created_by_name ? `${o.created_by_name} · ` : ""}{timeAgo(o.created_at)}
                  </span>
                </TableCell>

                <TableCell className="min-w-48 whitespace-normal">
                  <ul className="space-y-1">
                    {o.items.slice(0, SHOW_LINES).map((it) => (
                      <li key={it.product_id} className="flex max-w-xs items-center gap-2 text-sm">
                        <span className="min-w-0 truncate">{it.name}</span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-lp-text">× {fmtQty(it.quantity)}</span>
                      </li>
                    ))}
                    {extra > 0 && <li className="text-xs font-semibold text-lp-green">+ {plural(extra, "more product")}</li>}
                  </ul>
                  <OrderValue order={o} className="mt-1 block" />
                  {onViewItems && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onViewItems(o) }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-semibold text-lp-green outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      View items
                    </button>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-2.5">
                    <StatusPill value={o.approval_status} short />
                    {canAct && (
                      <div className="flex items-center gap-2">
                        <PageButton variant="danger" size="icon" aria-label={`Delete draft ${o.order_number}`} onClick={(e) => { e.stopPropagation(); onDelete(o) }}><Trash2 /></PageButton>
                        <PageButton variant="primary" disabled={busyId === o.id} onClick={(e) => { e.stopPropagation(); onSend(o) }}>
                          {busyId === o.id ? <Loader2 className="animate-spin" /> : <Send />} Send to admin
                        </PageButton>
                      </div>
                    )}
                  </div>
                </TableCell>

                <TableCell className="py-3.5">
                  <ReviewCell o={o} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Panel>
  )
}
