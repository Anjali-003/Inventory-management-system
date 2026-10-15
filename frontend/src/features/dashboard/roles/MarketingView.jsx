import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MotionConfig, motion } from "motion/react"
import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Plus, Send } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Reveal } from "@/components/HistoryUI"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetMeQuery } from "@/features/auth/authApi"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetMarketingOrdersQuery, useSendMarketingOrderMutation } from "@/features/marketing-orders/marketingOrdersApi"
import { HeroLink, MktBtn, MktHero, NewOrderFab, StageTile, StatusPill, TileGrid } from "@/features/marketing-orders/mktKit"
import { PRESS_SOFT, rise, stagger } from "@/features/marketing-orders/mktMotion"
import { ALL_STAGE, OrderPipeline, STAGES, countByStatus, newestFirst, ordersHref, plural, stageOf } from "@/features/marketing-orders/orderParts"
import { timeAgo } from "@/features/activity/time"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

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
    <motion.li variants={rise} className="flex items-center gap-2 px-3 py-1.5 sm:px-4">
      <motion.div whileTap={PRESS_SOFT} className="min-w-0 flex-1">
        <Link
          to={ordersHref(null, { order: order.id })}
          className="group flex min-h-14 min-w-0 items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", stage?.s.grad ?? "from-slate-300 to-slate-400")}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tabular-nums">{order.order_number}</span>
            <span className="block truncate text-xs text-muted-foreground">{line}</span>
          </span>
          <span className="hidden sm:block"><StatusPill value={order.approval_status} short /></span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </motion.div>
      {action}
    </motion.li>
  )
}

function Panel({ title, description, to, toLabel, loading, children }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {to && <Link to={to} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary outline-none transition-colors hover:bg-cf-green-soft focus-visible:ring-2 focus-visible:ring-ring/60">{toLabel}</Link>}
      </CardHeader>
      {loading ? <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : children}
    </Card>
  )
}

/* The list inside a panel: rows rise in one after another. */
const RowList = ({ children }) => (
  <motion.ul variants={stagger(0.05, 0.05)} initial="hidden" animate="show" className="divide-y py-1">
    {children}
  </motion.ul>
)

export default function MarketingView() {
  const toast = useToast()
  const { data: me } = useGetMeQuery()
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
  const tiles = [
    { key: "ALL", stage: ALL_STAGE, value: counts.total, to: ordersHref(null), className: "col-span-2 md:col-span-4 xl:col-span-1" },
    ...STAGES.map((s) => ({ key: s.status, stage: s, value: counts[s.status], to: ordersHref(s.status) })),
  ]

  return (
    <MotionConfig reducedMotion="user">
      <MktHero eyebrow="Marketing dashboard" title={me?.name ? `Hello, ${me.name}` : "Hello"} description={nudge(counts)}>
        {editable && <HeroLink wrap="hidden md:inline-flex" to={ordersHref(null, { new: 1 })}><Plus /> New order</HeroLink>}
      </MktHero>

      <TileGrid>
        {tiles.map((t) => (
          <StageTile key={t.key} solid stage={t.stage} value={t.value} loading={isLoading} to={t.to} className={t.className} />
        ))}
      </TileGrid>

      <Reveal delay={0.2} className="mt-4">
        <Panel title="Order pipeline" description="Tap a stage to see only those orders." to={ordersHref(null)} toLabel="All orders">
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
                  <Link to={ordersHref(null, { new: 1 })} className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-gradient-to-br from-emerald-500 to-teal-700 px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(13,148,136,0.8)] outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-3 focus-visible:ring-primary/30 active:scale-[0.97] sm:h-9">
                    <Plus className="size-4" /> Create your first order
                  </Link>
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
                <RowList>
                  {attention.slice(0, 5).map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      line={o.approval_status === "REJECTED" && o.approval_remarks ? o.approval_remarks : productsText(o.items)}
                      action={
                        editable && o.approval_status === "DRAFT" ? (
                          <MktBtn variant="primary" size="sm" disabled={busyId === o.id} onClick={() => sendOrder(o)} aria-label={`Send ${o.order_number} to the Operations Admin`}>
                            {busyId === o.id ? <Loader2 className="animate-spin" /> : <Send />} Send
                          </MktBtn>
                        ) : null
                      }
                    />
                  ))}
                </RowList>
              )}
            </Panel>
          </Reveal>
          <Reveal delay={0.4}>
            <Panel title="Latest orders" description="Newest first." loading={isLoading} to={ordersHref(null)} toLabel="View all">
              <RowList>
                {latest.slice(0, 5).map((o) => (
                  <OrderRow key={o.id} order={o} line={`${timeAgo(o.created_at)} · ${productsText(o.items)}`} />
                ))}
              </RowList>
            </Panel>
          </Reveal>
        </div>
      )}

      {editable && <NewOrderFab to={ordersHref(null, { new: 1 })} />}
    </MotionConfig>
  )
}
