import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, Boxes, ClipboardList, PackageCheck, Warehouse } from "lucide-react"
import { useGetOrdersQuery } from "@/features/orders/ordersApi"
import { useGetProductsQuery } from "@/features/products/productsApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { useGetAttendanceQuery } from "@/features/attendance/attendanceApi"
import RecentActivity from "@/features/activity/RecentActivity"
import { Notice } from "@/components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Greeting, InfoModal, ListPanel, StatRow, useDrill } from "../DashboardKit"
import { isLowStock, onOrderByComponent, stockRow } from "../rows"

const EMPTY = []
const STATUSES = [
  ["PENDING", "Pending", "bg-warning", "warning"],
  ["MATERIAL_SHORTAGE", "Material shortage", "bg-destructive", "danger"],
  ["READY_FOR_PRODUCTION", "Ready for production", "bg-success", "success"],
  ["IN_PRODUCTION", "In production", "bg-primary", "info"],
  ["TESTING", "In QC", "bg-primary", "info"],
  // after QC, one owner per step (features/finished-goods/fgFlow.js)
  ["PACKAGING", "Packing (QC & FG)", "bg-warning", "warning"],
  ["PACKED", "Packed, Ops Admin to hand over", "bg-warning", "warning"],
  ["HANDED_OVER", "Store to receive", "bg-warning", "warning"],
  ["IN_STORE", "In stock, Marketing to bill", "bg-primary", "info"],
  ["BILLED", "Billed, Store to give out", "bg-primary", "info"],
  ["DISPATCHED", "On the way", "bg-primary", "info"],
  ["COMPLETED", "Delivered", "bg-success", "success"],
]
const ATT = [["Present", "PRESENT", "text-success", "success"], ["Absent", "ABSENT", "text-destructive", "danger"], ["Half day", "HALF_DAY", "text-warning", "warning"], ["On leave", "LEAVE", "text-primary", "info"]]

