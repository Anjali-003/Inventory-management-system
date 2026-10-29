import { motion } from "motion/react"
import { ChevronRight } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusPill } from "@/features/marketing-orders/mktKit"
import { rise, stagger } from "@/features/marketing-orders/mktMotion"
import { timeAgo } from "@/features/activity/time"
import { fmtQty } from "@/lib/stock"

/*
  Orders on a dashboard, the way the Marketing Manager sees them:
    768px and up: a compact table, click a row to open the full popup.
    phones: short cards (number, status, products in one line, who and when, the rejection reason),
            tap anywhere on a card to open the same popup.
  Hairline border, no shadow (ChaiUI).
*/

const summary = (items = []) => (items.length === 0 ? "No products" : items.length === 1 ? items[0].name : `${items[0].name} + ${items.length - 1} more`)
const units = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
const byLine = (o) => `${o.created_by_name ? `${o.created_by_name} · ` : ""}${timeAgo(o.created_at)}`

function OrderTable({ orders, onOpen }) {
  return (
    <Table data-cards="off">
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Products</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right"><span className="sr-only">Open</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id} onClick={() => onOpen(o)} className="cursor-pointer">
            <TableCell>
              <button type="button" onClick={() => onOpen(o)} className="font-semibold tabular-nums text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{o.order_number}</button>
              <p className="text-xs text-muted-foreground">{byLine(o)}</p>
            </TableCell>
            <TableCell className="min-w-40 whitespace-normal">
              <p className="break-words leading-snug">{summary(o.items)}</p>
              <p className="text-xs text-muted-foreground">{fmtQty(units(o.items))} units</p>
            </TableCell>
            <TableCell><StatusPill value={o.approval_status} short /></TableCell>
            <TableCell className="text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function OrderCards({ orders, onOpen }) {
  return (
    <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className="grid gap-3 p-3 sm:p-4">
      {orders.map((o) => (
        <motion.li key={o.id} variants={rise} className="relative rounded-xl border border-border bg-card transition-colors duration-200 hover:border-lp-rule">
          <button type="button" onClick={() => onOpen(o)} aria-label={`Open ${o.order_number}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
          <div className="pointer-events-none relative p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-all text-[15px] font-semibold leading-snug tabular-nums">{o.order_number}</span>
              <StatusPill value={o.approval_status} className="shrink-0" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{summary(o.items)}</p>
                <p className="text-xs text-muted-foreground">{fmtQty(units(o.items))} units · {byLine(o)}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            {o.approval_status === "REJECTED" && o.approval_remarks && (
              <p className="mt-2.5 line-clamp-2 rounded-lg border border-rose-200 px-3 py-2 text-xs leading-snug text-rose-800">{o.approval_remarks}</p>
            )}
          </div>
        </motion.li>
      ))}
    </motion.ul>
  )
}

/* A dashboard card holding orders: table from 768px, cards below. "View all" opens the full list popup. */
export function OrderPanel({ drill, title, description, orders, rows, limit = 5, loading, empty, emptyIcon, to, toLabel, onOpen }) {
  const shown = orders.slice(0, limit)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {orders.length > limit && (
          <Button variant="ghost" size="sm" onClick={() => drill.openList({ title, description, rows, to, toLabel, empty })}>View all ({orders.length})</Button>
        )}
      </CardHeader>
      {loading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState icon={emptyIcon} title={empty || "Nothing here right now"} />
      ) : (
        <>
          <div className="hidden md:block"><OrderTable orders={shown} onOpen={onOpen} /></div>
          <div className="md:hidden"><OrderCards orders={shown} onOpen={onOpen} /></div>
        </>
      )}
    </Card>
  )
}
