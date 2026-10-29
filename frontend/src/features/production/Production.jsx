import { useCallback, useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { useSearchParams } from "react-router-dom"
import { MotionConfig } from "motion/react"
import { Factory, RefreshCw } from "lucide-react"
import { useGetProductionQuery } from "@/features/production/productionApi"
import { baseApi } from "@/api/baseApi"
import { errorMessage } from "@/lib/stock"
import Pagination from "@/components/Pagination"
import { FilterTabs, PageButton, PageHeader, Panel } from "@/components/PageKit"
import { SearchField } from "@/features/marketing-orders/mktKit"
import { EmptyState, Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import RequestMaterialsModal from "@/features/material-requests/RequestMaterialsModal"
import ProductionStartModal from "@/features/production/components/ProductionStartModal"
import RecordUnitsModal from "@/features/production/components/RecordUnitsModal"
import ProductionLineCard from "@/features/production/components/ProductionLineCard"
import { PRODUCTION_TABS, dueDateOf, isVisibleToProduction } from "@/features/production/productionWorkflow"
import { toProductionOrder } from "@/features/production-dashboard/productionDashboardUtils"

const PAGE_SIZE = 12
const time = (v) => new Date(v || 0).getTime() || 0
const orderTime = (item) => time(item.order_created_at || item.started_at)
const SORTS = {
  // the delivery date first (lines without one after), then the oldest order
  due: (a, b) => (dueDateOf(a) || "9999").localeCompare(dueDateOf(b) || "9999") || orderTime(a) - orderTime(b),
  oldest: (a, b) => orderTime(a) - orderTime(b),
  newest: (a, b) => orderTime(b) - orderTime(a),
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
  const [page, setPage] = useState(1)
  const [startFor, setStartFor] = useState(null)
  const [recordFor, setRecordFor] = useState(null)
  const [requestFor, setRequestFor] = useState(null)

  const counts = useMemo(() => Object.fromEntries(PRODUCTION_TABS.map((t) => [t.key, items.filter(t.test).length])), [items])
  const picked = PRODUCTION_TABS.find((t) => t.key === params.get("tab"))
  // no tab in the link: the first one with work in it, else Held up
  const tab = picked || PRODUCTION_TABS.slice(0, 3).find((t) => counts[t.key] > 0) || PRODUCTION_TABS[3]
  const pickTab = (key) => { setPage(1); setParams((p) => { const next = new URLSearchParams(p); next.set("tab", key); return next }, { replace: true }) }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter(tab.test)
      .filter((i) => !q || `${i.order_number} ${i.customer_name || ""} ${i.product_name || ""} ${i.product_sku || ""}`.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [items, tab, query, sort])
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

      <div className="mt-4 flex flex-wrap items-center gap-3 pb-4">
        <SearchField className="min-w-0 flex-1 sm:max-w-xs sm:flex-none" value={query} onChange={(v) => { setQuery(v); setPage(1) }} placeholder="Search order, customer or product..." />
        <div className="flex shrink-0 items-center gap-3 text-[13px] text-lp-muted sm:flex-1 sm:justify-end">
          <span className="hidden tabular-nums sm:inline">Showing {rows.length} of {counts[tab.key] ?? 0}</span>
          <label className="sr-only" htmlFor="production-sort">Sort</label>
          <select id="production-sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="h-9 rounded-lg border border-lp-line bg-white ps-3 pe-8 text-[13px] font-medium text-lp-ink outline-none transition-colors hover:border-lp-rule focus-visible:ring-2 focus-visible:ring-lp-green/40">
            <option value="due">Delivery date first</option>
            <option value="oldest">Oldest orders first</option>
            <option value="newest">Newest orders first</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-xl border border-lp-line bg-white" />)}
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState icon={Factory} title={query ? "No order matches" : `Nothing in ${tab.label}`}>
            {query ? "Try a different search." : items.length ? "Pick another tab above." : "Orders show here once the Operations Admin approves them."}
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
