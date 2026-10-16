import { motion } from "motion/react"
import { Check, Download, X } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING, SPRING_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { PurchaseStatusPill, purchaseStageOf } from "@/features/purchasing/purchaseKit"
import { WAS_INSPECTED, downloadRejected, qtyWithUnit, rejectedLines } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  Popup for ONE purchase, in the Marketing Manager look: a coloured status banner, the journey of the goods as a
  timeline (who did what, and when), then the component lines (a table from `sm` up, cards on a phone).
  The Purchase page and the Purchase dashboard use this one. The shared PurchaseDetailModal (IQC, store) is untouched.
*/

const MARK = {
  done: "bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-sm",
  current: "border-2 border-primary bg-card text-primary",
  todo: "border-2 border-border bg-card text-transparent",
  fail: "bg-gradient-to-br from-rose-400 to-red-600 text-white shadow-sm",
}

/* Vertical timeline: placed, received, sent to IQC, inspected, accepted by the store. */
function PurchaseTimeline({ purchase: p }) {
  const rejected = p.status === "REJECTED"
  const rows = [
    { title: "Order placed", who: p.created_by_name, at: p.created_at, wait: "" },
    { title: "Received", who: p.received_by_name, at: p.received_at, wait: "Waiting for the goods to arrive" },
    { title: "Sent to IQC", who: p.sent_to_iqc_by_name, at: p.sent_to_iqc_at, wait: "Not sent yet" },
    { title: "Inspected by IQC", who: p.iqc_by_name, at: p.iqc_at, wait: "Waiting for inspection" },
    { title: "Accepted by store", who: p.accepted_by_name, at: p.accepted_at, wait: "Waiting for the store" },
  ]

  let currentTaken = false
  const states = rows.map((r, i) => {
    if (rejected && i === 3) return "fail"
    if (rejected && i === 4) return "todo"
    if (i === 0 || r.who || r.at) return "done"
    if (!currentTaken) { currentTaken = true; return "current" }
    return "todo"
  })

  return (
    <ol>
      {rows.map((r, i) => {
        const state = states[i]
        const last = i === rows.length - 1
        const title = state === "fail" ? "Rejected by IQC" : r.title
        const sub = state === "done" || state === "fail" ? `${r.who || "-"} · ${fmtDateTime(r.at)}` : state === "todo" && rejected ? "Stopped at IQC" : r.wait
        return (
          <motion.li
            key={r.title}
            className="relative flex gap-3.5 pb-5 last:pb-0"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING, delay: 0.06 * i }}
          >
            {!last && <span aria-hidden className={cn("absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 rounded-full", state === "done" ? "bg-emerald-300" : "bg-border")} />}
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", MARK[state])}>
              {state === "done" && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {state === "fail" && <X className="size-4" strokeWidth={3} aria-hidden />}
              {state === "current" && <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", state === "todo" && "text-muted-foreground", state === "fail" && "text-destructive")}>{title}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

const DECISION = {
  REJECTED: { label: "Rejected", cls: "bg-rose-50 text-rose-800 ring-rose-200", Icon: X },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", Icon: Check },
}

function Decision({ value }) {
  const d = value === "REJECTED" ? DECISION.REJECTED : DECISION.APPROVED
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", d.cls)}>
      <d.Icon className="size-3.5" strokeWidth={3} aria-hidden /> {d.label}
    </span>
  )
}

/* The lines of one purchase. Received and the IQC decision stay hidden until IQC has inspected it. */
function Lines({ items, inspected }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              {inspected && <TableHead className="text-right">Received</TableHead>}
              {inspected && <TableHead>IQC decision</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.sku}{it.remarks ? ` · ${it.remarks}` : ""}</p>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{qtyWithUnit(it.quantity_ordered, it.unit)}</TableCell>
                {inspected && <TableCell className="text-right tabular-nums">{qtyWithUnit(it.quantity_received, it.unit)}</TableCell>}
                {inspected && <TableCell><Decision value={it.iqc_decision} /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2 sm:hidden">
        {items.map((it) => (
          <motion.li key={it.id} variants={rise} className="rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold leading-snug">{it.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{it.sku}{it.remarks ? ` · ${it.remarks}` : ""}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">{qtyWithUnit(it.quantity_ordered, it.unit)}</span>
            </div>
            {inspected && (
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed pt-2.5 text-xs text-muted-foreground">
                <span>Received <span className="font-bold tabular-nums text-foreground">{qtyWithUnit(it.quantity_received, it.unit)}</span></span>
                <Decision value={it.iqc_decision} />
              </div>
            )}
          </motion.li>
        ))}
      </motion.ul>
    </>
  )
}

export default function PurchaseDetailSheet({ purchase, onClose }) {
  if (!purchase) return null
  const stage = purchaseStageOf(purchase.status)
  const Icon = stage?.icon
  const inspected = WAS_INSPECTED(purchase.status)
  const rejected = rejectedLines(purchase)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${purchase.po_number} · ${purchase.supplier}`}
      description={[purchase.order_number && `For order ${purchase.order_number}`, purchase.notes].filter(Boolean).join(" · ") || undefined}
      footer={
        <>
          {rejected.length > 0 && (
            <MktBtn className="sm:mr-auto" onClick={() => downloadRejected(purchase)}>
              <Download /> Rejected components (Excel)
            </MktBtn>
          )}
          <MktBtn onClick={onClose} data-autofocus>Close</MktBtn>
        </>
      }
    >
      <div className="space-y-6">
        {stage && (
          // key = status, so the banner re-plays its entrance (and changes colour) when the purchase moves on
          <motion.div
            key={purchase.status}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
            className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", stage.s.grad, stage.s.glow)}
          >
            <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
            <div className="relative flex items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{stage.label}</p>
                <p className="mt-0.5 text-xs text-white/80">{stage.hint}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(purchase.totals?.ordered ?? 0)}</p>
                <p className="mt-1 text-[11px] text-white/80">ordered</p>
              </div>
            </div>
          </motion.div>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold">Progress</h3>
          <PurchaseTimeline purchase={purchase} />
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Components</h3>
            <PurchaseStatusPill value={purchase.status} short />
          </div>
          <Lines items={purchase.items} inspected={inspected} />
        </section>

        {purchase.iqc_remarks && (
          <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-sm leading-snug text-violet-900">
            <span className="font-semibold">IQC remarks: </span>{purchase.iqc_remarks}
          </p>
        )}
      </div>
    </Modal>
  )
}
