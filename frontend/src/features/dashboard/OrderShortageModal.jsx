import { useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { PackageCheck, ShoppingCart } from "lucide-react"
import { Modal } from "@/components/Modal"
import UserCell from "@/components/UserCell"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  Popup opened from an order card on the Purchase Dashboard (same look as the Marketing Manager's order popup:
  a coloured banner, then the lines).
  Shows what was ordered and the SHORT components the Operations Admin asked us to buy for it
  (`order.purchase_request.items` -> [{ component_id, sku, name, unit, quantity }], quantity = shortage).
*/

const TO_ORDER_PILL = "bg-amber-50 text-amber-800 ring-amber-200"
const ORDERED_PILL = "bg-emerald-50 text-emerald-800 ring-emerald-200"

function LineStatus({ line }) {
  const toOrder = line.purchase_order_id == null
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", toOrder ? TO_ORDER_PILL : ORDERED_PILL)}>
      {toOrder ? "To order" : `Ordered · ${line.po_number}`}
    </span>
  )
}

/* The short components: a table from `sm` up, stacked cards on a phone. */
function ShortLines({ items }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Short by</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.component_id}>
                <TableCell className="whitespace-normal font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.sku || "-"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-destructive">{fmtQty(c.quantity)} {c.unit}</TableCell>
                <TableCell><LineStatus line={c} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2 sm:hidden">
        {items.map((c) => (
          <motion.li key={c.component_id} variants={rise} className="rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold leading-snug">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.sku || "-"}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1 text-sm font-bold tabular-nums text-destructive">{fmtQty(c.quantity)} {c.unit}</span>
            </div>
            <div className="mt-2.5 border-t border-dashed pt-2.5"><LineStatus line={c} /></div>
          </motion.li>
        ))}
      </motion.ul>
    </>
  )
}

export default function OrderShortageModal({ order, onClose, canRaisePurchase }) {
  const navigate = useNavigate()
  const shortages = order?.purchase_request?.items || []
  const toOrder = shortages.filter((c) => c.purchase_order_id == null) // lines not on a purchase order yet

  // amber while something is still to buy, green once everything is ordered or nothing was short
  const needs = toOrder.length > 0
  const grad = needs ? "from-amber-400 to-orange-500 shadow-orange-500/30" : "from-emerald-400 to-emerald-700 shadow-emerald-600/30"
  const Icon = needs ? ShoppingCart : PackageCheck

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      size="xl"
      title={order ? order.order_number : ""}
      description={order?.approval_remarks || undefined}
      footer={
        <>
          <MktBtn onClick={onClose} data-autofocus>Close</MktBtn>
          {canRaisePurchase && needs && (
            <MktBtn variant="primary" onClick={() => navigate("/purchase", { state: { orderId: order.id } })}>
              <ShoppingCart /> Place order ({toOrder.length})
            </MktBtn>
          )}
        </>
      }
    >
      {order && (
        <div className="space-y-6">
          <motion.div
            key={needs ? "needs" : "done"}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
            className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", grad)}
          >
            <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
            <div className="relative flex items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">
                  {needs ? `${toOrder.length} component${toOrder.length > 1 ? "s" : ""} to order` : shortages.length ? "Everything is ordered" : "Nothing to buy"}
                </p>
                <p className="mt-0.5 text-xs text-white/80">
                  {needs ? "Place the order from the Purchase page." : shortages.length ? "Every short component is on a purchase." : "All stock was available when the order was approved."}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{shortages.length}</p>
                <p className="mt-1 text-[11px] text-white/80">short</p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Raised by</p>
              <UserCell name={order.created_by_name} sub={fmtDateTime(order.created_at)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved by</p>
              <UserCell name={order.approved_by_name} sub={fmtDateTime(order.approved_at)} />
            </div>
          </div>

          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">Ordered products</h3>
            <OrderItems items={order.items} />
          </section>

          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">Short components</h3>
            {shortages.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border px-6 py-10 text-center">
                <span className="mb-3 grid size-11 place-items-center rounded-xl bg-cf-green-soft text-primary ring-1 ring-primary/10">
                  <PackageCheck className="size-5" aria-hidden />
                </span>
                <p className="font-medium">No shortage for this order</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Everything needed was in stock when the Operations Admin approved it.</p>
              </div>
            ) : (
              <ShortLines items={shortages} />
            )}
            {order.purchase_request?.sent_at && (
              <p className="text-xs text-muted-foreground">
                Sent by {order.purchase_request.sent_by_name || "Operations Admin"} on {fmtDateTime(order.purchase_request.sent_at)}
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
