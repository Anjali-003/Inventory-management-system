/* eslint-disable react-refresh/only-export-components */
import { motion } from "motion/react"
import { Clock3, Download } from "lucide-react"
import TabbedDrawer, { Fact } from "@/components/TabbedDrawer"
import { MktBtn, OrderItems } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { plural } from "@/features/marketing-orders/orderParts"
import { PurchaseStatusPill, PurchaseSteps, StepButton, buyState, buyStageOf, purchaseStageOf } from "@/features/purchasing/purchaseKit"
import { WAS_INSPECTED, downloadRejected, qtyWithUnit, rejectedLines } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Lines, PurchaseTimeline } from "./PurchaseDetail"

/*
  Right-side drawer for ONE purchase (the Purchase Manager's own page and dashboard use it), built like the
  Marketing / Operations order drawer: a header, tabs, one section per tab, actions in the footer.

    Overview     status banner, the four steps, who / when / supplier / notes
    Components   every line with ordered / received / IQC decision, and the totals
    Timeline     the journey of the goods, step by step
    IQC & Store  what IQC decided (remarks, rejected lines + Excel) and when the store took it in
    Order        the customer order this purchase was raised for (only when the caller passes it)

  Everything comes from the purchase row the list already loaded; nothing is invented.
*/

export const PURCHASE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "components", label: "Components" },
  { id: "timeline", label: "Timeline" },
  { id: "iqc", label: "IQC & Store" },
]
const ORDER_TAB = { id: "order", label: "Order" }

export const isPurchaseTab = (v) => v === ORDER_TAB.id || PURCHASE_TABS.some((t) => t.id === v)

const when = (name, at) => [name, at ? fmtDateTime(at) : ""].filter(Boolean).join(" · ")

/* ---------------------------------------------------------------- Overview */

