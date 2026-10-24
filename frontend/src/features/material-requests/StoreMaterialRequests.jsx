import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  UserRound,
  Warehouse,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import ListViewControls from "@/components/ListViewControls"
import Pagination from "@/components/Pagination"
import { useGetMaterialRequestsQuery } from "./materialRequestsApi"
import IssueMaterialRequestModal from "./IssueMaterialRequestModal"
import MaterialRequestDetailsModal from "./MaterialRequestDetailsModal"
import { errorMessage, fmtDateTime } from "@/lib/stock"
import { isWithinDateRange, recordTimestamp, uniqueStringOptions } from "@/lib/listViewUtils"
import { HeroButton, MktHero, SearchField, StageTile, TileGrid } from "@/features/marketing-orders/mktKit"

const PAGE_SIZE = 9

const STATUS_META = {
  PENDING: {
    label: "Needs allotment",
    shortLabel: "Pending",
    variant: "warning",
    icon: Clock3,
    accent: "from-amber-700 to-orange-800",
    soft: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
  },
  PARTIALLY_ISSUED: {
    label: "Partially allotted",
    shortLabel: "Partial",
    variant: "info",
    icon: PackageOpen,
    accent: "from-blue-600 to-indigo-800",
    soft: "bg-blue-50 text-blue-800 ring-blue-200",
    dot: "bg-blue-500",
  },
  ISSUED: {
    label: "Fully allotted",
    shortLabel: "Complete",
    variant: "success",
    icon: BadgeCheck,
    accent: "from-emerald-700 to-teal-800",
    soft: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
  },
}

function getStatusMeta(status) {
  return STATUS_META[status] || {
    ...STATUS_META.PENDING,
    label: status || "Unknown status",
    shortLabel: status || "Unknown",
  }
}

function getRequestMetrics(request) {
  const items = Array.isArray(request.items) ? request.items : []
  const completeLines = items.filter((item) => Number(item.remaining_quantity) <= 0).length
  const outstandingLines = items.filter((item) => Number(item.remaining_quantity) > 0).length
  const partiallyIssuedLines = items.filter(
    (item) => Number(item.issued_quantity) > 0 && Number(item.remaining_quantity) > 0,
  ).length
  const progress = items.length ? Math.round((completeLines / items.length) * 100) : 0
  return { items, completeLines, outstandingLines, partiallyIssuedLines, progress }
}

