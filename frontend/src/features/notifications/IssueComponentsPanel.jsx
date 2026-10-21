import { useState } from "react"
import { BellRing, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Modal } from "@/components/Modal"
import { useToast } from "@/components/toast"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { useGetNotificationsQuery, useMarkNotificationDoneMutation } from "./notificationsApi"

const EMPTY = []

/*
  Store Manager dashboard: "issue these components to production NOW".
  Each card is one approved order pass; it lists every component and the quantity to hand over.
  The stock was already deducted when the order was approved; "Mark as issued" confirms the physical hand-over.
  Any Store Manager can mark it, the others see it disappear (live).
*/
export default function IssueComponentsPanel() {
  const toast = useToast()
  const { data = EMPTY, isLoading } = useGetNotificationsQuery()
  const [markDone, { isLoading: saving }] = useMarkNotificationDoneMutation()
  const [open, setOpen] = useState(null)

  const pending = data.filter((n) => !n.done)
  const history = data.filter((n) => n.done).slice(0, 5)
  const selected = data.find((n) => n.id === open)

  async function confirm(n) {
    try {
      await markDone(n.id).unwrap()
      toast.success(`Marked as issued: ${n.order_number}`)
      setOpen(null)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the notification")
    }
  }

  if (isLoading || (pending.length === 0 && history.length === 0)) return null

  return (
    <>
      <Card className={`mb-4 overflow-hidden ${pending.length ? "border-amber-400/60" : ""}`}>
        <CardHeader className="items-center">
          <div className="flex items-center gap-2">
            <BellRing className={`size-5 ${pending.length ? "text-amber-500" : "text-muted-foreground"}`} />
            <div>
              <CardTitle>Components to issue now</CardTitle>
              <CardDescription>
                {pending.length ? "Approved orders waiting for you to hand these components to production." : "Nothing to issue right now."}
              </CardDescription>
            </div>
          </div>
          {pending.length > 0 && <Badge variant="warning">{pending.length} pending</Badge>}
        </CardHeader>

        <div className="divide-y">
          {pending.map((n) => (
            <button key={n.id} type="button" onClick={() => setOpen(n.id)} className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{n.order_number} · {n.items.length} component{n.items.length === 1 ? "" : "s"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {n.items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</span>
            </button>
          ))}
          {history.map((n) => (
            <div key={n.id} className="flex items-center justify-between gap-3 px-5 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-500" />{n.order_number} issued{n.done_by_name ? ` by ${n.done_by_name}` : ""}</span>
              <span>{fmtDateTime(n.done_at)}</span>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Modal
          open
          onClose={() => setOpen(null)}
          size="lg"
          title={selected.title}
          description={`Requested ${fmtDateTime(selected.created_at)}${selected.created_by_name ? ` by ${selected.created_by_name}` : ""}`}
          footer={
            <>
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(null)} data-autofocus>Close</Button>
              {!selected.done && <Button size="lg" disabled={saving} onClick={() => confirm(selected)}>Mark as issued</Button>}
            </>
          }
        >
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Part No.</th><th className="px-4 py-2">Component</th><th className="px-4 py-2 text-right">Issue qty</th></tr>
              </thead>
              <tbody className="divide-y">
                {selected.items.map((i) => (
                  <tr key={i.component_id}>
                    <td className="px-4 py-2 font-mono text-xs">{i.sku}</td>
                    <td className="px-4 py-2">{i.name}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmtQty(i.quantity)} {i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  )
}
