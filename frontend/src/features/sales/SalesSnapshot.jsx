/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom"
import { ArrowDownRight, ArrowUpRight, ChevronRight, Trophy, Wallet } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/*
  The Marketing dashboard's money pieces, all fed by GET /sales/summary (the caller passes it in as `s`):
    VsLastMonth   "↗ 21% vs ₹27,230 last month" under a figure
    TopCustomers  the month's biggest customers, each with its share next to the top one
    Receivables   what customers still owe: one bar split by bill age, and the oldest bills to collect first
*/

export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const ROW = "group -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-lp-tint active:bg-lp-portal-on/40 focus-visible:ring-2 focus-visible:ring-ring/60"

/* how old the money still out is: fresh to overdue, each with its own colour AND its own words */
const AGEING = [
  { label: "0–30 days", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800" },
  { label: "31–60 days", bar: "bg-amber-400", chip: "bg-amber-50 text-amber-800" },
  { label: "61–90 days", bar: "bg-orange-500", chip: "bg-orange-50 text-orange-800" },
  { label: "Over 90 days", bar: "bg-rose-600", chip: "bg-rose-50 text-rose-800" },
]
const bucketOf = (days) => AGEING[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3]

/* "↗ 21% vs ₹27,230 last month": nothing to compare when last month had no money. `prev` names that month
   ("in August 2026") when the month shown is not this one, so "last month" never reads as the month before today */
export function VsLastMonth({ now, before, prev = "last month" }) {
  if (!before) return <span className="text-xs text-lp-muted">{prev === "last month" ? "Last month ₹0" : `₹0 ${prev}`}</span>
  const change = Math.round(((now - before) / before) * 100)
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-lp-muted">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-lp-ink")}>
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{change >= 0 ? "up" : "down"}</span>
        {Math.abs(change)}%
      </span>
      vs {rupees(before)} {prev}
    </span>
  )
}

function CardHead({ title, description, to, toLabel }) {
  return (
    <CardHeader className="items-center">
      <div className="min-w-0"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40 active:bg-lp-portal-on/40">{toLabel}<ChevronRight className="size-3.5" /></Link>}
    </CardHeader>
  )
}

export function TopCustomers({ s, loading, month = "This month", monthParam = "", className }) {
  const top = (s?.byCustomer ?? []).slice(0, 5)
  const best = Math.max(1, ...top.map((c) => c.total))
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHead title="Top customers" description={`${month}, by billed amount`} to="/customers" toLabel="All" />
      {loading ? <p className="px-5 pb-5 text-sm text-lp-muted">Loading…</p> : top.length === 0 ? (
        <EmptyState icon={Trophy} title="No bills yet">The customers you bill show here.</EmptyState>
      ) : (
        <ul className="px-5 pb-4">
          {top.map((c, i) => (
            <li key={c.name}>
              <Link to={`/bills?show=all&q=${encodeURIComponent(c.name)}${monthParam}`} className={cn(ROW, "flex-col items-stretch gap-1.5")}>
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-xs font-semibold text-lp-muted tabular-nums">{i + 1}</span>
                    <span className="truncate font-medium text-lp-ink transition-colors group-hover:text-lp-green">{c.name}</span>
                    <span className="shrink-0 text-xs text-lp-muted">{c.bills === 1 ? "1 bill" : `${c.bills} bills`}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{rupees(c.total)}</span>
                </span>
                {/* the customer's share next to the top one */}
                <span className="ms-6 block h-1 overflow-hidden rounded-full bg-lp-bg" aria-hidden>
                  <span className="block h-full rounded-full bg-lp-green/60" style={{ width: `${(c.total / best) * 100}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function Receivables({ s, loading, className }) {
  const ageing = s?.ageing ?? []
  const owed = s?.owed ?? []
  const total = s?.toCollect ?? 0
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHead title="Receivables" description="What customers still owe today, by how old the bill is." to="/bills?show=open" toLabel="Open bills" />
      {loading ? <p className="px-5 pb-5 text-sm text-lp-muted">Loading…</p> : total <= 0 ? (
        <EmptyState icon={Wallet} title="Nothing to collect">All bills are paid in full.</EmptyState>
      ) : (
        <div className="grid border-t lg:grid-cols-[2fr_3fr] lg:divide-x">
          <section className="min-w-0 p-5">
            <p className="text-[13px] font-medium text-lp-muted">Still to collect</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{rupees(total)}</p>
            {ageing.length === 4 && (
              <>
                {/* one bar for everything still to collect, split by bill age (hover a part for its amount) */}
                <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-lp-bg" role="img" aria-label={AGEING.map((a, i) => `${a.label} ${rupees(ageing[i])}`).join(", ")}>
                  {ageing.map((amount, i) => amount > 0 && (
                    <span key={AGEING[i].label} title={`${AGEING[i].label}: ${rupees(amount)}`} className={cn("h-full first:rounded-s-full last:rounded-e-full", AGEING[i].bar)} style={{ width: `${(amount / total) * 100}%` }} />
                  ))}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  {AGEING.map((a, i) => (
                    <div key={a.label} className="min-w-0">
                      <dt className="flex items-center gap-1.5 text-xs text-lp-muted"><span className={cn("size-2 shrink-0 rounded-full", a.bar)} aria-hidden />{a.label}</dt>
                      <dd className={cn("text-sm font-semibold tabular-nums", i >= 2 && ageing[i] > 0 && "text-destructive")}>{rupees(ageing[i])}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>
          <section className="min-w-0 border-t p-5 lg:border-t-0">
            <p className="text-[13px] font-medium text-lp-muted">Collect first (oldest bills)</p>
            <ul className="mt-1">
              {owed.slice(0, 5).map((o) => (
                <li key={o.billNumber}>
                  <Link to={`/bills?show=open&q=${encodeURIComponent(o.billNumber)}`} className={ROW}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-lp-ink transition-colors group-hover:text-lp-green">{o.customer}</span>
                      <span className="block text-xs text-lp-muted tabular-nums">{o.billNumber}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", bucketOf(o.days).chip)}>{o.days === 0 ? "today" : o.days === 1 ? "1 day" : `${o.days} days`}</span>
                      <span className={cn("w-20 text-end font-semibold tabular-nums", o.days > 60 && "text-destructive")}>{rupees(o.due)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Card>
  )
}
