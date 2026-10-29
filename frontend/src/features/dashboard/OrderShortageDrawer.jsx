import { useEffect, useId, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { PackageCheck, ShoppingCart, X } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { SPRING, SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  Right-side details drawer opened from an order card on the Purchase Dashboard.
  It holds the long part: every short component of ONE approved customer order.
    - Component, Short by, linked customer order and the supplier purchase order (PO) status come from the order's
      `purchase_request.items` ([{ component_id, sku, name, unit, quantity (= shortage), purchase_order_id, po_number }]).
    - "Required" is shown only when the line carries it (`required`); the order data does not send it today, so the column is
      left out rather than guessed.
    - "In stock now" is current on-hand stock; reservation accounting is no longer used.
      When a line carries its own `available` (stock when the order was approved) that is shown instead, as "Available".
*/

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
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

const qty = (v, unit) => (v == null || v === "" ? "-" : `${fmtQty(v)}${unit ? ` ${unit}` : ""}`)

function Components({ order, items }) {
  const { data: inventory } = useGetInventoryQuery(undefined, { skip: !order })
  const live = useMemo(() => new Map((Array.isArray(inventory) ? inventory : []).map((r) => [r.component_id, r.available])), [inventory])
  const hasRequired = items.some((c) => c.required != null)
  const ownStock = items.some((c) => c.available != null)
  const stockLabel = ownStock ? "Available" : "In stock now"
  const rows = items.map((c) => ({
    ...c,
    stock: c.available != null ? c.available : live.get(c.component_id),
    sub: [c.sku, order.order_number].filter(Boolean).join(" · "),
  }))

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3! h-8!">Component</TableHead>
              {hasRequired && <TableHead className="px-3! h-8! text-end">Required</TableHead>}
              <TableHead className="px-3! h-8! text-end">{stockLabel}</TableHead>
              <TableHead className="px-3! h-8! text-end">Short by</TableHead>
              <TableHead className="px-3! h-8!">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.component_id}>
                <TableCell className="px-3! py-1.5! whitespace-normal">
                  <p className="font-medium leading-snug">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.sub}</p>
                </TableCell>
                {hasRequired && <TableCell className="px-3! py-1.5! text-end tabular-nums">{qty(c.required, c.unit)}</TableCell>}
                <TableCell className="px-3! py-1.5! text-end tabular-nums">{qty(c.stock, c.unit)}</TableCell>
                <TableCell className="px-3! py-1.5! text-end font-semibold tabular-nums text-destructive">{qty(c.quantity, c.unit)}</TableCell>
                <TableCell className="px-3! py-1.5!"><LineStatus line={c} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {rows.map((c) => (
          <li key={c.component_id} className="rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold leading-snug">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.sub}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1 text-sm font-bold tabular-nums text-destructive">{qty(c.quantity, c.unit)}</span>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {hasRequired && <div><dt className="inline">Required </dt><dd className="inline font-medium tabular-nums text-foreground">{qty(c.required, c.unit)}</dd></div>}
              <div><dt className="inline">{stockLabel} </dt><dd className="inline font-medium tabular-nums text-foreground">{qty(c.stock, c.unit)}</dd></div>
            </dl>
            <div className="mt-2.5 border-t border-dashed pt-2.5"><LineStatus line={c} /></div>
          </li>
        ))}
      </ul>
    </>
  )
}

function Panel({ order, onClose, canRaisePurchase }) {
  const navigate = useNavigate()
  const ref = useRef(null)
  const uid = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl"
  const offscreen = `${rtl ? -100 : 100}%`

  const shortages = order.purchase_request?.items || []
  const toOrder = shortages.filter((c) => c.purchase_order_id == null)
  const needs = toOrder.length > 0
  const grad = needs ? "from-amber-700 to-orange-800 shadow-orange-500/30" : "from-emerald-700 to-emerald-800 shadow-emerald-600/30"
  const Icon = needs ? ShoppingCart : PackageCheck

  // Focus, scroll lock, Escape and Tab trapping while the drawer is mounted (same behaviour as the order drawer).
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
        className="absolute inset-y-0 end-0 flex w-full flex-col bg-card shadow-[-24px_0_64px_-12px_rgba(16,26,23,0.35)] outline-none ring-1 ring-border sm:max-w-xl"
        initial={{ x: offscreen }}
        animate={{ x: 0 }}
        exit={{ x: offscreen }}
        transition={SPRING}
      >
        <div className="flex items-start justify-between gap-4 border-b bg-card px-5 pt-4">
          <div className="min-w-0 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-cf-faint">Customer order · shortage details</p>
            <h2 id={`${uid}-title`} className="mt-0.5 truncate text-[17px] font-bold leading-snug tracking-[-0.2px] tabular-nums">{order.order_number}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Approved {fmtDateTime(order.approved_at)}{order.approved_by_name ? ` by ${order.approved_by_name}` : ""}</p>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <motion.div
            key={needs ? "needs" : "done"}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
            className={cn("relative overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-lg", grad)}
          >
            <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30"><Icon className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">
                  {needs ? `${toOrder.length} component${toOrder.length > 1 ? "s" : ""} to buy` : shortages.length ? "Everything is ordered" : "Nothing to buy"}
                </p>
                <p className="mt-0.5 text-xs text-white/95">
                  {needs ? "Place the supplier purchase order from the Purchase page." : shortages.length ? "Every short component is on a supplier purchase order." : "All stock was available when the order was approved."}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{shortages.length}</p>
                <p className="mt-1 text-[11px] text-white/95">short</p>
              </div>
            </div>
          </motion.div>

          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">Short components</h3>
            {shortages.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3.5 py-4 text-center text-sm text-muted-foreground">No shortage for this order. Everything needed was in stock when it was approved.</p>
            ) : (
              <Components order={order} items={shortages} />
            )}
            {order.purchase_request?.sent_at && (
              <p className="text-xs text-muted-foreground">
                Sent by {order.purchase_request.sent_by_name || "Operations Admin"} on {fmtDateTime(order.purchase_request.sent_at)}
              </p>
            )}
          </section>

          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">Ordered products</h3>
            <OrderItems items={order.items ?? []} />
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-cf-head px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end">
          <MktBtn onClick={onClose}>Close</MktBtn>
          {canRaisePurchase && needs && (
            <MktBtn variant="primary" onClick={() => navigate("/purchase-requests")}>
              <ShoppingCart /> Place order ({toOrder.length})
            </MktBtn>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

/** Pass `order={null}` to keep it closed; the slide-out plays on the way out. */
export default function OrderShortageDrawer({ order, ...props }) {
  if (typeof document === "undefined") return null
  return createPortal(<AnimatePresence>{order && <Panel key="shortage-drawer" order={order} {...props} />}</AnimatePresence>, document.body)
}
