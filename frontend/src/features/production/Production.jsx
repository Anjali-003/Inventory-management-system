import { useCallback, useMemo, useState } from "react"
import { ClipboardCheck, Factory, RefreshCw } from "lucide-react"
import { productionService } from "@/features/production/productionService"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { errorMessage } from "@/lib/stock"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import Pagination from "@/components/Pagination"
import StatStrip from "@/components/StatStrip"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import MaterialCheckModal from "@/features/orders/components/MaterialCheckModal"
import StartProductionModal from "@/features/orders/components/StartProductionModal"

const PAGE_SIZE = 12
const num = (v) => Number(v || 0)
const date = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not started")
const CAN_START_STATUSES = new Set(["PENDING", "IN_PRODUCTION", "TESTING"])

const remainingToStart = (item) => Math.max(0, num(item.remaining_to_start ?? (num(item.ordered_quantity) - num(item.quantity_to_produce))))
const inProduction = (item) => Math.max(0, num(item.quantity_in_production ?? (num(item.quantity_to_produce) - num(item.quantity_completed))))
const canStartMore = (item) => remainingToStart(item) > 0 && CAN_START_STATUSES.has(item.order_status) && item.material_status !== "UNKNOWN"

function Progress({ done, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">{done} / {total} completed</span>
        <span className="text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MaterialReadiness({ item }) {
  const remaining = remainingToStart(item)
  const possible = Math.min(remaining, Math.max(0, num(item.max_production_quantity)))

  if (remaining <= 0) {
    return <div className="space-y-1"><Badge variant="info">Fully started</Badge><p className="text-xs text-muted-foreground">No quantity left to start</p></div>
  }
  if (item.material_status === "UNKNOWN") {
    return <div className="space-y-1"><Badge variant="warning">BOM needs review</Badge><p className="text-xs text-muted-foreground">Material coverage unavailable</p></div>
  }
  if (possible < remaining) {
    return (
      <div className="space-y-1">
        <Badge variant="danger">Short for {remaining - possible} unit{remaining - possible === 1 ? "" : "s"}</Badge>
        <p className="text-xs leading-snug text-muted-foreground">Can start {possible} of {remaining} remaining</p>
      </div>
    )
  }
  return <div className="space-y-1"><Badge variant="success">Materials covered</Badge><p className="text-xs text-muted-foreground">All {remaining} remaining unit{remaining === 1 ? "" : "s"} can start</p></div>
}

function ProductionActions({ item, onUpdate, onCheck, onStart, compact = false }) {
  const activeUnits = inProduction(item)
  const hasUpdate = item.id && item.status === "IN_PRODUCTION" && activeUnits > 0
  const eligibleToStart = canStartMore(item)

  if (!eligibleToStart && !hasUpdate) {
    const needsBomReview = remainingToStart(item) > 0 && CAN_START_STATUSES.has(item.order_status) && item.material_status === "UNKNOWN"
    return <span className="text-xs text-muted-foreground">{item.status === "COMPLETED" ? "Production complete" : needsBomReview ? "Resolve BOM first" : "—"}</span>
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "justify-start" : "justify-end"}`}>
      {eligibleToStart && (
        <>
          <Button variant="outline" size="sm" onClick={() => onCheck(item)}><ClipboardCheck className="size-3.5" /> Check materials</Button>
          <Button size="sm" onClick={() => onStart(item)}>{num(item.quantity_to_produce) > 0 ? "Start more" : "Start production"}</Button>
        </>
      )}
      {hasUpdate && <Button variant="outline" size="sm" onClick={() => onUpdate(item)}>Update</Button>}
    </div>
  )
}

function ProductionCard({ item, onUpdate, onCheck, onStart }) {
  const started = num(item.quantity_to_produce)
  const completed = num(item.quantity_completed)
  const ordered = num(item.ordered_quantity)

  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium tabular-nums">{item.order_number}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.product_name || "-"}</p>
        </div>
        <div className="shrink-0"><MaterialReadiness item={item} /></div>
      </div>

      <div className="mt-4"><Progress done={completed} total={ordered} /></div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[["Started", started], ["Completed", completed], ["To start", remainingToStart(item)]].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted/30 px-2 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Started: {date(item.started_at)}</span>
          {item.started_by_name && <span className="truncate">{item.started_by_name}</span>}
        </div>
        <ProductionActions item={item} onUpdate={onUpdate} onCheck={onCheck} onStart={onStart} compact />
      </div>
    </div>
  )
}

function toOrder(item) {
  return {
    id: item.order_id,
    order_number: item.order_number,
    product_name: item.product_name,
    quantity: num(item.ordered_quantity),
    status: item.order_status,
    quantity_to_produce: num(item.quantity_to_produce),
    remaining_to_start: remainingToStart(item),
  }
}

export default function Production() {
  const toast = useToast()
  // The list includes both unstarted orders and existing production runs.
  const { data: items = [], isLoading: loading, error: loadError, refetch } = useGetProductionQuery()
  const [actionError, setError] = useState("")
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load production orders.") : "")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [checkFor, setCheckFor] = useState(null)
  const [startFor, setStartFor] = useState(null)
  const [quantity, setQuantity] = useState("1")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError("")
    await refetch()
  }, [refetch])

  const counts = useMemo(() => ({
    all: items.length,
    shortage: items.filter((item) => item.material_status === "SHORTAGE" && remainingToStart(item) > 0).length,
    active: items.filter((item) => item.status === "IN_PRODUCTION" && (inProduction(item) > 0 || remainingToStart(item) > 0)).length,
    history: items.filter((item) => item.status === "COMPLETED").length,
  }), [items])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === "shortage" && !(item.material_status === "SHORTAGE" && remainingToStart(item) > 0)) return false
      if (filter === "active" && !(item.status === "IN_PRODUCTION" && (inProduction(item) > 0 || remainingToStart(item) > 0))) return false
      if (filter === "history" && item.status !== "COMPLETED") return false
      return !q || `${item.order_number} ${item.product_name || ""} ${item.order_status || ""} ${item.status || ""} ${item.started_by_name || ""} ${item.updated_by_name || ""}`.toLowerCase().includes(q)
    })
  }, [items, query, filter])

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const setFilterAndReset = (value) => { setFilter(value); setPage(1) }
  const setQueryAndReset = (value) => { setQuery(value); setPage(1) }

  const stats = [
    { key: "all", label: "All production", value: counts.all, tone: "neutral", active: filter === "all", onClick: () => setFilterAndReset("all") },
    { key: "shortage", label: "Material shortages", value: counts.shortage, tone: "danger", active: filter === "shortage", onClick: () => setFilterAndReset("shortage") },
    { key: "active", label: "Active production", value: counts.active, tone: "info", active: filter === "active", onClick: () => setFilterAndReset("active") },
    { key: "history", label: "Production history", value: counts.history, tone: "success", active: filter === "history", onClick: () => setFilterAndReset("history") },
  ]

  const openUpdate = (item) => {
    const remaining = Math.max(0, num(item.quantity_to_produce) - num(item.quantity_completed))
    if (!item.id || remaining <= 0) return
    setSelected(item)
    setQuantity(remaining > 0 ? "1" : "")
    setError("")
  }

  const closeUpdate = () => {
    if (saving) return
    setSelected(null)
    setQuantity("1")
  }

  const submit = async () => {
    if (!selected) return
    const value = Number(quantity)
    const remaining = Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))

    if (!Number.isSafeInteger(value) || value <= 0) return setError("Enter a positive whole number.")
    if (value > remaining) return setError(`You can complete at most ${remaining} product(s).`)

    try {
      setSaving(true)
      setError("")
      await productionService.updateProgress(selected.id, value)
      setSelected(null)
      setQuantity("1")
      toast.success("Production progress updated")
      await load()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to update production.")
    } finally {
      setSaving(false)
    }
  }

  const startFromCheck = (order) => { setCheckFor(null); setStartFor(order) }
  const started = async (qty, orderNumber) => {
    setStartFor(null)
    toast.success(`${qty} unit(s) started for ${orderNumber}`)
    await load()
  }

  return (
    <>
      <PageHeader title="Production" description="Check material readiness, start units, and record completed production from one page.">
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw /> Refresh</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="min-w-0 overflow-hidden">
        <StatStrip layoutId="production-filter" cols="grid-cols-2 lg:grid-cols-4" items={stats} />
        <div className="flex min-w-0 flex-wrap items-center gap-3 border-y px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQueryAndReset} placeholder="Search order, product or person..." />
          <p className="ml-auto text-xs text-muted-foreground">{rows.length} result{rows.length === 1 ? "" : "s"}</p>
        </div>

        {loading ? <TableSkeleton rows={7} /> : rows.length === 0 ? (
          <EmptyState icon={Factory} title={query || filter !== "all" ? "No matching production orders" : "No production orders yet"}>
            {query || filter !== "all" ? "Try another search or select All production." : "Orders ready to start and existing production runs will appear here."}
          </EmptyState>
        ) : (
          <>
            {/* Wider screens use a fixed-width table; smaller screens use cards to avoid horizontal scrolling. */}
            <div className="hidden xl:block">
              <Table className="table-fixed">
                <TableHeader><TableRow>
                  <TableHead className="w-[20%]">Order / product</TableHead>
                  <TableHead className="w-[19%]">Progress</TableHead>
                  <TableHead className="w-[20%]">Material readiness</TableHead>
                  <TableHead className="w-[13%]">Started</TableHead>
                  <TableHead className="w-[28%] text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pageRows.map((item) => (
                    <TableRow key={item.order_id}>
                      <TableCell className="min-w-0 whitespace-normal">
                        <p className="break-words font-medium tabular-nums">{item.order_number}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground" title={item.product_name || "-"}>{item.product_name || "-"}</p>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <Progress done={num(item.quantity_completed)} total={num(item.ordered_quantity)} />
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">{inProduction(item)} currently in production</p>
                      </TableCell>
                      <TableCell className="whitespace-normal"><MaterialReadiness item={item} /></TableCell>
                      <TableCell className="whitespace-normal text-xs leading-snug text-muted-foreground">
                        <p>{date(item.started_at)}</p>
                        {item.started_by_name && <p className="mt-1 truncate text-foreground" title={item.started_by_name}>{item.started_by_name}</p>}
                      </TableCell>
                      <TableCell className="whitespace-normal text-right">
                        <ProductionActions item={item} onUpdate={openUpdate} onCheck={(row) => setCheckFor(toOrder(row))} onStart={(row) => setStartFor(toOrder(row))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid min-w-0 gap-3 p-3 xl:hidden">
              {pageRows.map((item) => <ProductionCard key={item.order_id} item={item} onUpdate={openUpdate} onCheck={(row) => setCheckFor(toOrder(row))} onStart={(row) => setStartFor(toOrder(row))} />)}
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} noun="production orders" />
          </>
        )}
      </Card>

      {checkFor && <MaterialCheckModal order={checkFor} onClose={() => setCheckFor(null)} onStart={startFromCheck} partialProduction />}
      {startFor && <StartProductionModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onMouseDown={(e) => e.target === e.currentTarget && closeUpdate()}>
          <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl">
            <div className="border-b px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production update</p>
              <h2 className="mt-1 text-lg font-semibold">{selected.order_number}</h2>
              <p className="text-sm text-muted-foreground">{selected.product_name || "-"}</p>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Ordered', num(selected.ordered_quantity)], ['Started', num(selected.quantity_to_produce)], ['Completed', num(selected.quantity_completed)], ['Remaining', Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <Label htmlFor="production-quantity">Units completed in this update</Label>
                <div className="flex gap-2">
                  <Input id="production-quantity" type="text" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
                  <Button variant="outline" onClick={() => setQuantity(String(Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))))}>Max</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Maximum: {Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))}</p>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={closeUpdate} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save production"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
