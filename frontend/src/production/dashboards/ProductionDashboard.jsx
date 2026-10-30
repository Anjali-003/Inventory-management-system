import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CalendarClock, CheckCircle2, ChevronRight, Factory, Hourglass, PackagePlus, PlayCircle, RefreshCw, Wrench } from "lucide-react"
import { EmptyState, Notice } from "@/components/feedback"
import { PageButton, pageButtonClass } from "@/components/PageKit"
import OrderDisplayNumber from "@/components/OrderDisplayNumber"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermissions } from "@/core/auth/usePermissions"
import { Flag, StageBar, WorkCard, useFlash } from "@/core/dashboard/components/WorkKit"
import { Greeting, StatRow } from "@/core/dashboard/DashboardKit"
import { useGetInventoryQuery } from "@/store/inventory/inventoryApi"
import RequestMaterialsModal from "@/store/material-requests/RequestMaterialsModal"
import ProductionStartModal from "@/production/production/components/ProductionStartModal"
import RecordUnitsModal from "@/production/production/components/RecordUnitsModal"
import { useGetProductionQuery } from "@/production/production/productionApi"
import {
  canRecordUnits, canStartProduction, daysSince, daysUntil, dueDateOf, dueLine, inProductionQuantity,
  isApprovedForProduction, isHeldUp, isProductionCompleted, isVisibleToProduction, leftToBeAllottedQuantity, needsMaterialRequest, needsRework, nextStep,
  readyToStartQuantity, waitingForStore,
} from "@/production/production/productionWorkflow"
import { getLowStockItems, qty, toProductionOrder } from "@/production/dashboards/productionDashboardUtils"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

const EMPTY = []
const LIMIT = 6
const RISK_DAYS = 7
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0)
const byOrderAge = (a, b) => new Date(a.order_created_at || 0) - new Date(b.order_created_at || 0)

/*
  Where the units still to make are, as one bar: their materials not asked for yet -> asked, with the Store ->
  here, ready to start -> being made. Drafts, rejected and finished lines are left out.
*/
const STAGES = [
  { id: "ask", label: "Materials to ask for", color: "bg-[#E4D7FF]" },
  { id: "store", label: "With the Store", color: "bg-[#C4A6FF]" },
  { id: "ready", label: "Ready to start", color: "bg-[#A27BFF]" },
  { id: "making", label: "Being made", color: "bg-[#7A35FF]" },
]

/* why a line is held up, and since when, in a few words */
function heldReason(i) {
  if (!isApprovedForProduction(i)) return { text: "Waiting for Operations to approve", tone: "muted" }
  if (i.material_status === "UNKNOWN") return { text: "No parts list (BOM): ask the Super Admin", tone: "bad" }
  const asked = daysSince(i.material_requested_at)
  return { text: asked ? `Store has had the request ${plural(asked, "day")}` : "Asked the Store today", tone: asked > 2 ? "bad" : "warn" }
}

/* The line under the title: the one thing worth doing next. */
function nudge({ late, lateStuck, rework, ready, makingLines, oldestAsk, toAsk }) {
  // late lines Production can move now: make them first; late lines stuck with someone else: say with whom
  if (late > lateStuck) return `${plural(late - lateStuck, "order")} past the delivery date. Make ${late - lateStuck === 1 ? "it" : "them"} first.`
  if (lateStuck) return `${plural(lateStuck, "order")} past the delivery date ${lateStuck === 1 ? "is" : "are"} stuck with the Store or Operations. Chase ${lateStuck === 1 ? "it" : "them"} up.`
  if (rework) return rework === 1 ? "1 batch failed QC. Fix it and send it back." : `${rework} batches failed QC. Fix them and send them back.`
  if (ready) return `Materials for ${plural(ready, "order")} are here. Start ${ready === 1 ? "it" : "them"}.`
  if (makingLines) return `${plural(makingLines, "order")} being made. Record the units as they finish.`
  if (oldestAsk > 2) return `The Store has had a material request for ${oldestAsk} days. Ask them about it.`
  if (toAsk) return `${plural(toAsk, "order")} need${toAsk === 1 ? "s" : ""} materials. Ask the Store.`
  return "Nothing is waiting for you."
}

