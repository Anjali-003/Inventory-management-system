import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, CheckCircle2, ClipboardCheck, Hourglass, ShoppingCart, XCircle } from "lucide-react"
import { pageButtonClass } from "@/components/PageKit"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetOrderApprovalsQuery } from "@/features/order-approvals/orderApprovalsApi"
import OpsOrderDrawer from "@/features/order-approvals/OpsOrderDrawer"
import PurchaseDrawer from "@/features/purchase/PurchaseDrawer"
import { ApprovalList, opsHref } from "@/features/order-approvals/opsKit"
import { countByStatus, newestFirst, plural } from "@/features/marketing-orders/orderParts"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import DepartmentOverview from "../DepartmentOverview"
import { EmptyLine, Greeting, ListPanel, Panel, PanelLink, StatRow, useDrill } from "../DashboardKit"
import { isLowStock, onOrderByComponent, purchaseRow, stockRow } from "../rows"

const EMPTY = []
const QUEUE = "PENDING_APPROVAL"
const LIMIT = 5

/* The Purchase page's side drawer for one purchase, read-only here (the Operations Admin only follows purchases).
   It reads the purchase from the live list by id, and closes itself if the purchase is no longer in it. */
function OpsPurchaseDrawer({ purchaseId, onClose }) {
  const { data = EMPTY } = useGetPurchasesQuery()
  const [tab, setTab] = useState("overview")
  const purchase = data.find((p) => p.id === purchaseId) ?? null
  return <PurchaseDrawer purchase={purchase} tab={tab} onTab={setTab} onClose={onClose} editable={false} />
}

/* Plain-language line under "Hello": the one thing worth doing next. */
function nudge(counts, low) {
  if (counts[QUEUE]) return `${plural(counts[QUEUE], "order")} waiting for your decision. Open one to check stock and decide.`
  if (low) return `No order is waiting. ${plural(low, "component")} at or below the minimum: check they are on order.`
  return "Nothing is waiting for you. Here is how orders, purchase and stock are doing."
}

/*
  Operations Admin dashboard, in the one dashboard look (the Super Admin's): "Hello" and the next thing to do, the
  figures (each opens its list), then the lists. Clicking an order opens the full Operations popup (stock check,
  progress, products, Reject / Check stock & send); a purchase opens the Purchase drawer read-only.
*/
export default function OperationsView() {
  const drill = useDrill()
  const appr = useGetOrderApprovalsQuery()
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery("active")
  const loading = appr.isLoading || buys.isLoading || inv.isLoading
  const [openedId, setOpenedId] = useState(null) // the order whose side drawer is open

  const orders = appr.data ?? EMPTY
  const counts = useMemo(() => countByStatus(orders), [orders])

  const d = useMemo(() => {
    const latest = [...orders].sort(newestFirst)
    const onOrder = onOrderByComponent(buys.data)
    const by = (s) => latest.filter((o) => o.approval_status === s)
    return {
      pending: by(QUEUE),
      rejected: by("REJECTED"),
      inProgress: (buys.data ?? EMPTY).filter((p) => p.status !== "STORED" && p.status !== "REJECTED").map((p) => ({ ...purchaseRow(p), detail: (close) => <OpsPurchaseDrawer purchaseId={p.id} onClose={close} /> })),
      low: (inv.data ?? EMPTY).filter(isLowStock).map((i) => stockRow(i, onOrder.get(i.component_id))),
    }
  }, [orders, buys.data, inv.data])

  const open = (o) => setOpenedId(o.id)

  return (
    <>
      <Greeting description={nudge(counts, d.low.length)}>
        <Link to={opsHref(QUEUE)} className={pageButtonClass("primary")}><ClipboardCheck /> Orders to approve</Link>
      </Greeting>

      <StatRow drill={drill} stats={[
        { label: "Waiting for your decision", value: counts[QUEUE] ?? 0, icon: Hourglass, tone: counts[QUEUE] ? "amber" : "green", loading: appr.isLoading,
          detail: counts[QUEUE] ? "Check stock, then approve or reject" : "Nothing to decide", to: opsHref(QUEUE) },
        { label: "Approved", value: counts.APPROVED ?? 0, icon: CheckCircle2, tone: "green", loading: appr.isLoading, detail: "Sent on to Production and Purchase", to: opsHref("APPROVED") },
        { label: "Rejected", value: counts.REJECTED ?? 0, icon: XCircle, tone: counts.REJECTED ? "red" : "green", loading: appr.isLoading, detail: "With the reason you gave", to: opsHref("REJECTED") },
        { label: "Purchases in progress", value: d.inProgress.length, icon: ShoppingCart, tone: "blue", loading: buys.isLoading, detail: "Missing components being bought", to: "/purchase" },
        { label: "Components to reorder", value: d.low.length, icon: AlertTriangle, tone: d.low.length ? "amber" : "green", loading: inv.isLoading,
          detail: d.low.length ? "At or below the minimum" : "All above the minimum", to: "/inventory?filter=low" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel flush className="lg:col-span-2" title="Waiting for your decision" description="Newest first. Open an order to check stock and decide."
          action={d.pending.length > LIMIT ? <PanelLink to={opsHref(QUEUE)}>All {d.pending.length}</PanelLink> : <PanelLink to={opsHref(QUEUE)}>Orders to approve</PanelLink>}>
          {appr.isLoading ? <div className="space-y-2 px-5 pb-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            : d.pending.length === 0 ? <EmptyLine>Nothing is waiting for your decision.</EmptyLine>
            : <ApprovalList orders={d.pending.slice(0, LIMIT)} onOpen={open} />}
        </Panel>
        <ListPanel drill={drill} loading={loading} title="Purchases in progress" description="Where the missing components are." rows={d.inProgress} to="/purchase" toLabel="Purchase" empty="No purchase in progress." />
        <Panel flush className="lg:col-span-2" title="Rejected orders" description="With the reason you gave."
          action={d.rejected.length > LIMIT ? <PanelLink to={opsHref("REJECTED")}>All {d.rejected.length}</PanelLink> : null}>
          {appr.isLoading ? <div className="space-y-2 px-5 pb-5"><Skeleton className="h-10 w-full" /></div>
            : d.rejected.length === 0 ? <EmptyLine>Nothing rejected.</EmptyLine>
            : <ApprovalList orders={d.rejected.slice(0, LIMIT)} onOpen={open} />}
        </Panel>
        <ListPanel drill={drill} loading={loading} title="Components to reorder" description="At or below the minimum." rows={d.low} to="/inventory?filter=low" toLabel="Component Stock" empty="All components are above the minimum." />
      </div>

      <DepartmentOverview className="mt-4" depts={["iqc", "store", "purchase"]} />

      <OpsOrderDrawer orderId={openedId} onClose={() => setOpenedId(null)} />
      {drill.host}
    </>
  )
}