function RequestStatus({ status }) {
  const meta = getStatusMeta(status)
  return (
    <Badge variant={meta.variant} className="max-w-full whitespace-normal">
      <span className={`mr-1.5 inline-block size-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </Badge>
  )
}

function RequestProgress({ request, compact = false }) {
  const { items, completeLines, outstandingLines, progress } = getRequestMetrics(request)
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700">Components handed over</span>
        <span className="shrink-0 font-bold tabular-nums text-slate-800">{completeLines}/{items.length}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={`Component lines handed over for request ${request.id}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ${outstandingLines ? "from-emerald-700 to-teal-800" : "from-emerald-700 to-teal-800"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className={outstandingLines ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
            {outstandingLines ? `${outstandingLines} component line${outstandingLines === 1 ? "" : "s"} outstanding` : "All requested components handed over"}
          </span>
          {getRequestMetrics(request).partiallyIssuedLines > 0 && (
            <span className="text-blue-700">{getRequestMetrics(request).partiallyIssuedLines} partially issued</span>
          )}
        </div>
      )}
    </div>
  )
}

function RequestCard({ request, onView, onAllot }) {
  const { items, completeLines, outstandingLines, progress, partiallyIssuedLines } = getRequestMetrics(request)
  const meta = getStatusMeta(request.status)
  const StatusIcon = meta.icon
  const canIssue = request.status !== "ISSUED" && outstandingLines > 0
  const names = items.slice(0, 3).map((item) => item.name).filter(Boolean)
  const extraCount = Math.max(0, items.length - names.length)

  return (
    <Card className="group relative min-w-0 overflow-hidden border-[#E3E6EB] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`h-1 bg-gradient-to-r ${meta.accent}`} />
      <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ${meta.soft}`}>
            <StatusIcon className="size-5" aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => onView(request)}
            className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/50"
            aria-label={`View request ${request.id} material list`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Request #{request.id}</span>
              <RequestStatus status={request.status} />
            </div>
            <p className="mt-1 break-words text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-slate-950">
              {request.product_name || "Product request"}
            </p>
            <p className="mt-1 break-words text-xs text-slate-600">
              {request.order_number || `Order #${request.order_id}`} · {request.product_sku || "No SKU"}
            </p>
            {request.requested_product_quantity !== null && request.requested_product_quantity !== undefined && (
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                Products: {request.issued_product_quantity || 0} / {request.requested_product_quantity} allotted
              </p>
            )}
          </button>
          <button
            type="button"
            onClick={() => onView(request)}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/50"
            aria-label={`Open details for request ${request.id}`}
            title="View request details"
          >
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Requested on</p>
              <p className="mt-0.5 break-words text-xs font-semibold text-slate-800">{fmtDateTime(request.created_at)}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <UserRound className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Requested by</p>
              <p className="mt-0.5 break-words text-xs font-semibold text-slate-800">{request.requested_by_name || "Production"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Boxes className="size-4 text-emerald-700" aria-hidden />
              Requested components
            </div>
            <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">{items.length} line{items.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {names.map((name, index) => (
              <span key={`${request.id}-${name}-${index}`} className="max-w-full truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                {name}
              </span>
            ))}
            {extraCount > 0 && <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800">+{extraCount} more</span>}
            {!items.length && <span className="text-xs text-slate-500">No component lines found</span>}
          </div>
          {partiallyIssuedLines > 0 && <p className="mt-2 text-[11px] font-semibold text-blue-700">{partiallyIssuedLines} line{partiallyIssuedLines === 1 ? "" : "s"} partially allotted</p>}
        </div>

        <RequestProgress request={request} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onView(request)} className="border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800">
            <Eye className="size-4" /> View list
          </Button>
          {canIssue ? (
            <Button type="button" size="sm" onClick={() => onAllot(request)} className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white shadow-sm hover:brightness-110">
              <PackageCheck className="size-4" /> Allot materials
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" /> Handover complete</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RequestActions({ request, onView, onAllot }) {
  const { outstandingLines } = getRequestMetrics(request)
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => onView(request)} className="border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800">
        <Eye className="size-3.5" /> View
      </Button>
      {request.status !== "ISSUED" && outstandingLines > 0 && (
        <Button type="button" size="sm" onClick={() => onAllot(request)} className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white hover:brightness-110">
          <PackageCheck className="size-3.5" /> Allot
        </Button>
      )}
    </div>
  )
}

