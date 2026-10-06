import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, PackageCheck, RefreshCw, Truck } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import StatStrip from "../components/StatStrip"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"


function Status({ value }) {
  const [variant, label] = value === "PACKAGING" ? ["warning", "Packaging"] : value === "DISPATCHED" ? ["info", "Dispatched"] : value === "COMPLETED" ? ["success", "Completed"] : ["neutral", value || "Unknown"]
  return <Badge variant={variant}>{label}</Badge>
}

function Confirm({ item, action, busy, onClose, onConfirm }) {
  if (!item || !action) return null
  const dispatch = action === "DISPATCH"
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl">
        <div className="border-b px-5 py-4">
          <p className="text-lg font-semibold">{dispatch ? "Mark as dispatched?" : "Mark as completed?"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.orderNumber} · {item.productName}</p>
        </div>
        <div className="p-5 text-sm text-muted-foreground">
          {dispatch ? "This moves the finished goods from packaging to dispatched." : "This completes the finished-goods batch and may complete the customer order."}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? "Updating..." : dispatch ? "Mark dispatched" : "Mark completed"}</Button>
        </div>
      </div>
    </div>
  )
}

function ItemCard({ item, onAction }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium tabular-nums">{item.orderNumber || "-"}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.productName || "-"}</p>
          <p className="text-xs text-muted-foreground">{item.productSku || "-"}</p>
        </div>
        <Status value={item.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-center">
        <div className="bg-card py-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quantity</p><p className="font-semibold tabular-nums">{item.quantity ?? 0}</p></div>
        <div className="bg-card py-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Batch</p><p className="font-semibold tabular-nums">#{item.id}</p></div>
      </div>
      <div className="mt-3 flex justify-end border-t pt-3">
        {item.status === "PACKAGING" && <Button size="sm" onClick={() => onAction(item, "DISPATCH")}><Truck /> Mark dispatched</Button>}
        {item.status === "DISPATCHED" && <Button size="sm" onClick={() => onAction(item, "COMPLETE")}><CheckCircle2 /> Mark completed</Button>}
        {item.status === "COMPLETED" && <span className="text-xs text-muted-foreground">No action</span>}
      </div>
    </div>
  )
}

export default function FinishedGoods() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get("/finished-goods")
      setItems(Array.isArray(data) ? data : [])
      setError("")
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to load finished goods.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => !q || `${item.orderNumber} ${item.productName} ${item.productSku} ${item.status}`.toLowerCase().includes(q))
  }, [items, query])

  const counts = useMemo(() => ({
    packaging: items.filter((x) => x.status === "PACKAGING").length,
    dispatched: items.filter((x) => x.status === "DISPATCHED").length,
    completed: items.filter((x) => x.status === "COMPLETED").length,
  }), [items])

  const confirm = (item, nextAction) => { setSelected(item); setAction(nextAction) }
  const close = () => { if (!busy) { setSelected(null); setAction(null) } }

  const submit = async () => {
    if (!selected || !action) return
    try {
      setBusy(true)
      await api.post(`/finished-goods/${selected.id}/${action === "DISPATCH" ? "dispatch" : "complete"}`)
      setSelected(null)
      setAction(null)
      await load()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to update finished goods.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Finished Goods" description="Manage approved batches through packaging and completion.">
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw /> Refresh</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        <StatStrip
          layoutId="finished-goods-status"
          cols="grid-cols-2 md:grid-cols-4"
          items={[
            { key: "packaging", label: "Packaging", value: counts.packaging, tone: "warning" },
            { key: "dispatched", label: "Dispatched", value: counts.dispatched, tone: "info" },
            { key: "completed", label: "Completed", value: counts.completed, tone: "success" },
            { key: "total", label: "Total batches", value: items.length, tone: "neutral" },
          ]}
        />
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5"><SearchBar value={query} onChange={setQuery} placeholder="Search order, product or SKU..." /></div>

        {loading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={query ? "No matching finished goods" : "No finished goods yet"}>
            Approved products will appear here after Quality Control.
          </EmptyState>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>{rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium tabular-nums">{item.orderNumber || "-"}</TableCell>
                    <TableCell>{item.productName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.productSku || "-"}</TableCell>
                    <TableCell className="tabular-nums">{item.quantity ?? 0}</TableCell>
                    <TableCell><Status value={item.status} /></TableCell>
                    <TableCell className="text-right">
                      {item.status === "PACKAGING" && <Button size="sm" onClick={() => confirm(item, "DISPATCH")}><Truck /> Dispatched</Button>}
                      {item.status === "DISPATCHED" && <Button size="sm" onClick={() => confirm(item, "COMPLETE")}><CheckCircle2 /> Completed</Button>}
                      {item.status === "COMPLETED" && <span className="text-sm text-muted-foreground">Done</span>}
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <div className="grid gap-3 p-3 md:hidden">{rows.map((item) => <ItemCard key={item.id} item={item} onAction={confirm} />)}</div>
          </>
        )}
      </Card>

      <Confirm item={selected} action={action} busy={busy} onClose={close} onConfirm={submit} />
    </>
  )
}
