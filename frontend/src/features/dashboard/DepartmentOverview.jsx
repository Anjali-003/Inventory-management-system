import { ChevronRight, FlaskConical, ShoppingCart, Warehouse } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import { stockState } from "@/features/inventory/components/StockBadge"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { countPurchases } from "@/features/purchasing/purchaseKit"
import { ROLES } from "@/lib/permissions"
import { cn } from "@/lib/utils"

const EMPTY = []

/* only the components that are still to be ordered (lines already on a purchase order are done) */
export const shortageOf = (o) => (o.purchase_request?.items || EMPTY).filter((c) => c.purchase_order_id == null)

/* One read-only figure inside a department card (the card itself is the link, so this is not one). */
function Stat({ label, value, loading, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dce5e0] bg-background px-3.5 py-2.5">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      <span className={cn("shrink-0 text-lg font-bold tabular-nums", tone)}>
        {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded-md bg-slate-200/80 align-middle" aria-label="Loading" /> : value}
      </span>
    </div>
  )
}

/* Read-only summary of a department. The whole card opens that department's MAIN dashboard (/dashboard?dept=...). */
function Panel({ icon: Icon, title, description, dept, children }) {
  return (
    <Link to={`/dashboard?dept=${dept}`} aria-label={`Open ${title} Dashboard`} className="group flex flex-col gap-3 rounded-2xl border border-[#dce5e0] bg-card p-4 outline-none transition-[border-color,box-shadow] duration-200 hover:border-[#c3d1ca] hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-[18px]" aria-hidden /></span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="neutral" className="shrink-0">View only</Badge>
      </div>
      <div className="grid gap-2">{children}</div>
      <span className="mt-auto inline-flex items-center gap-0.5 self-start text-xs font-semibold text-primary group-hover:underline">
        Open {title} Dashboard <ChevronRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  )
}

function IqcPanel() {
  const buys = useGetPurchasesQuery()
  const c = countPurchases(buys.data ?? EMPTY)
  const l = buys.isLoading
  return (
    <Panel icon={FlaskConical} title="IQC" description="Incoming inspection" dept="iqc">
      <Stat label="Waiting for inspection" value={c.PENDING_IQC} loading={l} tone={c.PENDING_IQC ? "text-violet-700" : undefined} />
      <Stat label="Inspected, all time" value={c.PENDING_STORE + c.STORED + c.REJECTED} loading={l} />
      <Stat label="Rejected" value={c.REJECTED} loading={l} tone={c.REJECTED ? "text-rose-700" : undefined} />
    </Panel>
  )
}

function StorePanel() {
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery()
  const c = countPurchases(buys.data ?? EMPTY)
  const stock = Array.isArray(inv.data) ? inv.data : EMPTY
  const low = stock.filter((i) => stockState(i) === "low").length
  const out = stock.filter((i) => stockState(i) === "out").length
  return (
    <Panel icon={Warehouse} title="Store" description="Incoming stock and inventory" dept="store">
      <Stat label="To accept into stock" value={c.PENDING_STORE} loading={buys.isLoading} tone={c.PENDING_STORE ? "text-cyan-700" : undefined} />
      <Stat label="Low stock" value={low} loading={inv.isLoading} tone={low ? "text-amber-700" : undefined} />
      <Stat label="Out of stock" value={out} loading={inv.isLoading} tone={out ? "text-rose-700" : undefined} />
    </Panel>
  )
}

function PurchasePanel() {
  const { canView } = usePermissions()
  const canOrders = canView("approvedOrders") // roles without this page cannot read approved orders, so that figure is left out
  const buys = useGetPurchasesQuery()
  const ord = useGetApprovedOrdersQuery(undefined, { skip: !canOrders })
  const c = countPurchases(buys.data ?? EMPTY)
  const lines = (ord.data ?? EMPTY).reduce((sum, o) => sum + shortageOf(o).length, 0)
  return (
    <Panel icon={ShoppingCart} title="Purchase" description="Buying and supplier deliveries" dept="purchase">
      {canOrders && <Stat label="Component lines to order" value={lines} loading={ord.isLoading} tone={lines ? "text-amber-700" : undefined} />}
      <Stat label="Awaiting supplier delivery" value={c.ORDER_PLACED} loading={buys.isLoading} tone={c.ORDER_PLACED ? "text-blue-700" : undefined} />
      <Stat label="Received, not sent to IQC" value={c.RECEIVED} loading={buys.isLoading} />
    </Panel>
  )
}

const PANELS = { iqc: IqcPanel, store: StorePanel, purchase: PurchasePanel }
// the department each role owns: its own card is never shown to itself
const OWN = { [ROLES.IQC_MANAGER]: "iqc", [ROLES.STORE_MANAGER]: "store", [ROLES.PURCHASE_MANAGER]: "purchase" }

/*
  Read-only overview of the other departments. depts = which ones to offer; the viewer's own department is skipped.
  Each card opens that department's main dashboard.
*/
export default function DepartmentOverview({ depts, className }) {
  const { role } = usePermissions()
  const own = OWN[String(role || "").toUpperCase()]
  const shown = depts.filter((d) => d !== own)
  if (shown.length === 0) return null
  const names = shown.map((d) => ({ iqc: "IQC", store: "the Store", purchase: "Purchase" })[d])
  return (
    <section aria-labelledby="dept-overview" className={className}>
      <Card className="overflow-hidden">
        <CardHeader className="items-center">
          <div>
            <CardTitle id="dept-overview">Department Overview</CardTitle>
            <CardDescription>What {names.join(" and ")} {names.length > 1 ? "have" : "has"} in hand right now.</CardDescription>
          </div>
        </CardHeader>
        <div className={cn("grid gap-3 p-4 pt-0", shown.length > 1 && "sm:grid-cols-2", shown.length > 2 && "xl:grid-cols-3")}>
          {shown.map((d) => { const P = PANELS[d]; return <P key={d} /> })}
        </div>
      </Card>
    </section>
  )
}
