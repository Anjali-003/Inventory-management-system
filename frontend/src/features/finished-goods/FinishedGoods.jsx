import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CheckCircle2, PackageCheck, RefreshCw, Truck } from "lucide-react"
import { finishedGoodsService } from "@/features/finished-goods/finishedGoodsService"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { errorMessage } from "@/lib/stock"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import UserCell from "@/components/UserCell"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"


// the person behind the latest step of this batch (approved -> dispatched -> completed)
const actorOf = (item) =>
  item.status === "COMPLETED" && item.completedByName ? { name: item.completedByName, sub: "Completed" }
  : item.dispatchedByName && item.status !== "PACKAGING" ? { name: item.dispatchedByName, sub: "Dispatched" }
  : { name: item.createdByName, sub: item.createdByName ? "Added" : null }

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

function ItemCard({ item, onAction, editable }) {
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
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Last action</span>
        <UserCell {...actorOf(item)} className="text-foreground" />
      </div>
      <div className="mt-3 flex justify-end border-t pt-3">
        {editable && item.status === "PACKAGING" && <Button size="sm" onClick={() => onAction(item, "DISPATCH")}><Truck /> Mark dispatched</Button>}
        {editable && item.status === "DISPATCHED" && <Button size="sm" onClick={() => onAction(item, "COMPLETE")}><CheckCircle2 /> Mark completed</Button>}
        {(!editable || item.status === "COMPLETED") && <span className="text-xs text-muted-foreground">{editable ? "No action" : "View only"}</span>}
      </div>
    </div>
  )
}

export default function FinishedGoods() {
  const { canEdit } = usePermissions()
  const editable = canEdit("finishedGoods") // false = read-only role: no dispatch / complete
  // the list is cached by RTK Query and refetched live (see realtime/LiveSync.jsx)
  const { data: items = [], isLoading: loading, error: loadError, refetch } = useGetFinishedGoodsQuery()
  const [actionError, setError] = useState("")
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load finished goods.") : "")
  const [query, setQuery] = useState("")
  const [searchParams] = useSearchParams() // /finished-goods?status=PACKAGING (from the Store dashboard)
  const [status, setStatus] = useState(() => (["PACKAGING", "DISPATCHED", "COMPLETED"].includes(searchParams.get("status")) ? searchParams.get("status") : "all")) // set by clicking a figure in the strip
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError("")
    await refetch()
  }, [refetch])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => (status === "all" || item.status === status) && (!q || `${item.orderNumber} ${item.productName} ${item.productSku} ${item.status} ${item.createdByName || ""} ${item.dispatchedByName || ""} ${item.completedByName || ""}`.toLowerCase().includes(q)))
  }, [items, query, status])

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
      await (action === "DISPATCH" ? finishedGoodsService.dispatch(selected.id) : finishedGoodsService.complete(selected.id))
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
        <StatStrip dropdown="Filter finished goods by status"
          layoutId="finished-goods-status"
          cols="grid-cols-2 md:grid-cols-4"
          items={[
            { key: "packaging", label: "In packaging", value: counts.packaging, tone: "warning", active: status === "PACKAGING", onClick: () => setStatus(status === "PACKAGING" ? "all" : "PACKAGING") },
            { key: "dispatched", label: "Dispatched", value: counts.dispatched, tone: "info", active: status === "DISPATCHED", onClick: () => setStatus(status === "DISPATCHED" ? "all" : "DISPATCHED") },
            { key: "completed", label: "Completed", value: counts.completed, tone: "success", active: status === "COMPLETED", onClick: () => setStatus(status === "COMPLETED" ? "all" : "COMPLETED") },
            { key: "total", label: "Total batches", value: items.length, tone: "neutral", active: status === "all", onClick: () => setStatus("all") },
          ]}
        />
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5"><SearchBar value={query} onChange={setQuery} placeholder="Search order, product, SKU or person..." /></div>

        {loading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={query || status !== "all" ? "No matching finished goods" : "No finished goods yet"}>
            Approved products will appear here after Quality Control.
          </EmptyState>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Last action by</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>{rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium tabular-nums">{item.orderNumber || "-"}</TableCell>
                    <TableCell>{item.productName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.productSku || "-"}</TableCell>
                    <TableCell className="tabular-nums">{item.quantity ?? 0}</TableCell>
                    <TableCell><Status value={item.status} /></TableCell>
                    <TableCell className="min-w-40"><UserCell {...actorOf(item)} /></TableCell>
                    <TableCell className="text-right">
                      {editable && item.status === "PACKAGING" && <Button size="sm" onClick={() => confirm(item, "DISPATCH")}><Truck /> Dispatched</Button>}
                      {editable && item.status === "DISPATCHED" && <Button size="sm" onClick={() => confirm(item, "COMPLETE")}><CheckCircle2 /> Completed</Button>}
                      {item.status === "COMPLETED" && <span className="text-sm text-muted-foreground">Done</span>}
                      {!editable && item.status !== "COMPLETED" && <span className="text-sm text-muted-foreground">View only</span>}
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <div className="grid gap-3 p-3 md:hidden">{rows.map((item) => <ItemCard key={item.id} item={item} onAction={confirm} editable={editable} />)}</div>
          </>
        )}
      </Card>

      {editable && <Confirm item={selected} action={action} busy={busy} onClose={close} onConfirm={submit} />}
    </>
  )
}
