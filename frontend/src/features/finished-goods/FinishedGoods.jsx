import { useCallback, useMemo, useState } from "react"
import { CheckCircle2, PackageCheck, RefreshCw, Truck, Package, CircleCheck } from "lucide-react"
import { finishedGoodsService } from "@/features/finished-goods/finishedGoodsService"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { errorMessage } from "@/lib/stock"
import { HeroButton, MktHero, SearchField, StageTile, TileGrid, StageChips } from "@/features/marketing-orders/mktKit"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ListViewControls from "@/components/ListViewControls"
import { isWithinDateRange, recordTimestamp, uniqueStringOptions } from "@/lib/listViewUtils"
import { Badge } from "@/components/ui/badge"
import UserCell from "@/components/UserCell"
import { usePermissions } from "@/features/auth/usePermissions"


// the person behind the latest step of this batch (approved -> dispatched -> completed)
const actorOf = (item) =>
  item.status === "COMPLETED" && item.completedByName ? { name: item.completedByName, sub: "Completed" }
  : item.dispatchedByName && item.status !== "PACKAGING" ? { name: item.dispatchedByName, sub: "Dispatched" }
  : { name: item.createdByName, sub: item.createdByName ? "Added" : null }

function nextStepText(status) {
  if (status === "PACKAGING") return "Next: mark dispatched when packaging is finished."
  if (status === "DISPATCHED") return "Next: confirm completion after handover."
  if (status === "COMPLETED") return "All Finished Goods steps are complete."
  return "Check the batch status before taking action."
}

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
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#dce5e0] bg-white p-4 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.04)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-medium tabular-nums">{item.orderNumber || "-"}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.productName || "-"}</p>
          <p className="text-xs text-muted-foreground">{item.productSku || "-"}</p>
        </div>
        <Status value={item.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-center">
        <div className="bg-card py-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quantity</p><p className="font-semibold tabular-nums">{item.quantity ?? 0}</p></div>
        <div className="bg-card py-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Batch</p><p className="font-semibold tabular-nums">#{item.id}</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-[#dce5e0] bg-slate-50/80 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">What happens next</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">{nextStepText(item.status)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Last action</span>
        <UserCell {...actorOf(item)} className="text-foreground" />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[#e7eee9] pt-3">
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
  const [status, setStatus] = useState("all") // set by clicking a figure in the strip
  const [productFilter, setProductFilter] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [view, setView] = useState("table")
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError("")
    await refetch()
  }, [refetch])

  const productOptions = useMemo(() => uniqueStringOptions(items, (item) => item.productName), [items])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (status !== "all" && item.status !== status) return false
      if (productFilter !== "all" && item.productName !== productFilter) return false
      if (!isWithinDateRange(item.createdAt, fromDate, toDate)) return false
      return !q || `${item.orderNumber} ${item.id} ${item.productionId || ""} ${item.orderId || ""} ${item.productName} ${item.productSku} ${item.status} ${item.createdByName || ""} ${item.dispatchedByName || ""} ${item.completedByName || ""}`.toLowerCase().includes(q)
    })
    const waitingTime = (item) => recordTimestamp(item.status === "PACKAGING" ? item.createdAt : item.status === "DISPATCHED" ? item.dispatchedAt || item.createdAt : item.completedAt || item.dispatchedAt || item.createdAt)
    return filtered.sort((a, b) => {
      if (sortBy === "oldest") return recordTimestamp(a.createdAt) - recordTimestamp(b.createdAt)
      if (sortBy === "waiting") return waitingTime(a) - waitingTime(b)
      if (sortBy === "dispatched") return recordTimestamp(b.dispatchedAt) - recordTimestamp(a.dispatchedAt)
      return recordTimestamp(b.createdAt) - recordTimestamp(a.createdAt)
    })
  }, [items, query, status, productFilter, fromDate, toDate, sortBy])
  const clearToolbarFilters = () => { setProductFilter("all"); setFromDate(""); setToDate(""); setStatus("all") }
  const toolbarFilters = [
    { key: "product", label: "Product", value: productFilter, options: productOptions, onChange: setProductFilter },
    { key: "from-date", label: "Created date from", type: "date", value: fromDate, onChange: setFromDate },
    { key: "to-date", label: "Created date to", type: "date", value: toDate, onChange: setToDate },
  ]
  const sortOptions = [
    { value: "newest", label: "Newest batches first" },
    { value: "oldest", label: "Oldest batches first" },
    { value: "waiting", label: "Waiting longest" },
    { value: "dispatched", label: "Recently dispatched" },
  ]

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
      <MktHero eyebrow="Quality & release" title="Finished Goods" description="Move batches that passed Quality Control through packaging, dispatch and final completion.">
        <HeroButton variant="glass" onClick={load} disabled={loading} aria-label="Refresh finished goods">
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <div className="min-w-0 space-y-4">
        {(() => {
          const filters = [
            { key: "all", label: "Total batches", hint: "Every finished-goods batch", icon: PackageCheck, dot: "bg-slate-400", s: { grad: "from-slate-500 to-slate-700", glow: "shadow-slate-500/20" }, value: items.length, tone: "neutral", active: status === "all", onClick: () => setStatus("all") },
            { key: "PACKAGING", label: "Packaging", hint: "Ready to be dispatched", icon: Package, dot: "bg-amber-500", s: { grad: "from-amber-500 to-orange-600", glow: "shadow-amber-500/20" }, value: counts.packaging, tone: "warning", active: status === "PACKAGING", onClick: () => setStatus(status === "PACKAGING" ? "all" : "PACKAGING") },
            { key: "DISPATCHED", label: "Dispatched", hint: "Awaiting final completion", icon: Truck, dot: "bg-blue-500", s: { grad: "from-blue-500 to-indigo-700", glow: "shadow-blue-500/20" }, value: counts.dispatched, tone: "info", active: status === "DISPATCHED", onClick: () => setStatus(status === "DISPATCHED" ? "all" : "DISPATCHED") },
            { key: "COMPLETED", label: "Completed", hint: "All steps finished", icon: CircleCheck, dot: "bg-emerald-500", s: { grad: "from-emerald-500 to-teal-700", glow: "shadow-emerald-500/20" }, value: counts.completed, tone: "success", active: status === "COMPLETED", onClick: () => setStatus(status === "COMPLETED" ? "all" : "COMPLETED") },
          ]
          return <>
            <div className="hidden min-w-0 md:block">
              <TileGrid className="md:grid-cols-4 xl:grid-cols-4">
                {filters.map((item) => <StageTile key={item.key} stage={item} value={item.value} loading={loading} active={item.active} onClick={item.onClick} />)}
              </TileGrid>
            </div>
            <div className="md:hidden">
              <StageChips label="Finished goods status filters" items={filters.map((item) => ({ key: item.key, label: item.label, value: item.value, grad: item.s.grad, dot: item.dot, active: item.active, onClick: item.onClick }))} />
            </div>
          </>
        })()}

        <Card className="min-w-0 overflow-hidden rounded-2xl border-[#dce5e0] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
          <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-[#e7eee9] bg-slate-50/70 px-3 py-3 sm:px-5">
            <SearchField className="min-w-0 flex-1 sm:max-w-md" value={query} onChange={setQuery} placeholder="Search order, product, SKU or person..." />
            <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{rows.length} batch{rows.length === 1 ? "" : "es"}</span>
            <ListViewControls view={view} onViewChange={setView} sortBy={sortBy} onSortChange={setSortBy} sortOptions={sortOptions} filters={toolbarFilters} onClearFilters={clearToolbarFilters} hasActiveFilters={productFilter !== "all" || !!fromDate || !!toDate || status !== "all"} />
          </div>
          {loading ? <div className="p-3"><TableSkeleton rows={4} /></div> : rows.length === 0 ? (
            <EmptyState icon={PackageCheck} title={query || status !== "all" || productFilter !== "all" || fromDate || toDate ? "No matching finished goods" : "No finished goods yet"}>
              {query || status !== "all" || productFilter !== "all" || fromDate || toDate ? "Try another search or clear one or more filters." : "Approved products will appear here after Quality Control."}
            </EmptyState>
          ) : (
            <>
              <div className={`hidden min-w-0 grid-cols-2 gap-3 p-3 sm:p-4 2xl:grid-cols-3 ${view === "cards" ? "lg:grid" : "lg:hidden"}`}>
                {rows.map((item) => <ItemCard key={item.id} item={item} onAction={confirm} editable={editable} />)}
              </div>
              <div className={`hidden min-w-0 overflow-hidden ${view === "table" ? "lg:block" : "lg:hidden"}`}>
                <Table className="w-full table-fixed">
                  <TableHeader><TableRow>
                    <TableHead className="w-[18%] whitespace-normal">Order / Batch</TableHead>
                    <TableHead className="w-[22%] whitespace-normal">Product / SKU</TableHead>
                    <TableHead className="w-[9%] whitespace-normal">Quantity</TableHead>
                    <TableHead className="w-[21%] whitespace-normal">Status / Next step</TableHead>
                    <TableHead className="w-[15%] whitespace-normal">Last action by</TableHead>
                    <TableHead className="w-[15%] whitespace-normal text-right">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{rows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="min-w-0 whitespace-normal align-top"><p className="break-words font-semibold tabular-nums">{item.orderNumber || "—"}</p><p className="mt-1 break-words text-xs text-muted-foreground">Batch #{item.id}</p></TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top"><p className="break-words font-medium">{item.productName || "Product unavailable"}</p><p className="mt-1 break-words text-xs text-muted-foreground">{item.productSku || "SKU unavailable"}</p></TableCell>
                      <TableCell className="whitespace-normal align-top font-semibold tabular-nums">{Number(item.quantity || 0).toLocaleString()}</TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top"><Status value={item.status} /><p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{nextStepText(item.status)}</p></TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top"><UserCell {...actorOf(item)} className="min-w-0 max-w-full text-foreground" /></TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top text-right"><div className="flex min-w-0 flex-wrap justify-end gap-1.5">{editable && item.status === "PACKAGING" && <Button size="sm" onClick={() => confirm(item, "DISPATCH")}><Truck /> Dispatch</Button>}{editable && item.status === "DISPATCHED" && <Button size="sm" onClick={() => confirm(item, "COMPLETE")}><CheckCircle2 /> Complete</Button>}{(!editable || item.status === "COMPLETED") && <span className="text-xs text-muted-foreground">{editable ? "No action" : "View only"}</span>}</div></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <div className="grid min-w-0 gap-3 p-3 lg:hidden">
                {rows.map((item) => <ItemCard key={item.id} item={item} onAction={confirm} editable={editable} />)}
              </div>
            </>
          )}
        </Card>
      </div>

      {editable && <Confirm item={selected} action={action} busy={busy} onClose={close} onConfirm={submit} />}
    </>
  )
}
