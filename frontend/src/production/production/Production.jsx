import { useCallback, useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { useSearchParams } from "react-router-dom"
import { MotionConfig } from "motion/react"
import { Factory, RefreshCw } from "lucide-react"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import ListViewControls from "@/components/ListViewControls"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { isWithinDateRange, uniqueStringOptions } from "@/lib/listViewUtils"
import { useGetProductionQuery } from "@/production/production/productionApi"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import Pagination from "@/components/Pagination"
import { FilterTabs, PageButton, PageHeader, Panel } from "@/components/PageKit"
import { SearchField } from "@/sales/marketing-orders/mktKit"
import { EmptyState, Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/core/auth/usePermissions"
import RequestMaterialsModal from "@/store/material-requests/RequestMaterialsModal"
import ProductionStartModal from "@/production/production/components/ProductionStartModal"
import RecordUnitsModal from "@/production/production/components/RecordUnitsModal"
import ProductionLineCard, { LineActions } from "@/production/production/components/ProductionLineCard"
import { PRODUCTION_TABS, daysUntil, dueDateOf, dueLine, isVisibleToProduction, materialState, nextStep, shortDay } from "@/production/production/productionWorkflow"
import { toProductionOrder } from "@/production/dashboards/productionDashboardUtils"

const PAGE_SIZE = 12
const time = (v) => new Date(v || 0).getTime() || 0
const orderTime = (item) => time(item.order_created_at || item.started_at)
const SORTS = {
  // the delivery date first (lines without one after), then the oldest order
  due: (a, b) => (dueDateOf(a) || "9999").localeCompare(dueDateOf(b) || "9999") || orderTime(a) - orderTime(b),
  oldest: (a, b) => orderTime(a) - orderTime(b),
  newest: (a, b) => orderTime(b) - orderTime(a),
  quantityDesc: (a, b) => Number(b.ordered_quantity || 0) - Number(a.ordered_quantity || 0) || orderTime(a) - orderTime(b),
  quantityAsc: (a, b) => Number(a.ordered_quantity || 0) - Number(b.ordered_quantity || 0) || orderTime(a) - orderTime(b),
}

function ProductionLineTable({ items, editable, onStart, onRecord, onRequest }) {
  return <Panel className="overflow-hidden p-0">
    <Table className="w-full table-fixed">
      <TableHeader><TableRow className="hover:bg-transparent">
        <TableHead className="w-[24%] whitespace-normal">Order / Product</TableHead>
        <TableHead className="w-[23%] whitespace-normal">Next step</TableHead>
        <TableHead className="w-[19%] whitespace-normal">Production</TableHead>
        <TableHead className="w-[15%] whitespace-normal">Materials</TableHead>
        <TableHead className="w-[8%] whitespace-normal">Due</TableHead>
        <TableHead className="w-[11%] whitespace-normal text-right">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.map((item) => {
        const step = nextStep(item)
        const material = materialState(item)
        const due = dueDateOf(item)
        const days = due ? daysUntil(due) : null
        const made = Math.max(0, Number(item.quantity_completed || 0))
        const ordered = Math.max(0, Number(item.ordered_quantity || 0))
        const percentage = ordered ? Math.min(100, Math.round((made / ordered) * 100)) : 0
        return <TableRow key={item.order_item_id}>
          <TableCell className="min-w-0 whitespace-normal align-top"><OrderDisplayNumber orderNumber={item.order_number} itemCount={item.item_count} itemIndex={item.item_index} fallback={`Order #${item.order_id}`} to={`/order-tracker?order=${item.order_id}`} className="break-words font-semibold tabular-nums text-lp-ink"/><p className="mt-1 break-words text-sm font-medium">{item.product_name || "Product unavailable"}</p><p className="mt-1 break-words text-xs text-lp-muted">{item.customer_name || "Customer unavailable"}{item.product_sku ? ` · ${item.product_sku}` : ""}</p></TableCell>
          <TableCell className="min-w-0 whitespace-normal align-top"><p className={`break-words text-sm font-semibold ${step.tone === "action" ? "text-amber-800" : step.tone === "done" ? "text-success" : "text-lp-muted"}`}>{step.text}</p></TableCell>
          <TableCell className="whitespace-normal align-top"><p className="text-sm font-semibold tabular-nums">{made} of {ordered} made</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lp-bg"><div className="h-full rounded-full bg-lp-green" style={{ width: `${percentage}%` }}/></div><p className="mt-1 text-xs text-lp-muted">{percentage}% complete</p></TableCell>
          <TableCell className="whitespace-normal align-top"><p className="text-sm font-medium">{material.label}</p><p className="mt-1 text-xs text-lp-muted">{material.detail}</p></TableCell>
          <TableCell className="whitespace-normal align-top">{due ? <span className={`text-xs font-semibold ${days < 0 ? "text-rose-700" : days <= 7 ? "text-amber-800" : "text-lp-muted"}`}>{days <= 7 ? dueLine(days) : shortDay(due)}</span> : <span className="text-xs text-lp-muted">Not set</span>}</TableCell>
          <TableCell className="whitespace-normal align-top text-right">{editable ? <LineActions item={item} onStart={onStart} onRecord={onRecord} onRequest={onRequest}/> : <span className="text-xs text-lp-muted">View only</span>}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </Panel>
}

/*
  Production: one card per product line of an order, in tabs by what there is to do (Ready to start, Being made,
  Need materials), then the lines where it is someone else's turn (Held up) and the finished ones (Done). The page
  opens on the first tab with work in it; the soonest delivery date comes first.
  Link in: ?tab=start|making|ask|held|done. Drafts and rejected orders are not shown: they never reach production.
*/
export default function Production() {
  const toast = useToast()
  const dispatch = useDispatch()
  const { canEdit } = usePermissions()
  const editable = canEdit("production")
  const { data = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetProductionQuery()
  const items = useMemo(() => (Array.isArray(data) ? data : []).filter(isVisibleToProduction), [data])
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("due")
  const [productFilter, setProductFilter] = useState("all")
  const [customerFilter, setCustomerFilter] = useState("all")
  const [materialFilter, setMaterialFilter] = useState("all")
  const [fromDueDate, setFromDueDate] = useState("")
  const [toDueDate, setToDueDate] = useState("")
  const [view, setView] = useState("cards")
  const [page, setPage] = useState(1)
  const [startFor, setStartFor] = useState(null)
  const [recordFor, setRecordFor] = useState(null)
  const [requestFor, setRequestFor] = useState(null)

  const counts = useMemo(() => Object.fromEntries(PRODUCTION_TABS.map((t) => [t.key, items.filter(t.test).length])), [items])
  const picked = PRODUCTION_TABS.find((t) => t.key === params.get("tab"))
  // no tab in the link: the first one with work in it, else Held up
  const tab = picked || PRODUCTION_TABS.slice(0, 3).find((t) => counts[t.key] > 0) || PRODUCTION_TABS[3]
  const pickTab = (key) => { setPage(1); setParams((p) => { const next = new URLSearchParams(p); next.set("tab", key); return next }, { replace: true }) }

  const productOptions = useMemo(() => uniqueStringOptions(items, (item) => item.product_name), [items])
  const customerOptions = useMemo(() => uniqueStringOptions(items, (item) => item.customer_name, "All customers"), [items])
  const materialOptions = useMemo(() => uniqueStringOptions(items, (item) => materialState(item).label, "All material statuses"), [items])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter(tab.test)
      .filter((item) => {
        if (productFilter !== "all" && item.product_name !== productFilter) return false
        if (customerFilter !== "all" && item.customer_name !== customerFilter) return false
        if (materialFilter !== "all" && materialState(item).label !== materialFilter) return false
        if (!isWithinDateRange(dueDateOf(item), fromDueDate, toDueDate)) return false
        return !q || `${item.order_number} ${item.customer_name || ""} ${item.product_name || ""} ${item.product_sku || ""}`.toLowerCase().includes(q)
      })
      .sort(SORTS[sort] || SORTS.due)
  }, [items, tab, query, sort, productFilter, customerFilter, materialFilter, fromDueDate, toDueDate])
  const toolbarFilters = [
    { key: "product", label: "Product", value: productFilter, options: productOptions, onChange: (value) => { setProductFilter(value); setPage(1) } },
    { key: "customer", label: "Customer", value: customerFilter, options: customerOptions, onChange: (value) => { setCustomerFilter(value); setPage(1) } },
    { key: "materials", label: "Material status", value: materialFilter, options: materialOptions, onChange: (value) => { setMaterialFilter(value); setPage(1) } },
    { key: "due-from", label: "Due date from", type: "date", value: fromDueDate, onChange: (value) => { setFromDueDate(value); setPage(1) } },
    { key: "due-to", label: "Due date to", type: "date", value: toDueDate, onChange: (value) => { setToDueDate(value); setPage(1) } },
  ]
  const sortOptions = [
    { value: "due", label: "Delivery date first" },
    { value: "oldest", label: "Oldest orders first" },
    { value: "newest", label: "Newest orders first" },
    { value: "quantityDesc", label: "Largest orders first" },
    { value: "quantityAsc", label: "Smallest orders first" },
  ]
  const clearToolbarFilters = () => { setProductFilter("all"); setCustomerFilter("all"); setMaterialFilter("all"); setFromDueDate(""); setToDueDate(""); setPage(1) }
  const hasActiveFilters = productFilter !== "all" || customerFilter !== "all" || materialFilter !== "all" || Boolean(fromDueDate || toDueDate)
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const load = useCallback(async () => {
    dispatch(baseApi.util.invalidateTags(["Production", "QualityControl", "FinishedGoods", "Orders"]))
    await refetch()
  }, [dispatch, refetch])
  const started = async (qty, orderNumber) => {
    setStartFor(null)
    toast.success(`${qty} ${qty === 1 ? "unit" : "units"} started for ${orderNumber}`)
    await load()
  }
  const recorded = async (qty) => {
    setRecordFor(null)
    toast.success(`${qty} finished ${qty === 1 ? "unit" : "units"} sent to Quality Control`)
    await load()
  }

  return (
    <MotionConfig reducedMotion="user">
      <PageHeader eyebrow="Production" title="Production"
        description={editable ? "Ask the Store for materials, start the units once they arrive, then record the finished ones: they go to Quality Control." : "What is being made, and where each order's materials stand."}>
        <PageButton onClick={load} disabled={isFetching} aria-label="Refresh production">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </PageButton>
      </PageHeader>

      {loadError && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(loadError, "Failed to load production.")}</Notice></div>}

      <FilterTabs label="Production by what there is to do" layoutId="production-tab"
        items={PRODUCTION_TABS.map((t) => ({ key: t.key, label: t.label, value: loading ? "…" : counts[t.key], active: t.key === tab.key, onClick: () => pickTab(t.key) }))} />

      <section className="mt-4 rounded-xl border border-lp-line bg-white p-3 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(value) => { setQuery(value); setPage(1) }} placeholder="Search order, customer or product..." />
          <span className="ml-auto shrink-0 text-[13px] text-lp-muted tabular-nums">Showing {rows.length} of {counts[tab.key] ?? 0}</span>
          <ListViewControls view={view} onViewChange={setView} sortBy={sort} onSortChange={(value) => { setSort(value); setPage(1) }} sortOptions={sortOptions} filters={toolbarFilters} onClearFilters={clearToolbarFilters} hasActiveFilters={hasActiveFilters} />
        </div>
        {(query.trim() || hasActiveFilters) && <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-lp-line pt-2">
          {query.trim() && <button type="button" onClick={() => { setQuery(""); setPage(1) }} className="rounded-full bg-lp-bg px-2.5 py-1 text-xs font-medium text-lp-muted hover:text-lp-ink">Search: {query} ×</button>}
          {hasActiveFilters && <button type="button" onClick={clearToolbarFilters} className="rounded-full bg-lp-bg px-2.5 py-1 text-xs font-semibold text-lp-green hover:underline">Clear filters</button>}
        </div>}
      </section>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-xl border border-lp-line bg-white" />)}
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState icon={Factory} title={query || hasActiveFilters ? "No matching production lines" : `Nothing in ${tab.label}`}>
            {query || hasActiveFilters ? "Change the search or clear the filters to see more production lines." : items.length ? "Pick another tab above." : "Orders show here once the Operations Admin approves them."}
          </EmptyState>
        </Panel>
      ) : (
        <>
          {view === "table" && <div className="hidden min-w-0 xl:block">
            <ProductionLineTable items={pageRows} editable={editable}
              onStart={(item) => setStartFor(toProductionOrder(item))} onRecord={setRecordFor}
              onRequest={(item) => setRequestFor(toProductionOrder(item))} />
          </div>}
          <div className={`grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3 ${view === "table" ? "xl:hidden" : ""}`}>
            {pageRows.map((item) => (
              <ProductionLineCard key={item.order_item_id} item={item} editable={editable}
                onStart={(i) => setStartFor(toProductionOrder(i))} onRecord={setRecordFor} onRequest={(i) => setRequestFor(toProductionOrder(i))} />
            ))}
          </div>
          {rows.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} noun="product lines" />}
        </>
      )}

      {editable && requestFor && <RequestMaterialsModal order={requestFor} onClose={() => setRequestFor(null)} onSubmitted={load} />}
      {editable && startFor && <ProductionStartModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}
      {editable && recordFor && <RecordUnitsModal item={recordFor} onClose={() => setRecordFor(null)} onSaved={recorded} />}
    </MotionConfig>
  )
}