export default function SuperAdminView() {
  const drill = useDrill()
  const productsQ = useGetProductsQuery()
  const inventoryQ = useGetInventoryQuery("active")
  const ordersQ = useGetOrdersQuery()
  const purchasesQ = useGetPurchasesQuery() // only for the "on order" quantities, so it never blocks the page
  const loading = productsQ.isLoading || inventoryQ.isLoading || ordersQ.isLoading
  const failed = Boolean(productsQ.error || inventoryQ.error || ordersQ.error)
  const [today] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) })
  const { data: att = null } = useGetAttendanceQuery(today)

  const d = useMemo(() => {
    const products = failed ? EMPTY : productsQ.data ?? EMPTY
    const inventory = failed ? EMPTY : inventoryQ.data ?? EMPTY
    const lines = failed ? EMPTY : ordersQ.data ?? EMPTY
    const onOrder = onOrderByComponent(purchasesQ.data)
    const stockOf = (i) => stockRow(i, onOrder.get(i.component_id))

    // the orders API returns one row per product line; group them into one row per order
    const byId = new Map()
    lines.forEach((l) => {
      const o = byId.get(l.id) || { ...l, lines: [] }
      o.lines.push(`${l.product_name} × ${fmtQty(l.quantity)}`)
      byId.set(l.id, o)
    })
    const orderRowOf = (o) => {
      const meta = STATUSES.find((s) => s[0] === o.status)
      const badge = { variant: meta?.[3] || "neutral", label: meta?.[1] || o.status }
      return {
        id: `o${o.id}`, title: o.order_number, sub: o.lines.join(", "), badge,
        detail: (close) => <InfoModal title={o.order_number} badge={badge} fields={[["Raised by", o.created_by_name], ["Approval", o.approval_status], ...o.lines.map((l, i) => [`Product ${i + 1}`, l])]} onClose={close} />,
      }
    }
    const orders = [...byId.values()]
    return {
      productRows: products.map((p) => ({ id: `p${p.id}`, title: p.name, sub: p.sku, detail: (close) => <InfoModal title={p.name} description={p.sku} fields={[["Description", p.description], ["Created by", p.created_by_name]]} onClose={close} /> })),
      orders,
      openRows: orders.filter((o) => o.status !== "COMPLETED").map(orderRowOf),
      byStatus: (k) => orders.filter((o) => o.status === k).map(orderRowOf),
      stockAll: inventory.map(stockOf),
      low: inventory.filter(isLowStock).map(stockOf),
    }
  }, [failed, productsQ.data, inventoryQ.data, ordersQ.data, purchasesQ.data])

  const attRows = (key, variant, label) => (att || []).filter((e) => e.status === key).map((e) => ({ id: `e${e.id ?? e.employee_id ?? e.name}`, title: e.name, sub: [e.employee_code, e.department].filter(Boolean).join(" · "), badge: { variant, label } }))

  return (
    <>
      <Greeting description="Stock health and order load across production." />
      {failed && <div className="mb-6"><Notice title="Something went wrong">Could not load the dashboard. Check that the server is running.</Notice></div>}

      <StatRow
        drill={drill}
        stats={[
          { label: "Products", value: d.productRows.length, icon: Boxes, tone: "blue", loading, detail: "In the catalog", drill: { title: "Products", rows: d.productRows, to: "/products", toLabel: "Open Products", empty: "No products yet" } },
          { label: "Open orders", value: d.openRows.length, icon: ClipboardList, tone: "green", loading, detail: "Not completed yet", drill: { title: "Open orders", rows: d.openRows, to: "/orders", toLabel: "Open Orders", empty: "No open orders" } },
          { label: "Components tracked", value: d.stockAll.length, icon: Warehouse, tone: "violet", loading, detail: "In inventory", drill: { title: "Components in inventory", description: "On hand / minimum level", rows: d.stockAll, to: "/inventory", toLabel: "Open Inventory", empty: "No components yet" } },
          { label: "At or below minimum", value: d.low.length, icon: AlertTriangle, tone: d.low.length ? "amber" : "green", loading, detail: d.low.length ? "Needs reordering" : "All stocked up", drill: { title: "Components at or below minimum", rows: d.low, to: "/inventory?filter=low", toLabel: "Open Inventory", empty: "All components are above minimum" } },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ListPanel drill={drill} loading={loading} className="lg:col-span-2" title="Components to reorder" description="Stock on hand is at or below the minimum level." rows={d.low} to="/inventory?filter=low" toLabel="Open Inventory" emptyIcon={PackageCheck} empty="All components are above minimum" />

        <Card className="self-start">
          <CardHeader><div><CardTitle>Orders by status</CardTitle><CardDescription>{d.orders.length} orders in total</CardDescription></div></CardHeader>
          <div className="space-y-4 p-5">
            {STATUSES.map(([key, label, color], i) => {
              const rows = d.byStatus(key)
              const pct = d.orders.length ? (rows.length / d.orders.length) * 100 : 0
              return (
                <button key={key} type="button" onClick={() => drill.openList({ title: label, rows, to: `/orders?status=${key}`, toLabel: "Open Orders", empty: "No orders in this status" })} className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60">
                  <div className="mb-1.5 flex justify-between text-sm"><span>{label}</span><span className="font-medium tabular-nums">{rows.length}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: `${loading ? 0 : pct}%` }} transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: "easeOut" }} />
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <RecentActivity />

      {att && (
        <Card className="mt-4">
          <CardHeader className="items-center">
            <div><CardTitle>Today&apos;s attendance</CardTitle><CardDescription>{att.filter((e) => !e.status).length} of {att.length} employees not marked yet.</CardDescription></div>
          </CardHeader>
          <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {ATT.map(([label, key, color, variant]) => (
              <button key={key} type="button" onClick={() => drill.openList({ title: `${label} today`, rows: attRows(key, variant, label), to: "/attendance", toLabel: "Open Attendance", empty: "Nobody marked" })} className="px-5 py-4 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{att.filter((e) => e.status === key).length}</p>
              </button>
            ))}
          </div>
        </Card>
      )}
      {drill.host}
    </>
  )
}
