import { useCallback, useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { CheckCircle2, Factory, PackagePlus, PlayCircle, RefreshCw } from "lucide-react"
import { productionService } from "@/features/production/productionService"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import SearchBar from "@/components/SearchBar"
import Pagination from "@/components/Pagination"
import StatStrip from "@/components/StatStrip"
import { HeroButton, MktBtn, MktHero, SearchField, StageTile, TileGrid } from "@/features/marketing-orders/mktKit"
import ProductionOrderCard from "@/features/production/components/ProductionOrderCard"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import QuantityStepper from "@/components/QuantityStepper"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ListViewControls from "@/components/ListViewControls"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { isWithinDateRange, recordTimestamp, uniqueStringOptions } from "@/lib/listViewUtils"
import RequestMaterialsModal from "@/features/material-requests/RequestMaterialsModal"
import ProductionStartModal from "@/features/production/components/ProductionStartModal"
import { inProductionQuantity, isApprovedForProduction, isProductionCompleted, leftToBeAllottedQuantity, materialAllottedQuantity, productionWorkflowStatus, readyToStartQuantity, remainingToStart } from "@/features/production/productionWorkflow"

const PAGE_SIZE = 12
const num = (v) => Number(v || 0)
const date = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—")
const CAN_START_STATUSES = new Set(["PENDING", "IN_PRODUCTION", "TESTING"])

const canStartProduction = (item) => remainingToStart(item) > 0 && CAN_START_STATUSES.has(item.order_status) && item.material_status !== "UNKNOWN" && num(item.max_production_quantity) > 0
// Keep the request action visible until all ordered units are covered by Store allotments.
// Requestable quantity only prevents duplicate requests; it must not hide the path to pending handovers.
const canRequestMaterials = (item) => isApprovedForProduction(item)
  && item.material_status !== "UNKNOWN"
  && remainingToStart(item) > 0
  && leftToBeAllottedQuantity(item) > 0

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
  const ready = readyToStartQuantity(item)
  const left = leftToBeAllottedQuantity(item)
  const completed = num(item.quantity_completed)
  const ordered = num(item.ordered_quantity)
  const activeUnits = inProductionQuantity(item)
  const workflow = productionWorkflowStatus(item)
  const outstanding = num(item.material_request_outstanding_quantity)

  if (workflow.key === "awaiting_approval") {
    const approved = item.approval_status === "APPROVED"
    return <div className="space-y-1"><Badge variant="warning">{workflow.label}</Badge><p className="text-xs text-muted-foreground">{approved ? "The Operations Admin sends it to Production once the stock covers it" : "Operations approval is required"}</p></div>
  }
  if (workflow.key === "bom_review") {
    return <div className="space-y-1"><Badge variant="warning">BOM needs review</Badge><p className="text-xs text-muted-foreground">Component requirements need fixing</p></div>
  }
  if (isProductionCompleted(item)) {
    return <div className="space-y-1"><Badge variant="success">Production completed</Badge><p className="text-xs text-muted-foreground">All {ordered} ordered units are complete</p></div>
  }
  if (activeUnits > 0) {
    const details = [
      `${activeUnits} unit${activeUnits === 1 ? "" : "s"} in production`,
      ready > 0 ? `${ready} ready to start` : "",
      left > 0 ? `${left} left to be allotted` : "",
    ].filter(Boolean)
    return <div className="space-y-1"><Badge variant="info">Production in progress</Badge><p className="text-xs leading-snug text-muted-foreground">{details.join(" · ")}</p></div>
  }
  if (left > 0 && ready > 0) {
    return <div className="space-y-1"><Badge variant="info">Partially allotted</Badge><p className="text-xs leading-snug text-muted-foreground">{ready} ready to start · {left} left to be allotted</p></div>
  }
  if (left > 0) {
    const label = outstanding > 0 ? "Awaiting Store" : completed > 0 ? "More materials needed" : "Awaiting allotment"
    const detail = outstanding > 0 ? "Material request is awaiting allotment" : `${left} unit${left === 1 ? "" : "s"} left to be allotted${completed > 0 ? ` · ${completed} completed` : ""}`
    return <div className="space-y-1"><Badge variant="warning">{label}</Badge><p className="text-xs leading-snug text-muted-foreground">{detail}</p></div>
  }
  if (ready > 0) {
    return <div className="space-y-1"><Badge variant="success">Materials allotted</Badge><p className="text-xs text-muted-foreground">Ready to start {ready} unit{ready === 1 ? "" : "s"}</p></div>
  }
  return <div className="space-y-1"><Badge variant={completed > 0 ? "info" : "secondary"}>{completed > 0 ? "More materials needed" : workflow.label}</Badge><p className="text-xs text-muted-foreground">{completed > 0 ? `${completed} units completed so far` : "Materials are not yet ready"}</p></div>
}

