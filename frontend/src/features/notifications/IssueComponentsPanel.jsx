import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, PackageOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { useGetNotificationsQuery, useMarkNotificationDoneMutation, useMarkNotificationReadMutation } from "./notificationsApi"

const EMPTY = { items: [] }
const CHIPS = 3 // components shown on a row before "+N more"

/*
  Store Manager dashboard: "issue these components to production NOW".
  Each row is one approved order pass; "Review & issue" opens every component and the quantity to hand over.
  The stock was already deducted when the order was approved; "Mark as issued" confirms the physical hand-over.
  Any Store Manager can mark it, the others see it move to "Recently issued" (live).
*/
export default function IssueComponentsPanel() {
  const toast = useToast()
  const { data = EMPTY, isLoading } = useGetNotificationsQuery()
  const [markDone, { isLoading: saving }] = useMarkNotificationDoneMutation()
  const [markRead] = useMarkNotificationReadMutation()
  const [open, setOpen] = useState(null)

  // the inbox holds every kind of Store notification; this panel is only the "issue components" tasks
  const issues = data.items.filter((n) => n.type === "ISSUE_COMPONENTS")
  const pending = issues.filter((n) => !n.done)
  const history = issues.filter((n) => n.done).slice(0, 3)
  const selected = issues.find((n) => n.id === open)
  const show = (n) => {
    setOpen(n.id)
    if (!n.read) markRead(n.id)
  }

  async function confirm(n) {
    try {
      await markDone(n.id).unwrap()
      toast.success(`${n.order_number}: components marked as issued`)
      setOpen(null)
    } catch (err) {
      toast.error(errorMessage(err, "Could not mark these components as issued."))
    }
  }

  if (isLoading || issues.length === 0) return null

  return (
    <>
      <Card className="mb-4 overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${pending.length ? "bg-cf-violet-soft text-cf-violet" : "bg-cf-green-soft text-primary"}`}>
            {pending.length ? <PackageOpen className="size-5" /> : <CheckCircle2 className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight">Components to issue</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pending.length ? "Approved orders waiting for you to hand components over to production." : "All caught up. Nothing to hand over right now."}
            </p>
          </div>
          {pending.length > 0 && (
            <span className="shrink-0 rounded-full bg-cf-violet-soft px-2.5 py-1 text-xs font-bold text-cf-violet tabular-nums">
              {pending.length} pending
            </span>
          )}
        </div>

        {pending.length > 0 && (
          <ul className="divide-y">
            {pending.map((n) => (
              <PendingRow key={n.id} n={n} onOpen={() => show(n)} />
            ))}
          </ul>
        )}

        {history.length > 0 && (
          <div className={pending.length ? "border-t bg-muted/40" : "bg-muted/40"}>
            <p className="px-5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.6px] text-cf-faint">Recently issued</p>
            <ul className="pb-2">
              {history.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => show(n)} className="flex w-full items-center gap-2.5 px-5 py-2 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:bg-muted">
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-foreground">{n.order_number}</span>
                      <span className="text-muted-foreground"> · {n.items.length} component{n.items.length === 1 ? "" : "s"}{n.done_by_name ? ` · by ${n.done_by_name}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{timeAgo(n.done_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {selected && <IssueModal n={selected} saving={saving} onClose={() => setOpen(null)} onConfirm={() => confirm(selected)} />}
    </>
  )
}

function PendingRow({ n, onOpen }) {
  const units = n.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
  const more = n.items.length - CHIPS

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-bold tabular-nums">{n.order_number}</p>
          <p className="text-xs text-muted-foreground">
            {n.items.length} component{n.items.length === 1 ? "" : "s"} · {fmtQty(units)} units · {timeAgo(n.created_at)}
            {n.created_by_name ? ` by ${n.created_by_name}` : ""}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {n.items.slice(0, CHIPS).map((i) => (
            <span key={i.component_id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-[11px]">
              <span className="truncate font-medium">{i.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">× {fmtQty(i.quantity)}</span>
            </span>
          ))}
          {more > 0 && <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">+{more} more</span>}
        </div>
      </div>
      <Button onClick={onOpen} className="h-10 w-full shrink-0 sm:h-9 sm:w-auto">
        Review &amp; issue <ArrowRight className="size-4" />
      </Button>
    </li>
  )
}

function IssueModal({ n, saving, onClose, onConfirm }) {
  const units = n.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
  const facts = [
    ["Order", n.order_number],
    ["Components", n.items.length],
    ["Total units", fmtQty(units)],
    [n.done ? "Issued" : "Requested", fmtDateTime(n.done ? n.done_at : n.created_at)],
  ]

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="lg"
      title={n.done ? `Issued for order ${n.order_number}` : `Issue components for ${n.order_number}`}
      description={
        n.done
          ? `Handed over${n.done_by_name ? ` by ${n.done_by_name}` : ""}.`
          : "Stock was already deducted when the order was approved. Hand these over to production, then confirm."
      }
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={saving} data-autofocus>
            {n.done ? "Close" : "Cancel"}
          </Button>
          {!n.done && (
            <Button size="lg" disabled={saving} onClick={onConfirm}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Mark as issued
            </Button>
          )}
        </>
      }
    >
      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="bg-card px-3.5 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Part No.</th>
              <th className="px-4 py-2.5 font-semibold">Component</th>
              <th className="px-4 py-2.5 text-right font-semibold">Issue qty</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {n.items.map((i) => (
              <tr key={i.component_id} className="transition-colors hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{i.sku || "-"}</td>
                <td className="px-4 py-2.5 font-medium">{i.name || "-"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums">
                  {fmtQty(i.quantity)} <span className="text-xs font-medium text-muted-foreground">{i.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