export default function StoreMaterialRequests() {
  const { data = [], isLoading, isFetching, error, refetch } = useGetMaterialRequestsQuery()
  const [detailsRequest, setDetailsRequest] = useState(null)
  const [issueRequest, setIssueRequest] = useState(null)
  const [activeFilter, setActiveFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [productFilter, setProductFilter] = useState("all")
  const [requesterFilter, setRequesterFilter] = useState("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [view, setView] = useState("cards")
  const [page, setPage] = useState(1)

  const allRequests = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const pendingRequests = useMemo(() => allRequests.filter((request) => request.status === "PENDING"), [allRequests])
  const partialRequests = useMemo(() => allRequests.filter((request) => request.status === "PARTIALLY_ISSUED"), [allRequests])
  const completedRequests = useMemo(() => allRequests.filter((request) => request.status === "ISSUED"), [allRequests])
  const outstandingRequests = useMemo(() => allRequests.filter((request) => getRequestMetrics(request).outstandingLines > 0), [allRequests])
  const outstandingLineCount = useMemo(
    () => allRequests.reduce((sum, request) => sum + getRequestMetrics(request).outstandingLines, 0),
    [allRequests],
  )

  const requestCounts = {
    all: allRequests.length,
    open: pendingRequests.length,
    partial: partialRequests.length,
    complete: completedRequests.length,
  }

  const productOptions = useMemo(
    () => uniqueStringOptions(allRequests, (request) => request.product_name, "All products"),
    [allRequests],
  )
  const requesterOptions = useMemo(
    () => uniqueStringOptions(allRequests, (request) => request.requested_by_name, "All requesters"),
    [allRequests],
  )

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    let list = allRequests
    if (activeFilter === "open") list = pendingRequests
    else if (activeFilter === "outstanding") list = outstandingRequests
    else if (activeFilter === "partial") list = partialRequests
    else if (activeFilter === "complete") list = completedRequests

    list = list.filter((request) => {
      if (productFilter !== "all" && request.product_name !== productFilter) return false
      if (requesterFilter !== "all" && request.requested_by_name !== requesterFilter) return false
      if (!isWithinDateRange(request.created_at, fromDate, toDate)) return false
      if (!query) return true
      return [
        request.id,
        request.order_number,
        request.order_id,
        request.product_name,
        request.product_sku,
        request.requested_by_name,
        request.status,
        ...(Array.isArray(request.items) ? request.items.flatMap((item) => [item.name, item.sku]) : []),
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query))
    })

    return [...list].sort((a, b) => {
      const aTime = recordTimestamp(a.created_at)
      const bTime = recordTimestamp(b.created_at)
      const aOutstanding = getRequestMetrics(a).outstandingLines
      const bOutstanding = getRequestMetrics(b).outstandingLines
      if (sortBy === "oldest") return aTime - bTime || Number(a.id) - Number(b.id)
      if (sortBy === "most-outstanding") return bOutstanding - aOutstanding || bTime - aTime
      if (sortBy === "least-outstanding") return aOutstanding - bOutstanding || bTime - aTime
      if (sortBy === "product") return String(a.product_name || "").localeCompare(String(b.product_name || ""))
      return bTime - aTime || Number(b.id) - Number(a.id)
    })
  }, [activeFilter, allRequests, completedRequests, fromDate, outstandingRequests, partialRequests, pendingRequests, productFilter, requesterFilter, search, sortBy, toDate])

  const pageRows = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const updateSearch = (value) => { setSearch(value); setPage(1) }
  const updateFilter = (value) => { setActiveFilter(value); setPage(1) }
  const clearFilters = () => {
    setActiveFilter("all")
    setProductFilter("all")
    setRequesterFilter("all")
    setFromDate("")
    setToDate("")
    setPage(1)
  }

  const toolbarFilters = [
    {
      key: "request-status",
      label: "Request status",
      value: activeFilter,
      options: [
        { value: "all", label: "All requests" },
        { value: "open", label: "Needs allotment" },
        { value: "outstanding", label: "Any outstanding materials" },
        { value: "partial", label: "Partially allotted" },
        { value: "complete", label: "Completed" },
      ],
      onChange: updateFilter,
    },
    {
      key: "product",
      label: "Product",
      value: productFilter,
      options: productOptions,
      onChange: (value) => { setProductFilter(value); setPage(1) },
    },
    {
      key: "requester",
      label: "Requested by",
      value: requesterFilter,
      options: requesterOptions,
      onChange: (value) => { setRequesterFilter(value); setPage(1) },
    },
    {
      key: "from-date",
      label: "Requested from",
      type: "date",
      value: fromDate,
      onChange: (value) => { setFromDate(value); setPage(1) },
    },
    {
      key: "to-date",
      label: "Requested to",
      type: "date",
      value: toDate,
      onChange: (value) => { setToDate(value); setPage(1) },
    },
  ]
  const sortOptions = [
    { value: "newest", label: "Newest requests first" },
    { value: "oldest", label: "Oldest requests first" },
    { value: "most-outstanding", label: "Most outstanding lines first" },
    { value: "least-outstanding", label: "Fewest outstanding lines first" },
    { value: "product", label: "Product name A–Z" },
  ]

  const stats = [
    {
      key: "all", label: "All requests", hint: "Every request from Production", icon: Warehouse, value: requestCounts.all,
      active: activeFilter === "all", tone: "neutral", s: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/20" }, onClick: () => updateFilter("all"),
    },
    {
      key: "open", label: "Needs allotment", hint: "New requests waiting for Store", icon: Clock3, value: requestCounts.open,
      active: activeFilter === "open", tone: "warning", s: { grad: "from-amber-700 to-orange-800", glow: "shadow-amber-500/25" }, onClick: () => updateFilter("open"),
    },
    {
      key: "partial", label: "Partially allotted", hint: "Can receive more material", icon: PackageOpen, value: requestCounts.partial,
      active: activeFilter === "partial", tone: "info", s: { grad: "from-blue-600 to-indigo-800", glow: "shadow-blue-500/25" }, onClick: () => updateFilter("partial"),
    },
    {
      key: "complete", label: "Completed requests", hint: "All requested components handed over", icon: CheckCircle2, value: requestCounts.complete,
      active: activeFilter === "complete", tone: "success", s: { grad: "from-emerald-700 to-teal-800", glow: "shadow-emerald-500/25" }, onClick: () => updateFilter("complete"),
    },
  ]

  const hasActiveFilters = activeFilter !== "all" || productFilter !== "all" || requesterFilter !== "all" || !!fromDate || !!toDate
  const emptyTitle = search.trim() || hasActiveFilters ? "No matching material requests" : "No material requests yet"
  const emptyDescription = search.trim() || hasActiveFilters
    ? "Try a different search or clear one or more filters."
    : "When Production requests approved materials, requests will appear here."

  return (
    <>
      <MktHero
        eyebrow="Store operations"
        title="Material Allotment"
        description="Review requests from Production and record full or partial material handovers."
      >
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh material requests">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Couldn't load material requests">{errorMessage(error, "Refresh to try again.")}</Notice></div>}

      <div className="min-w-0 space-y-4">
        <div className="hidden md:block">
          <TileGrid className="md:grid-cols-4 xl:grid-cols-4">
            {stats.map((item) => (
              <StageTile key={item.key} stage={item} value={item.value} loading={isLoading} active={item.active} onClick={item.onClick} />
            ))}
          </TileGrid>
        </div>

        <Card className="min-w-0 overflow-hidden border-[#E3E6EB] shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
          <div className="md:hidden">
            <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
              {stats.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  aria-pressed={item.active}
                  className={`relative min-w-0 bg-white px-3 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600/60 ${item.active ? "bg-emerald-50/80" : "hover:bg-slate-50"}`}
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><span className={`size-2 rounded-full ${item.key === "open" ? "bg-amber-500" : item.key === "partial" ? "bg-blue-500" : item.key === "complete" ? "bg-emerald-500" : "bg-slate-500"}`} />{item.label}</span>
                  <span className="mt-1 block text-xl font-extrabold tabular-nums text-slate-900">{isLoading ? "—" : item.value}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3 border-y border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
            <div className="hidden min-w-0 flex-1 md:block md:max-w-sm">
              <SearchField value={search} onChange={updateSearch} placeholder="Search order, product, SKU or component..." />
            </div>
            <div className="min-w-0 flex-1 md:hidden">
              <SearchField value={search} onChange={updateSearch} placeholder="Search requests or components..." />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 sm:inline-flex">
                <Boxes className="size-3.5" aria-hidden /> {outstandingLineCount} lines outstanding
              </span>
              <p className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-slate-600">{filteredRequests.length} result{filteredRequests.length === 1 ? "" : "s"}</p>
            </div>
            <ListViewControls
              view={view}
              onViewChange={(nextView) => { setView(nextView); setPage(1) }}
              sortBy={sortBy}
              onSortChange={(value) => { setSortBy(value); setPage(1) }}
              sortOptions={sortOptions}
              filters={toolbarFilters}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          {isLoading ? (
            <>
              <div className="hidden grid-cols-2 gap-4 p-4 lg:grid 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />)}
              </div>
              <div className="lg:hidden"><TableSkeleton rows={6} /></div>
            </>
          ) : filteredRequests.length === 0 ? (
            <EmptyState icon={ClipboardList} title={emptyTitle} description={emptyDescription} />
          ) : (
            <>
              <div className={`hidden min-w-0 grid-cols-2 gap-4 p-4 2xl:grid-cols-3 ${view === "cards" ? "lg:grid" : "lg:hidden"}`}>
                {pageRows.map((request) => (
                  <RequestCard key={request.id} request={request} onView={setDetailsRequest} onAllot={setIssueRequest} />
                ))}
              </div>

              <div className={`hidden min-w-0 overflow-x-auto ${view === "table" ? "lg:block" : "lg:hidden"}`}>
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%] whitespace-normal">Order / product</TableHead>
                      <TableHead className="w-[13%] whitespace-normal">Components</TableHead>
                      <TableHead className="w-[17%] whitespace-normal">Handover progress</TableHead>
                      <TableHead className="w-[12%] whitespace-normal">Requested by</TableHead>
                      <TableHead className="w-[12%] whitespace-normal">Requested on</TableHead>
                      <TableHead className="w-[12%] whitespace-normal">Status</TableHead>
                      <TableHead className="w-[14%] whitespace-normal">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((request) => {
                      const metrics = getRequestMetrics(request)
                      return (
                        <TableRow key={request.id} className="group/row cursor-pointer hover:bg-emerald-50/30" onClick={() => setDetailsRequest(request)}>
                          <TableCell className="min-w-0 whitespace-normal align-top">
                            <button type="button" onClick={(event) => { event.stopPropagation(); setDetailsRequest(request) }} className="break-words text-left font-bold text-slate-900 hover:text-emerald-800 focus-visible:outline-none focus-visible:underline">
                              {request.order_number || `Order #${request.order_id}`}
                            </button>
                            <p className="mt-1 break-words text-xs text-slate-600">{request.product_name || "Product request"}</p>
                            <p className="mt-1 break-words text-[11px] text-slate-500">{request.product_sku || "No SKU"} · Request #{request.id}</p>
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal align-top">
                            <p className="font-semibold tabular-nums text-slate-800">{metrics.items.length} line{metrics.items.length === 1 ? "" : "s"}</p>
                            <p className="mt-1 text-xs text-amber-700">{metrics.outstandingLines} outstanding</p>
                            {metrics.partiallyIssuedLines > 0 && <p className="mt-1 text-xs text-blue-700">{metrics.partiallyIssuedLines} partial</p>}
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal align-top"><RequestProgress request={request} compact /></TableCell>
                          <TableCell className="min-w-0 whitespace-normal align-top">
                            <div className="flex items-start gap-1.5 text-xs text-slate-700"><UserRound className="mt-0.5 size-3.5 shrink-0 text-blue-700" /><span className="break-words">{request.requested_by_name || "Production"}</span></div>
                          </TableCell>
                          <TableCell className="whitespace-normal align-top text-xs text-slate-600">{fmtDateTime(request.created_at)}</TableCell>
                          <TableCell className="whitespace-normal align-top"><RequestStatus status={request.status} /></TableCell>
                          <TableCell className="min-w-0 whitespace-normal align-top" onClick={(event) => event.stopPropagation()}><RequestActions request={request} onView={setDetailsRequest} onAllot={setIssueRequest} /></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Like Production, small screens use the readable cards regardless of the desktop view preference. */}
              <div className="grid min-w-0 gap-3 p-3 lg:hidden">
                {pageRows.map((request) => <RequestCard key={request.id} request={request} onView={setDetailsRequest} onAllot={setIssueRequest} />)}
              </div>

              <Pagination page={page} pageSize={PAGE_SIZE} total={filteredRequests.length} onPage={setPage} noun="material requests" />
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[11px] text-slate-500 sm:px-5">
            <span>Showing {pageRows.length} of {filteredRequests.length} filtered · {allRequests.length} total requests</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" /> Handover records only; inventory is not deducted twice.</span>
          </div>
        </Card>
      </div>

      {detailsRequest && (
        <MaterialRequestDetailsModal
          request={detailsRequest}
          onClose={() => setDetailsRequest(null)}
          onAllot={(request) => {
            setDetailsRequest(null)
            setIssueRequest(request)
          }}
        />
      )}
      {issueRequest && <IssueMaterialRequestModal request={issueRequest} onClose={() => setIssueRequest(null)} />}
    </>
  )
}
