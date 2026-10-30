import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AlertTriangle, ChevronRight, PackageCheck, RefreshCw, Truck, Warehouse } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { StatCard } from "@/components/HistoryUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetFinishedGoodsQuery } from "@/production/finished-goods/finishedGoodsApi"
import { useGetInventoryQuery } from "@/store/inventory/inventoryApi"
import { StockBadge } from "@/store/inventory/components/StockBadge"
import { StageChips, StatusSelect } from "@/sales/marketing-orders/mktKit"
import { useGetIncomingStockQuery } from "@/purchase/shared/purchasingApi"
import { usePermissions } from "@/core/auth/usePermissions"
import { fmtDateTime, fmtQty } from "@/lib/stock"

const EMPTY = []

/*
  The four figures of the Store Manager dashboard, all in one place: /store-status?status=ACCEPT|LOW|RECEIVE|GIVE_OUT.
  Same four names as the dashboard cards. One list is shown at a time; the chosen filter matches the URL.
  This page only lists. Accepting stock, issuing stock and dispatching stay on their own pages (a link on every list).
*/
const VIEWS = {
  ACCEPT: { label: "To accept into stock", detail: "Approved by IQC", description: "IQC approved these purchases. Accept them into stock.", to: "/incoming-stock?status=PENDING_STORE", toLabel: "Open Incoming Stock", icon: Truck, tone: "amber", grad: "from-amber-700 to-orange-800", pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  LOW: { label: "At or below minimum", detail: "Needs reordering", description: "Stock on hand is at or below the minimum level.", to: "/inventory?filter=low", toLabel: "Open Inventory", icon: AlertTriangle, tone: "amber", grad: "from-rose-600 to-red-800", pill: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500" },
  RECEIVE: { label: "Goods to receive", detail: "Handed over by Ops Admin", description: "Packed goods Operations Admin handed over. Count them and receive them into product stock.", to: "/finished-goods", toLabel: "Open Finished Goods", icon: Warehouse, tone: "blue", grad: "from-sky-700 to-blue-800", pill: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  GIVE_OUT: { label: "Goods to give out", detail: "Billed by Marketing", description: "Marketing has billed these orders. Give the goods out for delivery.", to: "/finished-goods", toLabel: "Open Finished Goods", icon: Truck, tone: "violet", grad: "from-violet-600 to-purple-800", pill: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
}
const KEYS = Object.keys(VIEWS)

export default function StoreStatus() {
  const [params, setParams] = useSearchParams()
  const view = KEYS.includes(params.get("status")) ? params.get("status") : KEYS[0]

  const inc = useGetIncomingStockQuery()
  const inv = useGetInventoryQuery("active")
  const { canView } = usePermissions()
  const fg = useGetFinishedGoodsQuery(undefined, { skip: !canView("finishedGoods") })

  const lists = useMemo(() => ({
    ACCEPT: (inc.data ?? EMPTY).filter((p) => p.status === "PENDING_STORE"),
    LOW: (inv.data ?? EMPTY).filter((i) => Number(i.quantity_on_hand) <= Number(i.minimum_stock_level)),
    RECEIVE: (fg.data ?? EMPTY).filter((x) => x.status === "HANDED_OVER"),
    GIVE_OUT: (fg.data ?? EMPTY).filter((x) => x.status === "BILLED"),
  }), [inc.data, inv.data, fg.data])

  const loadingOf = { ACCEPT: inc.isLoading, LOW: inv.isLoading, RECEIVE: fg.isLoading, GIVE_OUT: fg.isLoading }
  const failed = inc.error || inv.error || fg.error
  const fetching = inc.isFetching || inv.isFetching || fg.isFetching
  const refetch = () => { inc.refetch(); inv.refetch(); fg.refetch() }

  const filters = KEYS.map((k) => {
    const v = VIEWS[k]
    return { key: k, label: v.label, value: lists[k].length, icon: v.icon, tone: v.tone, detail: v.detail, grad: v.grad, pill: v.pill, dot: v.dot, active: view === k, onClick: () => setParams({ status: k }, { replace: true }) }
  })
  const cur = VIEWS[view]
  const rows = lists[view]
  const loading = loadingOf[view]

  return (
    <>
      <PageHeader title="Store: waiting for you" description="Goods to accept, stock to reorder, goods to receive and goods to give out. Pick one to see its list.">
        <Button variant="outline" onClick={refetch} disabled={fetching}><RefreshCw className={fetching ? "animate-spin" : ""} /> Refresh</Button>
      </PageHeader>

      {failed && <div className="mb-4"><Notice title="Something went wrong">Could not load the store figures. Check that the server is running.</Notice></div>}

      {/* chips on a phone, cards on a tablet, a dropdown on a PC */}
      <div className="mb-4 hidden lg:block">
        <StatusSelect className="w-64" portal label="Store figures" items={filters.map((f) => ({ key: f.key, label: f.label, value: f.value, dot: f.dot, active: f.active, onClick: f.onClick }))} />
      </div>
      <StageChips label="Store figures" items={filters} />
      <div className="hidden gap-4 sm:grid-cols-2 md:grid lg:hidden xl:grid-cols-4">
        {filters.map((f, i) => (
          <StatCard key={f.key} index={i} icon={f.icon} tone={f.tone} label={f.label} value={f.value} loading={loadingOf[f.key]} detail={f.detail} active={f.active} onClick={f.onClick} />
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader className="items-center">
          <div>
            <CardTitle>{cur.label}</CardTitle>
            <CardDescription>{cur.description}</CardDescription>
          </div>
          <Link to={cur.to} className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-primary outline-none hover:underline focus-visible:underline">
            {cur.toLabel} <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </CardHeader>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={`Nothing ${cur.label.toLowerCase()}`} />
        ) : view === "ACCEPT" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Purchase</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">To receive</TableHead><TableHead>Approved by IQC</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">{p.po_number}</TableCell>
                  <TableCell>{p.supplier}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmtQty(p.totals?.approved ?? 0)}</TableCell>
                  <TableCell><UserCell name={p.iqc_by_name} sub={fmtDateTime(p.iqc_at)} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : view === "LOW" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Component</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Minimum</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.component_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.sku}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmtQty(i.quantity_on_hand)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(i.minimum_stock_level)}</TableCell>
                  <TableCell><StockBadge item={i} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Order</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>{view === "GIVE_OUT" ? "Billed by" : "Handed over by"}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((x) => (
                <TableRow key={x.id ?? `${x.orderNumber}-${x.productSku}`}>
                  <TableCell className="font-medium tabular-nums">{x.orderNumber || "-"}</TableCell>
                  <TableCell>{x.productName || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{x.productSku || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums"><Badge variant="neutral">{fmtQty(x.quantity ?? 0)}</Badge></TableCell>
                  <TableCell><UserCell name={view === "GIVE_OUT" ? x.billedByName : x.handedOverByName} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  )
}
