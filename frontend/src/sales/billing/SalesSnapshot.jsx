/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDownRight, ArrowUpRight, ChevronRight, MessageCircle, Trophy, Wallet } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/*
  The Marketing dashboard's money pieces, all fed by GET /sales/summary (the caller passes it in as `s`):
    VsLastMonth   "↗ 21% vs ₹27,230 last month" under a figure
    TrendBars     6 small bars: the net sales of the 6 months ending with the month shown
    TopSellers    the month's biggest customers, or best-selling products (a switch), each with its share next to the top one
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

const shortMonth = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" })

/*
  Six small bars, one per month (the month shown is the last, in violet), each as tall as its sales next to the best
  month. Hover a bar for its month and amount; the whole is read out as one line. A month with no sale is a thin stub.
*/
export function TrendBars({ trend = [] }) {
  if (trend.length < 2) return null
  const best = Math.max(1, ...trend.map((t) => t.net))
  return (
    <span role="img" aria-label={`Last ${trend.length} months: ${trend.map((t) => `${shortMonth(t.month)} ${rupees(t.net)}`).join(", ")}`}
      className="flex h-8 shrink-0 items-end gap-[3px]">
      {trend.map((t, i) => (
        <span key={t.month} title={`${shortMonth(t.month)}: ${rupees(t.net)}`}
          className={cn("w-1.5 rounded-t-[2px]", t.net <= 0 ? "bg-lp-line" : i === trend.length - 1 ? "bg-lp-green" : "bg-lp-portal-on")}
          style={{ height: t.net <= 0 ? 2 : `${Math.max(12, (t.net / best) * 100)}%` }} />
      ))}
    </span>
  )
}

/* wa.me link with a ready reminder: an Indian 10-digit number gets 91 in front; null when there is no usable number */
function reminderLink(o) {
  let digits = String(o.phone || "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length === 10) digits = `91${digits}`
  if (digits.length < 11) return null
  const text = `Hello ${o.customer}, a reminder that ${rupees(o.due)} is still due on bill ${o.billNumber}${o.days > 0 ? ` (${o.days} days)` : ""}. Kindly arrange the payment. Thank you.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function CardHead({ title, description, to, toLabel }) {
  return (
    <CardHeader className="items-center">
      <div className="min-w-0"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40 active:bg-lp-portal-on/40">{toLabel}<ChevronRight className="size-3.5" /></Link>}
    </CardHeader>
  )
}

/* one ranked row: rank, name and a muted line under it, the amount, and a bar for its share next to the top one */
function RankRow({ rank, name, sub, amount, pct, to, extra = null }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-4 shrink-0 text-xs font-semibold text-lp-muted tabular-nums">{rank}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-lp-ink transition-colors group-hover:text-lp-green">{name}</span>
            <span className="block truncate text-xs text-lp-muted">{sub}</span>
          </span>
        </span>
        <span className="shrink-0 text-end">
          <span className="block font-semibold tabular-nums">{rupees(amount)}</span>
          {extra}
        </span>
      </span>
      <span className="ms-6 block h-1 overflow-hidden rounded-full bg-lp-bg" aria-hidden>
        <span className={cn("block h-full rounded-full", rank === 1 ? "bg-lp-green" : "bg-lp-green/50")} style={{ width: `${pct}%` }} />
      </span>
    </>
  )
  return to
    ? <Link to={to} className={cn(ROW, "flex-col items-stretch gap-1.5")}>{body}</Link>
    : <div className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2 text-sm">{body}</div>
}

/* a product's gross margin (an estimate from its parts' cost): green from 30%, amber from 20%, red below */
function MarginTag({ margin }) {
  if (margin == null) return <span className="block text-[11px] text-lp-muted" title="Its parts could not be costed">margin —</span>
  return (
    <span title="Gross margin: sale minus its parts' cost (an estimate)"
      className={cn("block text-[11px] font-semibold tabular-nums", margin >= 30 ? "text-success" : margin >= 20 ? "text-warning" : "text-destructive")}>
      {margin}% margin
    </span>
  )
}

const TOP_TABS = [["customers", "Customers"], ["products", "Products"]]

/*
  The month's best: who bought the most (Customers) or what sold the most (Products), one switch in the card's
  header. A customer opens its bills of that month; a product shows its units, how many customers bought it and its
  share of everything billed for products that month (no page lists a product's bills, so it is not a link).
*/
export function TopSellers({ s, loading, month = "This month", monthParam = "", className }) {
  const [view, setView] = useState("customers")
  const customers = (s?.byCustomer ?? []).slice(0, 5)
  const products = (s?.byProduct ?? []).slice(0, 5)
  const rows = view === "customers" ? customers : products
  const best = Math.max(1, ...rows.map((r) => (view === "customers" ? r.total : r.amount)))
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="items-center">
        <div className="min-w-0"><CardTitle>Top sellers</CardTitle><CardDescription>{month}, by billed amount</CardDescription></div>
        <div role="tablist" aria-label="Top by" className="inline-flex shrink-0 rounded-lg bg-lp-bg p-0.5">
          {TOP_TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lp-green/40",
                view === id ? "bg-white text-lp-ink shadow-[0_1px_2px_rgba(16,33,28,0.12)]" : "text-lp-muted hover:text-lp-ink")}>
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      {loading ? <p className="px-5 pb-5 text-sm text-lp-muted">Loading…</p> : rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No bills yet">{view === "customers" ? "The customers you bill show here." : "The products you bill show here."}</EmptyState>
      ) : (
        <ul role="tabpanel" className="px-5 pb-4">
          {view === "customers"
            ? customers.map((c, i) => (
                <li key={c.name}>
                  <RankRow rank={i + 1} name={c.name} sub={c.bills === 1 ? "1 bill" : `${c.bills} bills`} amount={c.total} pct={(c.total / best) * 100}
                    to={`/bills?show=all&q=${encodeURIComponent(c.name)}${monthParam}`} />
                </li>
              ))
            : products.map((p, i) => (
                <li key={p.productId}>
                  <RankRow rank={i + 1} name={p.name} amount={p.amount} pct={(p.amount / best) * 100} extra={<MarginTag margin={p.margin} />}
                    sub={`${p.units.toLocaleString("en-IN")} units · ${p.customers === 1 ? "1 customer" : `${p.customers} customers`} · ${p.share}% of sales`} />
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
                <li key={o.billNumber} className="flex items-center gap-1">
                  <Link to={`/bills?show=open&q=${encodeURIComponent(o.billNumber)}`} className={cn(ROW, "min-w-0 flex-1")}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-lp-ink transition-colors group-hover:text-lp-green">{o.customer}</span>
                      <span className="block text-xs text-lp-muted tabular-nums">{o.billNumber}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", bucketOf(o.days).chip)}>{o.days === 0 ? "today" : o.days === 1 ? "1 day" : `${o.days} days`}</span>
                      <span className={cn("w-20 text-end font-semibold tabular-nums", o.days > 60 && "text-destructive")}>{rupees(o.due)}</span>
                    </span>
                  </Link>
                  {/* a ready payment reminder on WhatsApp (a saved customer with a phone number); the same room kept without one */}
                  {reminderLink(o) ? (
                    <a href={reminderLink(o)} target="_blank" rel="noopener noreferrer" title="Send a payment reminder on WhatsApp"
                      aria-label={`Send ${o.customer} a payment reminder on WhatsApp`}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-emerald-600 outline-none transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:bg-emerald-100">
                      <MessageCircle className="size-[18px]" />
                    </a>
                  ) : <span className="size-9 shrink-0" aria-hidden />}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Card>
  )
}
