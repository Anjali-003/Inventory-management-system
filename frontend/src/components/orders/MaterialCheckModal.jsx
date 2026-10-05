import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Notice } from "../feedback"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { errorMessage } from "../../lib/stock"
import { cn } from "../../lib/utils"

function Verdict({ ok }) {
  return (
    <div className={cn("rounded-lg border p-4", ok ? "border-success/25 bg-success/10 text-success" : "border-destructive/25 bg-destructive/10 text-destructive")}>
      <p className="font-semibold">{ok ? "Ready for production" : "Material shortage"}</p>
      <p className="mt-0.5 text-sm opacity-90">
        {ok ? "All required materials are available for the full order." : "Some required materials are not available in sufficient quantity."}
      </p>
    </div>
  )
}

function Materials({ materials }) {
  if (!materials?.length) return <p className="py-6 text-center text-sm text-muted-foreground">No material information available.</p>
  return (
    <>
      {/* phones: one card per component, no horizontal scroll */}
      <ul className="divide-y rounded-lg border md:hidden">
        {materials.map((m) => {
          const short = Number(m.shortage) > 0
          return (
            <li key={m.componentId} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-snug">{m.name}</span>
                <Badge variant={short ? "danger" : "success"}>{short ? "Short" : "Covered"}</Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                {[["Required", m.required], ["Available", m.available], ["Shortage", m.shortage]].map(([l, v]) => (
                  <div key={l} className="rounded-md bg-muted/60 py-1.5">
                    <dt className="text-muted-foreground">{l}</dt>
                    <dd className={cn("font-semibold tabular-nums", l === "Shortage" && short && "text-destructive")}>{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Shortage</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m) => {
              const short = Number(m.shortage) > 0
              return (
                <TableRow key={m.componentId}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.required}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.available}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", short && "font-medium text-destructive")}>{m.shortage}</TableCell>
                  <TableCell><Badge variant={short ? "danger" : "success"}>{short ? "Short" : "Covered"}</Badge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

// Mounted only while an order is selected (see Orders.jsx), so state resets per order.
export default function MaterialCheckModal({ order, onClose, onStart }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    api.get(`/orders/${order.id}/material-check`)
      .then((r) => !stale && setResult(r.data))
      .catch((e) => !stale && setError(errorMessage(e, "Failed to check materials")))
      .finally(() => !stale && setLoading(false))
    return () => { stale = true }
  }, [order])

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Material availability"
      description="Required components compared with current available inventory."
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Close</Button>
          <Button type="button" size="lg" onClick={() => onStart(order)}>Start production</Button>
        </>
      }
    >
      <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="min-w-0">
              <p className="font-semibold tabular-nums">{order.order_number}</p>
              <p className="truncate text-sm text-muted-foreground">{order.product_name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Order qty</p>
              <p className="text-lg font-semibold tabular-nums">{Number(order.quantity)}</p>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking material availability...
            </div>
          )}
          {error && <Notice>{error}</Notice>}
          {result && (
            <>
              <Verdict ok={result.canProduce} />
              <Materials materials={result.materials} />
            </>
          )}
      </div>
    </Modal>
  )
}
