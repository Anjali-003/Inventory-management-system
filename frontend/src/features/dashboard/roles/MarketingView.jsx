import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Plus, Send } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Reveal, StatCard } from "@/components/HistoryUI"
import { useToast } from "@/components/toast"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermissions } from "@/features/auth/usePermissions"
import { ApprovalStatus } from "@/features/order-approvals/approvalParts"
import { useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "@/features/marketing-orders/marketingOrdersApi"
import { OrderPipeline, STAGES, countByStatus, newestFirst, ordersHref, plural, stageOf } from "@/features/marketing-orders/orderParts"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Greeting } from "../DashboardKit"

const EMPTY = []

const productsText = (items = []) => items.map((i) => `${i.name} × ${fmtQty(i.quantity)}`).join(", ")

/* Plain-language line under "Hello": the one thing worth doing next. */
function nudge(counts) {
  if (counts.REJECTED) return `${plural(counts.REJECTED, "order")} rejected. Open it to read the admin's remarks.`
  if (counts.DRAFT) return `${plural(counts.DRAFT, "draft")} ready to send to the Operations Admin.`
  if (counts.PENDING_APPROVAL) return `${plural(counts.PENDING_APPROVAL, "order")} waiting for the Operations Admin.`
  return "Where your orders stand with the Operations Admin."
}

/* One order: the left part opens it on the Orders page (popup already open), an optional action sits on the right. */
function OrderRow({ order, line, action }) {
  const stage = stageOf(order.approval_status)
  const Icon = stage?.icon ?? ClipboardList
  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
      <Link
        to={ordersHref(null, { order: order.id })}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] text-white", stage?.bar ?? "bg-slate-400")}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{order.order_number}</span>
          <span className="block truncate text-xs text-muted-foreground">{line}</span>
        </span>
        <span className="hidden sm:block"><ApprovalStatus value={order.approval_status} /></span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
      {action}
    </li>
  )
}

function Panel({ title, description, to, toLabel, loading, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className={buttonVariants({ variant: "ghost", size: "sm" })}>{toLabel}</Link>}
      </CardHeader>
      {loading ? <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : children}
    </Card>
  )
}

export default function MarketingView() {
  const navigate = useNavigate()
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("marketingOrders")

  const { data = EMPTY, isLoading } = useGetMarketingOrdersQuery()
  const [send] = useSendMarketingOrderMutation()
  const [busyId, setBusyId] = useState(null)

  const counts = useMemo(() => countByStatus(data), [data])
  const latest = useMemo(() => [...data].sort(newestFirst), [data])
  const attention = useMemo(
    () => [...latest.filter((o) => o.approval_status === "REJECTED"), ...latest.filter((o) => o.approval_status === "DRAFT")],
    [latest]
  )

  const sendOrder = async (o) => {
    setBusyId(o.id)
    try {
      await send(o.id).unwrap()
      toast.success(`${o.order_number} sent to the Operations Admin`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not send this order."))
    } finally {
      setBusyId(null)
    }
  }

  // Every figure opens the Orders page with that filter already on.
  const stats = [
    ...STAGES.map((s) => ({
      label: s.label,
      value: counts[s.status],
      icon: s.icon,
      detail: s.hint,
      tone: s.status === "DRAFT" ? (counts.DRAFT ? "amber" : "green") : s.status === "REJECTED" ? (counts.REJECTED ? "red" : "green") : s.tone,
      to: ordersHref(s.status),
    })),
    { label: "All orders", value: counts.total, icon: ClipboardList, detail: "Raised by you", tone: "violet", to: ordersHref(null) },
  ]

  return (
    <>
      <Greeting description={nudge(counts)}>
        {editable && (
          <Link to={ordersHref(null, { new: 1 })} className={buttonVariants()}>
            <Plus /> New order
          </Link>
        )}
      </Greeting>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((s, i) => (
          <StatCard key={s.label} index={i} icon={s.icon} tone={s.tone} label={s.label} value={s.value} detail={s.detail} loading={isLoading} onClick={() => navigate(s.to)} />
        ))}
      </div>

      <Reveal delay={0.2} className="mt-4">
        <Panel title="Order pipeline" description="Click a stage to see only those orders." to={ordersHref(null)} toLabel="All orders">
          <OrderPipeline counts={counts} loading={isLoading} />
        </Panel>
      </Reveal>

      {!isLoading && counts.total === 0 ? (
        <Reveal delay={0.3} className="mt-4">
          <Card>
            <EmptyState icon={ClipboardList} title="No orders yet">
              Prepare an order, save it as a draft, then send it to the Operations Admin when it is ready.
              {editable && (
                <span className="mt-4 flex justify-center">
                  <Link to={ordersHref(null, { new: 1 })} className={buttonVariants()}><Plus /> Create your first order</Link>
                </span>
              )}
            </EmptyState>
          </Card>
        </Reveal>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Reveal delay={0.3}>
            <Panel title="Needs your attention" description="Rejected orders first, then drafts to send." loading={isLoading} to={attention.length > 5 ? ordersHref("DRAFT") : null} toLabel={`View all (${attention.length})`}>
              {attention.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing needs attention">Every order has been sent and decided.</EmptyState>
              ) : (
                <ul className="divide-y">
                  {attention.slice(0, 5).map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      line={o.approval_status === "REJECTED" && o.approval_remarks ? o.approval_remarks : productsText(o.items)}
                      action={
                        editable && o.approval_status === "DRAFT" ? (
                          <Button size="sm" disabled={busyId === o.id} onClick={() => sendOrder(o)} aria-label={`Send ${o.order_number} to the Operations Admin`}>
                            {busyId === o.id ? <Loader2 className="animate-spin" /> : <Send />} Send
                          </Button>
                        ) : null
                      }
                    />
                  ))}
                </ul>
              )}
            </Panel>
          </Reveal>
          <Reveal delay={0.4}>
            <Panel title="Latest orders" description="Newest first." loading={isLoading} to={ordersHref(null)} toLabel="View all">
              <ul className="divide-y">
                {latest.slice(0, 5).map((o) => (
                  <OrderRow key={o.id} order={o} line={`${timeAgo(o.created_at)} · ${productsText(o.items)}`} />
                ))}
              </ul>
            </Panel>
          </Reveal>
        </div>
      )}
    </>
  )
}
