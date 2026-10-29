import { ChevronRight, FlaskConical, ShoppingCart, Warehouse } from "lucide-react"
import { Link } from "react-router-dom"
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

/*
  One figure inside a department card. It opens the list behind it, filtered the same way: e.g. "Awaiting supplier
  delivery" opens the purchases the Purchase Manager placed that have not arrived yet.
*/
function Stat({ label, value, loading, tone, to }) {
  return (
    <Link to={to} className="-mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className={cn("shrink-0 font-semibold tabular-nums", tone)}>
        {loading ? <span className="inline-block h-4 w-6 animate-pulse rounded bg-slate-200/80 align-middle" aria-label="Loading" /> : value}
      </span>
    </Link>
  )
}

/* Read-only summary of a department, in the Super Admin's Panel look: name, its figures as lines, then a link to its own dashboard. */
function Panel({ icon: Icon, title, description, dept, children }) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="truncate text-xs text-muted-foreground">· {description}</span>
      </div>
      <div>{children}</div>
      <Link to={`/dashboard?dept=${dept}`} className="mt-2 inline-flex items-center gap-0.5 self-start text-xs font-semibold text-primary hover:underline">
        {title} dashboard <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}

function IqcPanel() {
  const buys = useGetPurchasesQuery()
  const c = countPurchases(buys.data ?? EMPTY)
  const l = buys.isLoading
  return (
    <Panel icon={FlaskConical} title="IQC" description="Incoming inspection" dept="iqc">
      <Stat label="Waiting for inspection" value={c.PENDING_IQC} loading={l} tone={c.PENDING_IQC ? "text-lp-ink" : undefined} to="/iqc?status=PENDING_IQC" />
      <Stat label="Inspected, all time" value={c.PENDING_STORE + c.STORED + c.REJECTED} loading={l} to="/iqc?status=INSPECTED" />
      <Stat label="Rejected" value={c.REJECTED} loading={l} tone={c.REJECTED ? "text-rose-700" : undefined} to="/iqc?status=REJECTED" />
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
      <Stat label="To accept into stock" value={c.PENDING_STORE} loading={buys.isLoading} tone={c.PENDING_STORE ? "text-lp-ink" : undefined} to="/incoming-stock?status=PENDING_STORE" />
      <Stat label="Low stock" value={low} loading={inv.isLoading} tone={low ? "text-amber-700" : undefined} to="/inventory?filter=low" />
      <Stat label="Out of stock" value={out} loading={inv.isLoading} tone={out ? "text-rose-700" : undefined} to="/inventory?filter=out" />
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
      {canOrders && <Stat label="Component lines to order" value={lines} loading={ord.isLoading} tone={lines ? "text-amber-700" : undefined} to="/purchase-requests" />}
      <Stat label="Awaiting supplier delivery" value={c.ORDER_PLACED} loading={buys.isLoading} tone={c.ORDER_PLACED ? "text-lp-ink" : undefined} to="/purchase?status=ORDER_PLACED" />
      <Stat label="Received, not sent to IQC" value={c.RECEIVED} loading={buys.isLoading} to="/purchase?status=RECEIVED" />
      <Stat label="Sent to IQC" value={c.PENDING_IQC} loading={buys.isLoading} tone={c.PENDING_IQC ? "text-lp-ink" : undefined} to="/purchase?status=PENDING_IQC" />
    </Panel>
  )
}

const PANELS = { iqc: IqcPanel, store: StorePanel, purchase: PurchasePanel }
// the department each role owns: its own card is never shown to itself
const OWN = { [ROLES.IQC_MANAGER]: "iqc", [ROLES.STORE_MANAGER]: "store", [ROLES.PURCHASE_MANAGER]: "purchase" }

/*
  Read-only overview of the other departments. depts = which ones to offer; the viewer's own department is skipped.
  Each figure opens its list (filtered), each card's bottom link that department's main dashboard.
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
            <CardTitle id="dept-overview">Other departments</CardTitle>
            <CardDescription>What {names.join(" and ")} {names.length > 1 ? "have" : "has"} in hand right now.</CardDescription>
          </div>
        </CardHeader>
        <div className={cn("grid gap-x-8 gap-y-5 px-5 pb-5", shown.length > 1 && "sm:grid-cols-2", shown.length > 2 && "xl:grid-cols-3")}>
          {shown.map((d) => { const P = PANELS[d]; return <P key={d} /> })}
        </div>
      </Card>
    </section>
  )
}
