import { useMemo, useState } from "react"
import { useUrlState } from "@/lib/useUrlState"
import { Route } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Modal } from "@/components/Modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROLE_LABELS } from "@/lib/permissions"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetOrderJourneyQuery, useGetTrackedOrdersQuery } from "./orderTrackerApi"

const EMPTY = []
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
// an order waiting this many days or more is marked red
const STUCK_DAYS = 3

const DOT = { done: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500" }

function Journey({ orderId, onClose }) {
  const { data, isLoading, error } = useGetOrderJourneyQuery(orderId, { skip: !orderId })
  return (
    <Modal open={!!orderId} onClose={onClose} size="lg" title={data?.orderNumber || "Order"} description={data?.products}
      footer={<Button type="button" variant="outline" size="lg" onClick={onClose}>Close</Button>}>
      {error ? <Notice title="Could not load">{errorMessage(error, "Try again.")}</Notice> : isLoading || !data ? <TableSkeleton rows={6} /> : (
        <div className="space-y-4">
          <div className={cn("rounded-xl px-4 py-3 text-sm", data.done ? "bg-emerald-50 text-emerald-900" : data.daysWaiting >= STUCK_DAYS ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-950")}>
            <p className="font-semibold">Now: {data.stage}</p>
            {!data.done && <p className="mt-0.5">Waiting for <b>{ROLE_LABELS[data.waitingFor] || data.waitingFor}</b> · {data.daysWaiting} day{data.daysWaiting === 1 ? "" : "s"} since the last change</p>}
            {data.toBuy > 0 && <p className="mt-0.5">{data.toBuy} component{data.toBuy === 1 ? "" : "s"} still to buy</p>}
          </div>
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
            {data.events.map((e, i) => (
              <li key={i} className="relative">
                <span className={cn("absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-white", DOT[e.tone] || DOT.done)} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium"><span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{e.stage}</span>{e.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{when(e.at)}{e.daysTaken ? ` · +${e.daysTaken} d` : ""}</p>
                </div>
                {(e.by || e.detail) && <p className="text-xs text-muted-foreground">{[e.by, e.detail].filter(Boolean).join(" · ")}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  )
}

/*
  Order Tracker: every order, where it is now, who it waits for and for how long (red when stuck). Click an order to
  see its whole journey with who did each step and how long each step took.
*/
export default function OrderTracker() {
  const { params, setParams, openPopup, closePopup } = useUrlState()
  const { data = EMPTY, isLoading, error } = useGetTrackedOrdersQuery()
  const [query, setQuery] = useState(() => params.get("q") || "")
  const SHOWS = ["open", "stuck", "late", "done", "all"]
  const [show, setShow] = useState(() => (SHOWS.includes(params.get("show")) ? params.get("show") : "open"))
  const roleFilter = params.get("role") || ""
  const opened = params.get("order") ? Number(params.get("order")) : null
  const setParam = (key, value) => setParams((p) => { const next = new URLSearchParams(p); if (value) next.set(key, value); else next.delete(key); return next })
  const today = new Date().toISOString().slice(0, 10)
  const isLate = (o) => !o.done && o.promisedDate && o.promisedDate < today

  const counts = useMemo(() => ({
    open: data.filter((o) => !o.done).length,
    stuck: data.filter((o) => !o.done && o.daysWaiting >= STUCK_DAYS).length,
    late: data.filter(isLate).length,
    done: data.filter((o) => o.done).length,
    all: data.length,
  }), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data
      .filter((o) => (show === "open" ? !o.done : show === "stuck" ? !o.done && o.daysWaiting >= STUCK_DAYS : show === "late" ? isLate(o) : show === "done" ? o.done : true))
      .filter((o) => !roleFilter || o.waitingFor === roleFilter)
      .filter((o) => !q || `${o.orderNumber} ${o.products || ""} ${o.stage}`.toLowerCase().includes(q))
      .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1))
  }, [data, query, show, roleFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Order Tracker" description="Where every order is, who it is waiting for, and for how long. Click an order for its whole journey." />
      {error && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(error, "Could not load the orders.")}</Notice></div>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          {[["open", "Open"], ["stuck", `Stuck ${STUCK_DAYS}+ days`], ["late", "Late for customer"], ["done", "Done / closed"], ["all", "All"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", show === k ? "border-primary bg-primary text-primary-foreground" : (k === "stuck" || k === "late") && counts[k] ? "border-rose-200 bg-rose-50 text-rose-800" : "bg-white text-slate-700")}>
              {l} <span className="tabular-nums opacity-80">{counts[k]}</span>
            </button>
          ))}
          {roleFilter && (
            <button type="button" onClick={() => setParam("role", "")} className="rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              Waiting for {ROLE_LABELS[roleFilter] || roleFilter} ×
            </button>
          )}
          <div className="w-full sm:ml-auto sm:w-64"><SearchBar value={query} onChange={setQuery} placeholder="Search order or product..." /></div>
        </div>
        {isLoading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={Route} title="No orders here">Pick another filter above.</EmptyState>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Order</TableHead><TableHead>Now</TableHead><TableHead>Waiting for</TableHead><TableHead className="text-right">Days</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((o) => {
                const stuck = !o.done && o.daysWaiting >= STUCK_DAYS
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => openPopup({ order: o.id })}>
                    <TableCell className="whitespace-normal">
                      <span className="block font-semibold tabular-nums">{o.orderNumber}</span>
                      <span className="block text-xs text-muted-foreground">{o.products}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal">{o.stage}</TableCell>
                    <TableCell>{o.waitingFor ? <Badge variant={stuck ? "danger" : "warning"}>{ROLE_LABELS[o.waitingFor] || o.waitingFor}</Badge> : <Badge variant="success">Done</Badge>}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", stuck && "text-destructive")}>{o.daysWaiting ?? "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <Journey orderId={opened} onClose={() => closePopup({ order: null })} />
    </>
  )
}