/* one line of work: the order, who it is for and the product; on the right where it stands, then its one button */
function WorkRow({ item, right, action, note = null }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="min-w-0 flex-1">
        <OrderDisplayNumber orderNumber={item.order_number} itemCount={item.item_count} itemIndex={item.item_index} to={`/order-tracker?order=${item.order_id}`}
          className="text-sm font-semibold tabular-nums text-lp-ink" />
        <span className="block truncate text-xs text-lp-muted">{[item.customer_name, item.product_name].filter(Boolean).join(" · ")}</span>
        {note}
      </span>
      <span className="max-w-[45%] shrink-0 text-end">{right}</span>
      {action && <span className="shrink-0">{action}</span>}
    </li>
  )
}

const Right = ({ top, tone, sub }) => (
  <>
    <span className={cn("block text-[13px] font-semibold", tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-lp-ink")}>{top}</span>
    {sub && <span className="block text-xs text-lp-muted tabular-nums">{sub}</span>}
  </>
)

const made = (i) => `${fmtQty(qty(i.quantity_completed))} of ${fmtQty(qty(i.ordered_quantity))} made`

function CardHead({ title, description, to, toLabel }) {
  return (
    <CardHeader className="items-center">
      <div className="min-w-0"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40">{toLabel}<ChevronRight className="size-3.5" /></Link>}
    </CardHeader>
  )
}

/* batches QC failed that are back with Production, the oldest decision first */
function FailedQc({ items, loading }) {
  const rows = items.filter(needsRework).sort((a, b) => new Date(a.qc_decided_at || 0) - new Date(b.qc_decided_at || 0))
  return (
    <Card className="overflow-hidden">
      <CardHead title="Failed QC" description="Batches to fix and send back" to={rows.length ? "/qc-failed" : null} toLabel={`All ${rows.length}`} />
      {loading ? <div className="space-y-2 px-5 pb-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : rows.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-lp-muted"><CheckCircle2 className="size-4 text-success" /> No batch is waiting to be fixed.</p>
      ) : (
        <ul className="px-5 pb-4">
          {rows.slice(0, 4).map((i) => (
            <li key={i.order_item_id}>
              <Link to="/qc-failed" className="group -mx-2 block rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-ring/60">
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-lp-ink group-hover:text-lp-green">{i.order_number} · {i.product_name}</span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold", i.rework_status === "IN_PROGRESS" ? "bg-sky-50 text-sky-800" : "bg-rose-50 text-rose-700")}>
                    {i.rework_status === "IN_PROGRESS" ? "Being fixed" : "To fix"}
                  </span>
                </span>
                {i.qc_remarks && <span className="mt-0.5 block truncate text-xs text-lp-muted">QC: {i.qc_remarks}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* components at or below their minimum: what may stop the next start */
function PartsLow({ items, loading }) {
  const low = getLowStockItems(items)
  return (
    <Card className="overflow-hidden">
      <CardHead title="Parts running low" description="At or below their minimum in the Store" to={low.length ? "/inventory" : null} toLabel={`All ${low.length}`} />
      {loading ? <div className="space-y-2 px-5 pb-5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : low.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-lp-muted"><CheckCircle2 className="size-4 text-success" /> Every part is above its minimum.</p>
      ) : (
        <ul className="px-5 pb-4">
          {low.slice(0, 5).map((c) => {
            const out = qty(c.available) <= 0
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium text-lp-ink">{c.component_name || "Unnamed part"}</span><span className="block text-xs text-lp-muted">Minimum {fmtQty(qty(c.minimum_stock_level))}</span></span>
                <span className={cn("shrink-0 text-end text-xs font-semibold tabular-nums", out ? "text-destructive" : "text-warning")}>{out ? "Out of stock" : `${fmtQty(qty(c.available))} left`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/*
  Production Manager's dashboard, the same build as Marketing's: the line under the title says the one thing to do
  next; five figures answer the daily questions (what is due, what can I start, what is being made, what is held up,
  what failed QC) and each opens its list in the Production card below, with the one button that moves it on.
  `readOnly`: the Super Admin looking at the Production team's screen.
*/
export default function ProductionDashboard({ readOnly = false }) {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = !readOnly && canEdit("production")
  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetProductionQuery()
  const { data: inventory = EMPTY, isLoading: inventoryLoading, refetch: refetchInventory } = useGetInventoryQuery("active")
  const [workTab, setWorkTab] = useState(null) // null: the first tab with something in it
  const [workFlash, flashWork] = useFlash()
  const [startFor, setStartFor] = useState(null)
  const [recordFor, setRecordFor] = useState(null)
  const [requestFor, setRequestFor] = useState(null)

  const open = useMemo(() => (Array.isArray(data) ? data : EMPTY).filter((i) => isVisibleToProduction(i) && !isProductionCompleted(i)), [data])
  const all = useMemo(() => (Array.isArray(data) ? data : EMPTY).filter(isVisibleToProduction), [data])

  const due = useMemo(() => open
    .filter((i) => dueDateOf(i))
    .map((i) => ({ item: i, days: daysUntil(dueDateOf(i)) }))
    .filter((r) => r.days <= RISK_DAYS)
    .sort((a, b) => a.days - b.days), [open])
  const late = due.filter((r) => r.days < 0).length
  const lateStuck = due.filter((r) => r.days < 0 && isHeldUp(r.item)).length
  const ready = useMemo(() => open.filter(canStartProduction).sort(byOrderAge), [open])
  const making = useMemo(() => open.filter(canRecordUnits).sort(byOrderAge), [open])
  const toAsk = useMemo(() => open.filter(needsMaterialRequest).sort(byOrderAge), [open])
  const held = useMemo(() => open.filter(isHeldUp).sort(byOrderAge), [open])
  const rework = all.filter(needsRework).length
  const oldestAsk = Math.max(0, ...open.filter(waitingForStore).map((i) => daysSince(i.material_requested_at) || 0))

  const units = useMemo(() => ({
    ask: sum(toAsk, leftToBeAllottedQuantity),
    store: sum(open.filter(waitingForStore), leftToBeAllottedQuantity),
    ready: sum(ready, readyToStartQuantity),
    making: sum(making, inProductionQuantity),
  }), [open, toAsk, ready, making])

  const tabs = [
    { id: "due", label: "Due soon", count: due.length, alert: late > 0 },
    { id: "start", label: "Ready to start", count: ready.length },
    { id: "making", label: "Being made", count: making.length },
    { id: "ask", label: "Need materials", count: toAsk.length },
    { id: "held", label: "Held up", count: held.length },
  ]
  const shownTab = workTab ?? tabs.find((t) => t.count > 0)?.id ?? "due"
  const show = (id) => { setWorkTab(id); document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" }); flashWork() }
  const yourTurn = [ready.length && `${ready.length} to start`, making.length && `${making.length} to record`, toAsk.length && `${toAsk.length} to ask for`].filter(Boolean).join(" · ")

  const refresh = async () => { await Promise.allSettled([refetch(), refetchInventory()]) }
  const started = async (quantity, orderNumber) => { setStartFor(null); toast.success(`${plural(quantity, "unit")} started for ${orderNumber}`); await refresh() }
  const recorded = async (quantity) => { setRecordFor(null); toast.success(`${plural(quantity, "finished unit")} sent to Quality Control`); await refresh() }

  // the one button of a line, for the step that is Production's now
  const actionFor = (i) => {
    if (!editable) return null
    const step = nextStep(i).key
    if (step === "start") return <PageButton size="sm" variant="primary" onClick={() => setStartFor(toProductionOrder(i))}><PlayCircle /> Start</PageButton>
    if (step === "record") return <PageButton size="sm" onClick={() => setRecordFor(i)}><CheckCircle2 /> Record</PageButton>
    if (step === "request") return <PageButton size="sm" onClick={() => setRequestFor(toProductionOrder(i))}><PackagePlus /> Ask Store</PageButton>
    return null
  }

  const lists = {
    // a line due soon also says where it is stuck (or what to do), so the reason it is late is on the same row
    due: due.map(({ item, days }) => {
      const step = nextStep(item)
      const note = <span className={cn("block truncate text-xs font-medium", step.tone === "action" ? "text-amber-800" : "text-lp-muted")}>{needsRework(item) ? "Failed QC: fix it and send it back" : step.text}</span>
      return <WorkRow key={item.order_item_id} item={item} note={note} right={<Right top={dueLine(days)} tone={days < 0 ? "bad" : "warn"} sub={made(item)} />} action={actionFor(item)} />
    }),
    start: ready.map((i) => <WorkRow key={i.order_item_id} item={i} right={<Right top={`${fmtQty(readyToStartQuantity(i))} units ready`} tone="good" sub="Materials are here" />} action={actionFor(i)} />),
    making: making.map((i) => <WorkRow key={i.order_item_id} item={i} right={<Right top={`${fmtQty(inProductionQuantity(i))} being made`} sub={made(i)} />} action={actionFor(i)} />),
    ask: toAsk.map((i) => <WorkRow key={i.order_item_id} item={i} right={<Right top={`${fmtQty(leftToBeAllottedQuantity(i))} units to ask for`} tone="warn" sub={made(i)} />} action={actionFor(i)} />),
    held: held.map((i) => { const r = heldReason(i); return <WorkRow key={i.order_item_id} item={i} right={<Right top={r.text} tone={r.tone} sub={made(i)} />} /> }),
  }
  const empty = {
    due: ["No delivery in the next 7 days", "Late orders and those due within a week show here."],
    start: ["Nothing to start", "Lines show here once the Store hands over their materials."],
    making: ["Nothing being made", "Started units show here until you record them as finished."],
    ask: ["No materials to ask for", "Every approved order has its materials asked for."],
    held: ["Nothing held up", "Lines waiting for the Store or for Operations show here."],
  }[shownTab]
  const shown = lists[shownTab]

  return (
    <>
      <Greeting description={isLoading ? "Loading…" : nudge({ late, lateStuck, rework, ready: ready.length, makingLines: making.length, oldestAsk, toAsk: toAsk.length })}>
        <PageButton onClick={refresh} disabled={isFetching} aria-label="Refresh"><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</PageButton>
        <Link to="/production" className={pageButtonClass("primary")}><Factory /> Open Production</Link>
      </Greeting>

      {error && <div className="mb-4"><Notice title="Production data unavailable">{errorMessage(error, "Could not load production.")}</Notice></div>}

      <StatRow stats={[
        { label: "Due this week", icon: CalendarClock, tone: late ? "red" : due.length ? "amber" : "green", onClick: () => show("due"), active: shownTab === "due", value: isLoading ? "…" : due.length,
          detail: due.length ? <>{late > 0 && <Flag tone="bad">{late} late</Flag>}{late > 0 && due.length - late > 0 && " · "}{due.length - late > 0 && <Flag tone="warn">{due.length - late} this week</Flag>}</> : "Nothing due this week" },
        { label: "Ready to start", icon: PlayCircle, tone: ready.length ? "amber" : "green", onClick: () => show("start"), active: shownTab === "start", value: isLoading ? "…" : fmtQty(units.ready),
          detail: ready.length ? `units · ${plural(ready.length, "order")}, materials here` : "Nothing waiting to start" },
        { label: "Being made", icon: Factory, tone: "blue", onClick: () => show("making"), active: shownTab === "making", value: isLoading ? "…" : fmtQty(units.making),
          detail: making.length ? `units · ${plural(making.length, "order")}` : "Nothing on the floor" },
        { label: "Held up", icon: Hourglass, tone: oldestAsk > 2 ? "red" : held.length ? "amber" : "green", onClick: () => show("held"), active: shownTab === "held", value: isLoading ? "…" : held.length,
          detail: oldestAsk > 2 ? `Oldest Store request ${oldestAsk} days` : held.length ? "Waiting for the Store or Operations" : "Nothing held up" },
        { label: "Failed QC", icon: Wrench, tone: rework ? "red" : "green", to: "/qc-failed", value: isLoading ? "…" : rework,
          detail: rework ? "Fix and send back to QC" : "No batch to fix" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* min-w-0: a grid column would otherwise grow to its longest one-line text and push the page sideways on a phone */}
        <div className="min-w-0 lg:col-span-2">
          <WorkCard title="Production" flash={workFlash} tabs={tabs} tab={shownTab} onTab={setWorkTab}
            summary={<>Your turn: <b className="font-semibold text-lp-green">{yourTurn || "nothing right now"}</b></>}
            pipeline={<StageBar stages={STAGES} counts={units} noun="units still to make" />}
            footer={shown.length > LIMIT && (
              <Link to={shownTab === "due" ? "/production" : `/production?tab=${shownTab}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-lp-tint">All {shown.length} on the Production page<ChevronRight className="size-3.5" /></Link>
            )}>
            {isLoading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : shown.length ? (
              <ul className="divide-y divide-lp-line">{shown.slice(0, LIMIT)}</ul>
            ) : (
              <EmptyState icon={CheckCircle2} title={empty[0]}>{empty[1]}</EmptyState>
            )}
          </WorkCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <FailedQc items={all} loading={isLoading} />
          <PartsLow items={Array.isArray(inventory) ? inventory : EMPTY} loading={inventoryLoading} />
        </div>
      </div>

      {editable && startFor && <ProductionStartModal order={startFor} onClose={() => setStartFor(null)} onStarted={started} />}
      {editable && recordFor && <RecordUnitsModal item={recordFor} onClose={() => setRecordFor(null)} onSaved={recorded} />}
      {editable && requestFor && <RequestMaterialsModal order={requestFor} onClose={() => setRequestFor(null)} onSubmitted={refresh} />}
    </>
  )
}
