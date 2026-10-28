/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react"
import { motion } from "motion/react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, Download, ShoppingCart } from "lucide-react"
import TabbedDrawer, { Fact } from "@/components/TabbedDrawer"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { plural } from "@/features/marketing-orders/orderParts"
import { PurchaseStatusPill, buyStageOf, buyState, openLinesOf } from "@/features/purchasing/purchaseKit"
import { downloadPurchaseList } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { BuyStatePill } from "@/features/purchasing/purchaseKit"

/*
  Right-side drawer for ONE approved order (Purchase Manager), same shell as the Marketing / Operations drawer.
    Overview            what the Operations Admin approved, and how much is still to buy
    Products            the products of the order
    Components to buy   the list Operations sent, line by line (To order / Ordered · PO), with an Excel download
    Purchases           the purchases already placed for this order (click one to open it on the Purchase page)
*/

export const APPROVED_TABS = [
  { id: "overview", label: "Overview" },
  { id: "products", label: "Products" },
  { id: "components", label: "Components to buy" },
  { id: "purchases", label: "Purchases" },
]
export const isApprovedTab = (v) => APPROVED_TABS.some((t) => t.id === v)

const unitsOf = (items = []) => items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
const LINE_PILL = { toOrder: "bg-amber-50 text-amber-800 ring-amber-200", ordered: "bg-emerald-50 text-emerald-800 ring-emerald-200" }

function LineStatus({ line }) {
  const toOrder = line.purchase_order_id == null
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", toOrder ? LINE_PILL.toOrder : LINE_PILL.ordered)}>
      {toOrder ? "To order" : `Ordered · ${line.po_number}`}
    </span>
  )
}

/* The components the Operations Admin asked Purchase to buy for this order: table from `sm`, cards on a phone. */
function ComponentsToBuy({ items }) {
  // live free stock (on hand - reserved), when the inventory list can be read: helps to see how short each line is
  const { data: inventory } = useGetInventoryQuery()
  const live = useMemo(() => new Map((Array.isArray(inventory) ? inventory : []).map((r) => [r.component_id, r.available])), [inventory])
  const stock = (c) => (live.has(c.component_id) ? `${fmtQty(live.get(c.component_id))}${c.unit ? ` ${c.unit}` : ""}` : null)
  const hasStock = live.size > 0
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              {hasStock && <TableHead className="text-right">In stock now</TableHead>}
              <TableHead className="text-right">To buy</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.component_id}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{c.name}</p>
                  {c.sku && <p className="text-xs text-muted-foreground">{c.sku}</p>}
                </TableCell>
                {hasStock && <TableCell className="text-right tabular-nums">{stock(c) ?? "-"}</TableCell>}
                <TableCell className="text-right font-semibold tabular-nums">{fmtQty(c.quantity)} {c.unit}</TableCell>
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
                {c.sku && <p className="mt-0.5 text-xs text-muted-foreground">{c.sku}</p>}
              </div>
              <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">{fmtQty(c.quantity)} {c.unit}</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed pt-2.5">
              <LineStatus line={c} />
              {hasStock && <span className="text-xs text-muted-foreground">In stock now <span className="font-medium tabular-nums text-foreground">{stock(c) ?? "-"}</span></span>}
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </>
  )
}

function OverviewTab({ order }) {
  const stage = buyStageOf(buyState(order))
  const Icon = stage.icon
  const toOrder = openLinesOf(order).length
  const units = unitsOf(order.items)
  return (
    <div className="space-y-5">
      <motion.div
        key={stage.status}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
        className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", stage.s.grad, stage.s.glow)}
      >
        <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
        <div className="relative flex items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.status === "TO_ORDER" ? `${plural(toOrder, "component")} to order` : stage.label}</p>
            <p className="mt-0.5 text-xs text-white/95">{stage.hint}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(units)}</p>
            <p className="mt-1 text-[11px] text-white/95">units</p>
          </div>
        </div>
      </motion.div>

      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Raised by">{order.created_by_name || "-"}</Fact>
        <Fact label="Raised on">{fmtDateTime(order.created_at)}</Fact>
        <Fact label="Approved by">{order.approved_by_name || "-"}</Fact>
        <Fact label="Approved on">{fmtDateTime(order.approved_at)}</Fact>
        <Fact label="Products">{plural(order.items?.length ?? 0, "product")}</Fact>
        <Fact label="Customer wants it by">{order.required_by_date || <span className="font-normal text-muted-foreground">Not set</span>}</Fact>
        <Fact label="Planned delivery">{order.estimated_delivery_date || <span className="font-normal text-muted-foreground">Not set</span>}</Fact>
      </dl>

      {order.approval_remarks && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Operations remarks</h3>
          <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm leading-snug">{order.approval_remarks}</p>
        </section>
      )}
    </div>
  )
}

function PurchasesTab({ purchases, onOpenPurchase }) {
  if (purchases.length === 0) {
    return <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No purchase has been placed for this order yet.</p>
  }
  return (
    <ul className="space-y-2">
      {purchases.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onOpenPurchase(p)} className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-3 text-left outline-none transition-colors hover:border-[#CDD2DA] focus-visible:ring-2 focus-visible:ring-ring/60">
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold tabular-nums">{p.po_number}</p>
              <p className="truncate text-xs text-muted-foreground">{p.supplier} · {plural(p.totals?.lines ?? p.items?.length ?? 0, "item")} · {fmtQty(p.totals?.ordered ?? 0)} ordered</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PurchaseStatusPill value={p.status} short />
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** `order={null}` keeps it closed. `purchases` = every purchase (the drawer picks the ones for this order). */
export default function ApprovedOrderDrawer({ order, purchases = [], canRaise, tab, onTab, onClose }) {
  const navigate = useNavigate()
  const active = isApprovedTab(tab) ? tab : "overview"
  const lines = order?.purchase_request?.items ?? []
  const toOrder = order ? openLinesOf(order).length : 0
  const mine = order ? purchases.filter((p) => p.order_number === order.order_number) : []
  const tabs = APPROVED_TABS.map((t) =>
    t.id === "products" ? { ...t, badge: order?.items?.length ?? 0 }
    : t.id === "components" && lines.length ? { ...t, badge: lines.length }
    : t.id === "purchases" && mine.length ? { ...t, badge: mine.length }
    : t
  )

  return (
    <TabbedDrawer
      open={!!order}
      eyebrow="Approved order"
      title={order ? order.order_number : ""}
      subtitle={order && (
        <>
          <BuyStatePill order={order} />
          <span>{plural(order.items?.length ?? 0, "product")} · {fmtQty(unitsOf(order.items))} units</span>
        </>
      )}
      tabs={tabs}
      tab={active}
      onTab={onTab}
      onClose={onClose}
      footerStart={order && lines.length > 0 ? (
        <MktBtn className="sm:me-auto" onClick={() => downloadPurchaseList(order, lines)}><Download /> Excel</MktBtn>
      ) : null}
      actions={order && canRaise && toOrder > 0 ? (
        <MktBtn variant="primary" onClick={() => navigate("/purchase-requests")}><ShoppingCart /> Place order ({toOrder})</MktBtn>
      ) : null}
      tabContent={order ? {
        overview: <OverviewTab order={order} />,
        products: <OrderItems items={order.items ?? []} />,
        components: lines.length ? <ComponentsToBuy items={lines} /> : <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">Everything for this order was in stock, nothing to buy.</p>,
        purchases: <PurchasesTab purchases={mine} onOpenPurchase={(p) => { onClose(); navigate(`/purchase?purchase=${p.id}`) }} />,
      } : undefined}
    />
  )
}
