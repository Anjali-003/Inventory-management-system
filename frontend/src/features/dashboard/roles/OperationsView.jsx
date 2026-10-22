import { useMemo, useState } from "react"
import { MotionConfig } from "motion/react"
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShoppingCart, XCircle } from "lucide-react"
import { Reveal } from "@/components/HistoryUI"
import { EmptyState } from "@/components/feedback"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetOrderApprovalsQuery } from "@/features/order-approvals/orderApprovalsApi"
import OpsOrderDrawer from "@/features/order-approvals/OpsOrderDrawer"
import PurchaseDrawer from "@/features/purchase/PurchaseDrawer"
import { ApprovalList, OPS_ALL, OPS_STAGES, OpsPanel, OpsTileGrid, opsHref } from "@/features/order-approvals/opsKit"
import { HeroLink, MktHero, StageTile } from "@/features/marketing-orders/mktKit"
import { OrderPipeline, countByStatus, newestFirst, plural } from "@/features/marketing-orders/orderParts"
import { useGetPurchasesQuery } from "@/features/purchasing/purchasingApi"
import { useGetInventoryQuery } from "@/features/inventory/inventoryApi"
import DepartmentOverview from "../DepartmentOverview"
import { ListPanel, useDrill } from "../DashboardKit"
import { purchaseRow, stockRow } from "../rows"

const EMPTY = []
const QUEUE = "PENDING_APPROVAL"

/* The Purchase page's side drawer for one purchase, read-only here (the Operations Admin only follows purchases).
   It reads the purchase from the live list by id, and closes itself if the purchase is no longer in it. */
function OpsPurchaseDrawer({ purchaseId, onClose }) {
  const { data = EMPTY } = useGetPurchasesQuery()
  const [tab, setTab] = useState("overview")
  const purchase = data.find((p) => p.id === purchaseId) ?? null
  return <PurchaseDrawer purchase={purchase} tab={tab} onTab={setTab} onClose={onClose} editable={false} />
}

/* Plain-language line under "Hello": the one thing worth doing next. */
function nudge(counts) {
  if (counts[QUEUE]) return `${plural(counts[QUEUE], "order")} waiting for your decision.`
  return "Nothing is waiting for you. Here is how orders, purchase and stock are doing."
}

/*
  Operations Admin dashboard, built like the Marketing Manager one: a hero, one colour tile per stage (each is a
  link to Incoming Orders with that filter on), the pipeline bar, then the lists. Clicking an order opens the full
  Operations popup (stock check, progress, products, Reject / Check stock & send). The purchase and stock lists
  below keep the shared dashboard panels, because those records belong to other roles.
*/
export default function OperationsView() {
  const drill = useDrill()
  const { data: me } = useGetMeQuery()
  const appr = useGetOrderApprovalsQuery()
  const buys = useGetPurchasesQuery()
  const inv = useGetInventoryQuery("active")
  const loading = appr.isLoading || buys.isLoading || inv.isLoading
  const [openedId, setOpenedId] = useState(null) // the order whose side drawer is open

  const orders = appr.data ?? EMPTY
  const counts = useMemo(() => countByStatus(orders), [orders])

  const d = useMemo(() => {
    const latest = [...orders].sort(newestFirst)
    const by = (s) => latest.filter((o) => o.approval_status === s)
    return {
      pending: by(QUEUE),
      rejected: by("REJECTED"),
      inProgress: (buys.data ?? EMPTY).filter((p) => p.status !== "STORED" && p.status !== "REJECTED").map((p) => ({ ...purchaseRow(p), detail: (close) => <OpsPurchaseDrawer purchaseId={p.id} onClose={close} /> })),
      low: (inv.data ?? EMPTY).filter((i) => Number(i.available) <= Number(i.minimum_stock_level)).map(stockRow),
    }
  }, [orders, buys.data, inv.data])

  // Every figure opens Incoming Orders with that filter already on.
  const tiles = [
    { key: "ALL", stage: OPS_ALL, value: counts.total, to: opsHref("ALL") },
    ...OPS_STAGES.map((s) => ({ key: s.status, stage: s, value: counts[s.status], to: opsHref(s.status) })),
  ]

  const open = (o) => setOpenedId(o.id)

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Operations dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={nudge(counts)}>
        <HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to={opsHref(QUEUE)}><ClipboardCheck /> Open incoming orders</HeroLink>
      </MktHero>

      <OpsTileGrid>
        {tiles.map((t) => (
          <StageTile key={t.key} solid stage={t.stage} value={t.value} loading={appr.isLoading} to={t.to} />
        ))}
      </OpsTileGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal delay={0.3}>
          <OpsPanel title="Waiting for approval" description="Newest first. Open an order to check stock and decide." loading={appr.isLoading} to={d.pending.length > 5 ? opsHref(QUEUE) : null} toLabel={`View all (${d.pending.length})`}>
            {d.pending.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="Nothing waiting for approval">New orders will show up here as soon as they are raised.</EmptyState>
            ) : (
              <ApprovalList orders={d.pending.slice(0, 5)} onOpen={open} />
            )}
          </OpsPanel>
        </Reveal>
        <Reveal delay={0.4}>
          <ListPanel table drill={drill} loading={loading} title="Purchases in progress" description="Where the missing components are." rows={d.inProgress} to="/purchase" toLabel="Open Purchase" emptyIcon={ShoppingCart} empty="No purchase in progress" />
        </Reveal>
        <Reveal delay={0.4}>
          <OpsPanel title="Rejected orders" description="With the reason you gave." loading={appr.isLoading} to={d.rejected.length > 5 ? opsHref("REJECTED") : null} toLabel={`View all (${d.rejected.length})`}>
            {d.rejected.length === 0 ? (
              <EmptyState icon={XCircle} title="Nothing rejected" />
            ) : (
              <ApprovalList orders={d.rejected.slice(0, 5)} onOpen={open} />
            )}
          </OpsPanel>
        </Reveal>
        <Reveal delay={0.5}>
          <ListPanel table rightLabel="Available / min" drill={drill} loading={loading} title="Components to reorder" description="Available stock is at or below the minimum." rows={d.low} to="/inventory?filter=low" toLabel="Open Inventory" emptyIcon={d.low.length ? AlertTriangle : CheckCircle2} empty="All components are above minimum" />
        </Reveal>
      </div>

      <DepartmentOverview className="mt-6" depts={["iqc", "store", "purchase"]} />

      <OpsOrderDrawer orderId={openedId} onClose={() => setOpenedId(null)} />
      {drill.host}
    </MotionConfig>
  )
}