function OverviewTab({ purchase: p }) {
  const stage = purchaseStageOf(p.status)
  const Icon = stage?.icon
  return (
    <div className="space-y-5">
      {stage && (
        <motion.div
          key={p.status}
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
              <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.label}</p>
              <p className="mt-0.5 text-xs text-white/80">{stage.hint}</p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(p.totals?.ordered ?? 0)}</p>
              <p className="mt-1 text-[11px] text-white/80">ordered</p>
            </div>
          </div>
        </motion.div>
      )}

      <PurchaseSteps status={p.status} />

      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Supplier">{p.supplier || "-"}</Fact>
        <Fact label="For order">{p.order_number || <span className="text-muted-foreground">-</span>}</Fact>
        <Fact label="Placed by">{p.created_by_name || "-"}</Fact>
        <Fact label="Placed on">{fmtDateTime(p.created_at)}</Fact>
        <Fact label="Components">{plural(p.totals?.lines ?? p.items?.length ?? 0, "line")}</Fact>
        <Fact label="Received on">{p.received_at ? fmtDateTime(p.received_at) : <span className="font-normal text-muted-foreground">Not yet</span>}</Fact>
      </dl>

      {p.notes && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm leading-snug">{p.notes}</p>
        </section>
      )}

      {p.iqc_remarks && (
        <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-sm leading-snug text-violet-900">
          <span className="font-semibold">IQC remarks: </span>{p.iqc_remarks}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Components */

function ComponentsTab({ purchase: p }) {
  const inspected = WAS_INSPECTED(p.status)
  const items = p.items ?? []
  const ordered = items.reduce((s, i) => s + Number(i.quantity_ordered || 0), 0)
  const received = items.reduce((s, i) => s + Number(i.quantity_received || 0), 0)
  const rejected = rejectedLines(p).length
  const cards = [["Ordered", fmtQty(ordered)], ...(inspected ? [["Received", fmtQty(received)], ["Rejected lines", rejected]] : [])]
  return (
    <div className="space-y-4">
      <div className={cn("grid gap-2.5", cards.length === 3 ? "grid-cols-3" : "grid-cols-1")}>
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">{label}</p>
            <p className="mt-1 text-lg font-bold leading-none tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <Lines items={items} inspected={inspected} />
      {!inspected && <p className="text-xs text-muted-foreground">Received quantities and the IQC decision appear here once IQC has inspected this purchase.</p>}
    </div>
  )
}

/* ------------------------------------------------------------ IQC & Store */

function IqcTab({ purchase: p }) {
  const inspected = WAS_INSPECTED(p.status)
  const rejected = rejectedLines(p)
  if (!inspected) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
        <Clock3 className="size-4 motion-safe:animate-pulse" aria-hidden />
        {p.status === "PENDING_IQC" ? "With IQC, waiting for inspection." : "Not at IQC yet. It reaches IQC after you send it."}
      </p>
    )
  }
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Inspected by">{p.iqc_by_name || "-"}</Fact>
        <Fact label="Inspected on">{fmtDateTime(p.iqc_at)}</Fact>
        <Fact label="Accepted by store">{p.accepted_by_name || <span className="font-normal text-muted-foreground">Not yet</span>}</Fact>
        <Fact label="Accepted on">{p.accepted_at ? fmtDateTime(p.accepted_at) : <span className="font-normal text-muted-foreground">Not yet</span>}</Fact>
      </dl>

      {p.iqc_remarks && (
        <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-sm leading-snug text-violet-900">
          <span className="font-semibold">IQC remarks: </span>{p.iqc_remarks}
        </p>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Rejected components</h3>
          {rejected.length > 0 && <MktBtn size="sm" onClick={() => downloadRejected(p)}><Download /> Excel</MktBtn>}
        </div>
        {rejected.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">IQC rejected nothing in this purchase.</p>
        ) : (
          <ul className="space-y-2">
            {rejected.map((it) => (
              <li key={it.id} className="rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold leading-snug">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.sku}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-rose-800">{qtyWithUnit(it.quantity_received, it.unit)} of {qtyWithUnit(it.quantity_ordered, it.unit)}</span>
                </div>
                <p className="mt-2 text-sm leading-snug text-rose-900"><span className="font-semibold">Reason: </span>{it.remarks || p.iqc_remarks || "No reason given"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ Order */

function OrderTab({ order }) {
  const stage = buyStageOf(buyState(order))
  const lines = order.purchase_request?.items ?? []
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Order">{order.order_number}</Fact>
        <Fact label="Components">{stage ? stage.label : "-"}</Fact>
        <Fact label="Raised by">{order.created_by_name || "-"}</Fact>
        <Fact label="Approved by">{when(order.approved_by_name, order.approved_at) || "-"}</Fact>
      </dl>
      {order.estimated_delivery_date && <Fact label="Estimated delivery">{order.estimated_delivery_date}</Fact>}
      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold">Products in this order</h3>
        <OrderItems items={order.items ?? []} />
      </section>
      {lines.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Components sent to Purchase</h3>
          <ul className="divide-y rounded-xl border">
            {lines.map((l) => (
              <li key={l.component_id} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                <span className="min-w-0 break-words">{l.name}</span>
                <span className="shrink-0 font-medium tabular-nums">{qtyWithUnit(l.quantity, l.unit)} <span className="text-xs text-muted-foreground">· {l.purchase_order_id == null ? "To order" : l.po_number}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ drawer */

/** `purchase={null}` keeps it closed. `order` (optional) is the approved customer order this purchase belongs to. */
export default function PurchaseDrawer({ purchase, order, tab, onTab, onClose, editable, busy, onReceive, onSendIqc }) {
  const tabs = order ? [...PURCHASE_TABS, ORDER_TAB] : PURCHASE_TABS
  const active = tabs.some((t) => t.id === tab) ? tab : "overview"
  const p = purchase
  const rejected = p ? rejectedLines(p).length : 0
  const withBadge = tabs.map((t) => (t.id === "components" && p ? { ...t, badge: p.items?.length ?? 0 } : t.id === "iqc" && rejected ? { ...t, badge: rejected } : t))
  const canStep = !!p && editable && (p.status === "ORDER_PLACED" || p.status === "RECEIVED")

  return (
    <TabbedDrawer
      open={!!p}
      eyebrow="Purchase details"
      title={p ? p.po_number : ""}
      subtitle={p && (
        <>
          <PurchaseStatusPill value={p.status} short />
          <span>{p.supplier}{p.order_number ? ` · for ${p.order_number}` : ""}</span>
        </>
      )}
      tabs={withBadge}
      tab={active}
      onTab={onTab}
      onClose={onClose}
      tabContent={p ? {
        overview: <OverviewTab purchase={p} />,
        components: <ComponentsTab purchase={p} />,
        timeline: <PurchaseTimeline purchase={p} />,
        iqc: <IqcTab purchase={p} />,
        order: order ? <OrderTab order={order} /> : null,
      } : undefined}
      actions={canStep ? <StepButton purchase={p} editable={editable} busy={busy} onReceive={onReceive} onSendIqc={onSendIqc} /> : null}
    />
  )
}