function ProductionActions({ item, onUpdate, onRequest, onStart, editable = true, compact = false, marketing = false }) {
  if (!editable) return <span className="text-xs text-muted-foreground">View only</span>

  const activeUnits = inProductionQuantity(item)
  const hasUpdate = Boolean(item.id) && item.status === "IN_PRODUCTION" && activeUnits > 0
  const eligibleToStart = canStartProduction(item)
  const canRequest = canRequestMaterials(item)
  const ActionButton = marketing ? MktBtn : Button

  if (!eligibleToStart && !hasUpdate && !canRequest) {
    const workflow = productionWorkflowStatus(item)
    return <span className="text-xs font-medium text-muted-foreground">{workflow.label}</span>
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "justify-start" : "justify-end"}`}>
      {canRequest && <ActionButton variant="outline" size="sm" onClick={() => onRequest(item)}><PackagePlus className="size-3.5" /> Request materials</ActionButton>}
      {eligibleToStart && <ActionButton variant={marketing ? "primary" : "default"} size="sm" onClick={() => onStart(item)}>Start production</ActionButton>}
      {hasUpdate && <ActionButton variant="outline" size="sm" onClick={() => onUpdate(item)}>Record completed units</ActionButton>}
    </div>
  )
}

function ProductionCard({ item, onUpdate, onRequest, onStart, editable }) {
  const completed = num(item.quantity_completed)
  const ordered = num(item.ordered_quantity)
  const allotted = materialAllottedQuantity(item)
  const left = leftToBeAllottedQuantity(item)

  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <OrderDisplayNumber orderNumber={item.order_number} itemCount={item.item_count} itemIndex={item.item_index} className="break-words font-bold tabular-nums" />
          <p className="mt-1 break-words text-sm font-medium text-slate-800">{item.product_name || "—"}</p>
          {item.product_sku && <p className="mt-1 text-xs text-muted-foreground">{item.product_sku}</p>}
        </div>
        <div className="shrink-0"><MaterialReadiness item={item} /></div>
      </div>

      <div className="mt-4"><Progress done={completed} total={ordered} /></div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[["Allotted", allotted], ["Left to be allotted", left], ["Completed", completed]].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border bg-muted/30 px-2 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Last activity: {date(item.completed_at || item.started_at || item.order_created_at)}</span>
          {item.updated_by_name && <span className="truncate">{item.updated_by_name}</span>}
        </div>
        <ProductionActions item={item} onUpdate={onUpdate} onRequest={onRequest} onStart={onStart} editable={editable} compact />
      </div>
    </div>
  )
}

function toOrder(item) {
  return {
    id: item.order_id,
    order_id: item.order_id,
    order_item_id: item.order_item_id,
    order_number: item.order_number,
    item_count: item.item_count,
    item_index: item.item_index,
    product_name: item.product_name,
    quantity: num(item.ordered_quantity),
    status: item.order_status,
    quantity_to_produce: num(item.quantity_to_produce),
    remaining_to_start: remainingToStart(item),
  }
}

export default function Production() {
  const toast = useToast()
  const dispatch = useDispatch()
  const { canEdit } = usePermissions()
  const editable = canEdit("production")
  // The list includes both unstarted orders and existing production runs.
  const { data: items = [], isLoading: loading, error: loadError, refetch } = useGetProductionQuery()
  const [actionError, setError] = useState("")
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load production orders.") : "")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [workflowFilter, setWorkflowFilter] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [view, setView] = useState("cards")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [requestFor, setRequestFor] = useState(null)
  const [startFor, setStartFor] = useState(null)
  const [quantity, setQuantity] = useState("1")
  const [saving, setSaving] = useState(false)

  const invalidateWorkflowData = useCallback(() => {
    dispatch(baseApi.util.invalidateTags(["Production", "QualityControl", "FinishedGoods", "Orders"]))
  }, [dispatch])

  const load = useCallback(async () => {
    setError("")
    invalidateWorkflowData()
    await refetch()
  }, [refetch, invalidateWorkflowData])

  const counts = useMemo(() => ({
    all: items.length,
    awaiting: items.filter((item) => isApprovedForProduction(item) && !isProductionCompleted(item) && leftToBeAllottedQuantity(item) > 0 && item.material_status !== "UNKNOWN").length,
    ready: items.filter((item) => !isProductionCompleted(item) && readyToStartQuantity(item) > 0).length,
    completed: items.filter(isProductionCompleted).length,
  }), [items])

  const productOptions = useMemo(() => uniqueStringOptions(items, (item) => item.product_name), [items])
  const workflowStatusOptions = [
    { value: "all", label: "All production statuses" },
    { value: "awaiting_approval", label: "Awaiting approval" },
    { value: "bom_review", label: "BOM needs review" },
    { value: "awaiting_allotment", label: "Awaiting allotment" },
    { value: "partially_allotted", label: "Partially allotted" },
    { value: "ready_to_start", label: "Ready to start" },
    { value: "in_production", label: "Production in progress" },
    { value: "completed", label: "Production completed" },
  ]
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items.filter((item) => {
      const workflow = productionWorkflowStatus(item).key
      if (filter === "awaiting" && !(isApprovedForProduction(item) && !isProductionCompleted(item) && leftToBeAllottedQuantity(item) > 0 && item.material_status !== "UNKNOWN")) return false
      if (filter === "ready" && (isProductionCompleted(item) || readyToStartQuantity(item) <= 0)) return false
      if (filter === "completed" && !isProductionCompleted(item)) return false
      if (productFilter !== "all" && item.product_name !== productFilter) return false
      if (workflowFilter === "ready_to_start" && (isProductionCompleted(item) || readyToStartQuantity(item) <= 0)) return false
      if (workflowFilter === "in_production" && (isProductionCompleted(item) || inProductionQuantity(item) <= 0)) return false
      if (workflowFilter !== "all" && workflowFilter !== "ready_to_start" && workflowFilter !== "in_production" && workflow !== workflowFilter) return false
      if (!isWithinDateRange(item.started_at || item.order_created_at || item.completed_at, fromDate, toDate)) return false
      return !q || `${item.order_number} ${item.product_name || ""} ${item.product_sku || ""} ${item.order_status || ""} ${item.status || ""} ${workflow} ${item.started_by_name || ""} ${item.updated_by_name || ""} ${item.qc_remarks || ""} ${item.rework_remarks || ""}`.toLowerCase().includes(q)
    })
    return filtered.sort((a, b) => {
      const aCreated = recordTimestamp(a.order_created_at || a.started_at || a.completed_at)
      const bCreated = recordTimestamp(b.order_created_at || b.started_at || b.completed_at)
      const aProgress = num(a.ordered_quantity) ? num(a.quantity_completed) / num(a.ordered_quantity) : 0
      const bProgress = num(b.ordered_quantity) ? num(b.quantity_completed) / num(b.ordered_quantity) : 0
      if (sortBy === "oldest") return aCreated - bCreated
      if (sortBy === "most-left-to-allot") return leftToBeAllottedQuantity(b) - leftToBeAllottedQuantity(a) || bCreated - aCreated
      if (sortBy === "most-ready") return readyToStartQuantity(b) - readyToStartQuantity(a) || bCreated - aCreated
      if (sortBy === "least-progress") return aProgress - bProgress
      if (sortBy === "most-progress") return bProgress - aProgress
      return bCreated - aCreated
    })
  }, [items, query, filter, productFilter, workflowFilter, fromDate, toDate, sortBy])

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const setFilterAndReset = (value) => { setFilter(value); setPage(1) }
  const setQueryAndReset = (value) => { setQuery(value); setPage(1) }
  const clearToolbarFilters = () => { setProductFilter("all"); setWorkflowFilter("all"); setFromDate(""); setToDate(""); setFilterAndReset("all") }
  const toolbarFilters = [
    { key: "product", label: "Product", value: productFilter, options: [{ value: "all", label: "All products" }, ...productOptions.filter((option) => option.value !== "all")], onChange: (value) => { setProductFilter(value); setPage(1) } },
    { key: "workflow-status", label: "Production status", value: workflowFilter, options: workflowStatusOptions, onChange: (value) => { setWorkflowFilter(value); setPage(1) } },
    { key: "from-date", label: "Activity date from", type: "date", value: fromDate, onChange: (value) => { setFromDate(value); setPage(1) } },
    { key: "to-date", label: "Activity date to", type: "date", value: toDate, onChange: (value) => { setToDate(value); setPage(1) } },
  ]
  const sortOptions = [
    { value: "newest", label: "Newest orders first" },
    { value: "oldest", label: "Oldest orders first" },
    { value: "most-left-to-allot", label: "Most units left to be allotted" },
    { value: "most-ready", label: "Most units ready to start" },
    { value: "least-progress", label: "Lowest completion first" },
    { value: "most-progress", label: "Highest completion first" },
  ]

  // Keep this page focused on the current material-allotment production workflow.
  const stats = [
    { key: "all", label: "All production", hint: "Every product line in production", icon: Factory, dot: "bg-slate-400", s: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/20" }, value: counts.all, tone: "neutral", active: filter === "all", onClick: () => setFilterAndReset("all") },
    { key: "awaiting", label: "Awaiting allotment", hint: "Products still needing material handover", icon: PackagePlus, dot: "bg-amber-500", s: { grad: "from-amber-700 to-orange-800", glow: "shadow-amber-500/20" }, value: counts.awaiting, tone: "warning", active: filter === "awaiting", onClick: () => setFilterAndReset("awaiting") },
    { key: "ready", label: "Ready to start", hint: "Products covered by allotted materials", icon: PlayCircle, dot: "bg-blue-500", s: { grad: "from-blue-600 to-indigo-800", glow: "shadow-blue-600/20" }, value: counts.ready, tone: "info", active: filter === "ready", onClick: () => setFilterAndReset("ready") },
    { key: "completed", label: "Production completed", hint: "All ordered units have been completed", icon: CheckCircle2, dot: "bg-emerald-500", s: { grad: "from-emerald-700 to-teal-800", glow: "shadow-emerald-500/20" }, value: counts.completed, tone: "success", active: filter === "completed", onClick: () => setFilterAndReset("completed") },
  ]

  const openUpdate = (item) => {
    if (!editable) return
    const remaining = Math.max(0, num(item.quantity_to_produce) - num(item.quantity_completed))
    if (!item.id || remaining <= 0) return
    setSelected(item)
    setQuantity(remaining > 0 ? String(remaining) : "")
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

  const started = async (qty, orderNumber) => {
    setStartFor(null)
    toast.success(`${qty} ${qty === 1 ? "unit" : "units"} started for ${orderNumber}`)
    await load()
  }

  return (
    <>
      <MktHero
        eyebrow="Operations"
        title="Production"
        description={editable ? "Request materials, start allotted units, and record completed products." : "View material allotments and completed products."}
      >
        <HeroButton variant="glass" onClick={load} disabled={loading} aria-label="Refresh production">
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}


    <div className="min-w-0 space-y-4">
    <div className="hidden md:block">
      <TileGrid className="md:grid-cols-4 xl:grid-cols-4">
        {stats.map((item) => (
          <StageTile key={item.key} stage={item} value={item.value} loading={loading} active={item.active} onClick={item.onClick} />
        ))}
      </TileGrid>
    </div>
    <Card className="min-w-0 overflow-hidden">
      <div className="md:hidden">
        <StatStrip layoutId="production-filter" cols="grid-cols-2 sm:grid-cols-4" items={stats} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-y border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
        <div className="hidden min-w-0 flex-1 md:block md:max-w-sm">
          <SearchField value={query} onChange={setQueryAndReset} placeholder="Search order, product or person..." />
        </div>
        <div className="min-w-0 flex-1 md:hidden">
          <SearchBar value={query} onChange={setQueryAndReset} placeholder="Search order, product or person..." />
        </div>
        <p className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-slate-600">{rows.length} result{rows.length === 1 ? "" : "s"}</p>
        <ListViewControls view={view} onViewChange={setView} sortBy={sortBy} onSortChange={(value) => { setSortBy(value); setPage(1) }} sortOptions={sortOptions} filters={toolbarFilters} onClearFilters={clearToolbarFilters} hasActiveFilters={productFilter !== "all" || workflowFilter !== "all" || !!fromDate || !!toDate || filter !== "all"} />
      </div>

      {loading ? (
        <>
          <div className="hidden min-w-0 grid-cols-2 gap-4 p-4 lg:grid 2xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />)}
          </div>
          <div className="lg:hidden"><TableSkeleton rows={7} /></div>
        </>
      ) : rows.length === 0 ? (
        <EmptyState icon={Factory} title={query || filter !== "all" || productFilter !== "all" || workflowFilter !== "all" || fromDate || toDate ? "No matching production orders" : "No production orders yet"}>
          {query || filter !== "all" || productFilter !== "all" || workflowFilter !== "all" || fromDate || toDate ? "Try another search or clear one or more filters." : "Approved product lines appear here with their material allotment and completion status."}
        </EmptyState>
      ) : (
        <>
          {/* Desktop can switch between cards and a fixed-layout table. Phones keep cards to avoid horizontal scrolling. */}
          <div className={`hidden min-w-0 grid-cols-2 gap-4 p-4 2xl:grid-cols-3 ${view === "cards" ? "lg:grid" : "lg:hidden"}`}>
            {pageRows.map((item) => (
              <ProductionOrderCard
                key={item.order_item_id}
                item={item}
                readiness={<MaterialReadiness item={item} />}
                actions={<ProductionActions item={item} onUpdate={openUpdate} onRequest={(row) => setRequestFor(toOrder(row))} onStart={(row) => setStartFor(toOrder(row))} editable={editable} marketing />}
              />
            ))}
          </div>

          <div className={`hidden min-w-0 overflow-hidden ${view === "table" ? "lg:block" : "lg:hidden"}`}>
            <Table className="w-full table-fixed">
              <TableHeader><TableRow>
                <TableHead className="w-[17%] whitespace-normal">Order</TableHead>
                <TableHead className="w-[17%] whitespace-normal">Product</TableHead>
                <TableHead className="w-[19%] whitespace-normal">Progress</TableHead>
                <TableHead className="w-[18%] whitespace-normal">Material readiness</TableHead>
                <TableHead className="w-[11%] whitespace-normal">Material allotment</TableHead>
                <TableHead className="w-[18%] whitespace-normal">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{pageRows.map((item) => (
                <TableRow key={item.order_item_id}>
                  <TableCell className="min-w-0 whitespace-normal align-top"><OrderDisplayNumber orderNumber={item.order_number} itemCount={item.item_count} itemIndex={item.item_index} fallback={`Order #${item.order_id}`} className="break-words font-semibold tabular-nums" /><p className="mt-1 break-words text-xs text-muted-foreground">{item.order_status || item.status || "Unknown status"}</p></TableCell>
                  <TableCell className="min-w-0 whitespace-normal align-top"><p className="break-words font-medium">{item.product_name || "Product unavailable"}</p><p className="mt-1 break-words text-xs text-muted-foreground">SKU {item.product_sku || "—"}</p></TableCell>
                  <TableCell className="min-w-0 whitespace-normal align-top"><Progress done={num(item.quantity_completed)} total={num(item.ordered_quantity)} /></TableCell>
                  <TableCell className="min-w-0 whitespace-normal align-top"><MaterialReadiness item={item} /></TableCell>
                  <TableCell className="whitespace-normal align-top text-xs"><p className="font-semibold tabular-nums">{materialAllottedQuantity(item)} / {num(item.ordered_quantity)} units</p><p className="mt-1 text-muted-foreground">{leftToBeAllottedQuantity(item)} left to allot</p></TableCell>
                  <TableCell className="min-w-0 whitespace-normal align-top"><ProductionActions item={item} onUpdate={openUpdate} onRequest={(row) => setRequestFor(toOrder(row))} onStart={(row) => setStartFor(toOrder(row))} editable={editable} compact marketing /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>

          <div className="grid min-w-0 gap-3 p-3 lg:hidden">
            {pageRows.map((item) => <ProductionCard key={item.order_item_id} item={item} onUpdate={openUpdate} onRequest={(row) => setRequestFor(toOrder(row))} onStart={(row) => setStartFor(toOrder(row))} editable={editable} />)}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} noun="production orders" />
        </>
      )}
    </Card>
    </div>

      {editable && requestFor && <RequestMaterialsModal order={requestFor} onClose={() => setRequestFor(null)} onSubmitted={load} />}
      {editable && startFor && <ProductionStartModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}

      {editable && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onMouseDown={(e) => e.target === e.currentTarget && closeUpdate()}>
          <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl">
            <div className="border-b px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production update</p>
              <OrderDisplayNumber orderNumber={selected.order_number} itemCount={selected.item_count} itemIndex={selected.item_index} className="mt-1 text-lg font-semibold" />
              <p className="text-sm text-muted-foreground">{selected.product_name || "-"}</p>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Ordered', num(selected.ordered_quantity)], ['Allotted', materialAllottedQuantity(selected)], ['Completed', num(selected.quantity_completed)], ['Left to be allotted', leftToBeAllottedQuantity(selected)]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <QuantityStepper
                id="production-completed-quantity"
                label="Units completed"
                description={`${Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))} units are available to mark complete.`}
                value={quantity}
                min={1}
                max={Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))}
                unitLabel="units"
                onChange={setQuantity}
                disabled={saving}
              />

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
