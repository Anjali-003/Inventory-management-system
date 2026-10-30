import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import { Notice, TableSkeleton } from "@/components/feedback"
import { Card } from "@/components/ui/card"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetMonthlyReportQuery } from "./orderTrackerApi"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
const show = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`)
const q = (text) => encodeURIComponent(text || "")

/* every figure and every row opens the page with the records behind it */
function Figure({ label, value, sub, bad, to }) {
  return (
    <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <Card className="h-full p-4 transition-shadow hover:shadow-md">
        <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}<ChevronRight className="size-3.5" /></p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", bad && "text-destructive")}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </Card>
    </Link>
  )
}

function Row({ to, children, className }) {
  return (
    <Link to={to} className={cn("-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60", className)}>
      {children}
    </Link>
  )
}

function Section({ title, children, to, toLabel }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
        <p className="font-semibold">{title}</p>
        {to && <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{toLabel}<ChevronRight className="size-3.5" /></Link>}
      </div>
      <div className="p-4 text-sm sm:p-5">{children}</div>
    </Card>
  )
}

/*
  The profit worked out on screen, product by product, so nobody has to do the sum in their head:
  pieces × price = sold for, pieces × cost of its parts = cost to make, the difference is the profit.
*/
function ProfitSum({ money }) {
  if (money.profit === null) return <p className="mt-4 text-muted-foreground">Profit: — (nothing sold this month that has a cost yet)</p>
  return (
    <div className="mt-5 space-y-3">
      <p className="font-semibold">How the profit is worked out</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-left tabular-nums">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Sold for</th><th className="px-3 py-2 text-right">Cost to make</th><th className="px-3 py-2 text-right">Profit</th></tr>
          </thead>
          <tbody className="divide-y">
            {money.products.map((p) => (
              <tr key={p.name}>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 text-right">{rupees(p.soldFor)}<span className="block text-xs text-muted-foreground">{fmtQty(p.quantity)} pcs × {rupees(p.pricePerPiece)}</span></td>
                <td className="px-3 py-2 text-right">{rupees(p.cost)}<span className="block text-xs text-muted-foreground">{fmtQty(p.quantity)} pcs × {rupees(p.costPerPiece)}</span></td>
                <td className={cn("px-3 py-2 text-right font-semibold", p.profit < 0 ? "text-destructive" : "text-success")}>{rupees(p.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto max-w-sm space-y-1 rounded-xl bg-muted/40 p-3 tabular-nums">
        <div className="flex justify-between"><dt>Sold for</dt><dd>{rupees(money.soldFor)}</dd></div>
        <div className="flex justify-between"><dt>− Cost to make</dt><dd>{rupees(money.costOfSold)}</dd></div>
        <div className={cn("flex justify-between border-t pt-1 text-base font-bold", money.profit < 0 ? "text-destructive" : "text-success")}><dt>= Profit</dt><dd>{rupees(money.profit)}</dd></div>
      </dl>
      {/* <p className="text-xs text-muted-foreground">Cost to make = the parts in one piece (its BOM) at the price they were last bought for. GST is left out: it goes to the government.</p> */}
    </div>
  )
}

/* The month in four figures: sales, supplier quality, QC first-try pass, and how long an order takes. */
export default function Reports() {
  const [month, setMonth] = useState(thisMonth)
  const { data: r, isLoading, error } = useGetMonthlyReportQuery(month)

  return (
    <>
      <PageHeader title="Reports" description="The month in four numbers. Pick a month to compare; click any number for the records behind it.">
        <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 rounded-[8px] border bg-card px-3 text-[13px]" />
      </PageHeader>
      {error && <Notice title="Could not build the report">{errorMessage(error, "Try again.")}</Notice>}
      {isLoading || !r ? <TableSkeleton rows={6} /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Sales" to={`/bills?show=all&month=${month}`} value={rupees(r.sales.net)} sub={`${r.sales.bills} bill${r.sales.bills === 1 ? "" : "s"} · received ${rupees(r.sales.collected)}`} />
            <Figure label="IQC rejected" to="/iqc" value={show(r.suppliers.rejectedPct, "%")} bad={r.suppliers.rejectedPct > 2}
              sub={`${fmtQty(r.suppliers.rejected)} of ${fmtQty(r.suppliers.received)} pieces · ${r.suppliers.late} of ${r.suppliers.due} deliveries late`} />
            <Figure label="QC passed first try" to={`/quality-control?view=history&month=${month}`} value={show(r.qualityCheck.firstTryPassPct, "%")} bad={r.qualityCheck.firstTryPassPct !== null && r.qualityCheck.firstTryPassPct < 90}
              sub={`${r.qualityCheck.firstTryPassed} of ${r.qualityCheck.firstTryBatches} batches · ${r.qualityCheck.failed} fails in total`} />
            <Figure label="Order to delivery" to="/order-tracker?show=done" value={show(r.orderTime.avgDays, " days")} sub={`${r.orderTime.delivered} order${r.orderTime.delivered === 1 ? "" : "s"} delivered`} />
          </div>

          <Section title="Money">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                ["Sold", rupees(r.sales.total), false, `/bills?show=all&month=${month}`],
                ["Money received", rupees(r.sales.collected), false, `/bills?show=received&month=${month}`],
                ["Money still to come (all bills)", rupees(r.sales.toCollect), r.sales.toCollect > 0, "/bills?show=open"],
              ].map(([l, v, bad, to]) => (
                <Row key={l} to={to} className="border-b border-dashed"><span>{l}</span><span className={cn("font-semibold tabular-nums", bad && "text-destructive")}>{v}</span></Row>
              ))}
            </div>
            <ProfitSum money={r.money} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Still to collect (oldest first)" to="/bills?show=open" toLabel="All">
              {r.sales.owed.length === 0 ? <p className="text-muted-foreground">Every bill is paid.</p> : r.sales.owed.map((o) => (
                <Row key={o.billNumber} to={`/finished-goods?status=all&bill=${o.finishedGoodsId}`}>
                  <span>{o.billNumber} <span className="text-xs text-muted-foreground">· {o.customer} · {o.days} d</span></span>
                  <span className={cn("font-semibold tabular-nums", o.days > 30 && "text-destructive")}>{rupees(o.due)}</span>
                </Row>
              ))}
            </Section>

            <Section title="Suppliers (worst first)" to="/purchase" toLabel="Purchase Orders">
              {r.suppliers.bySupplier.length === 0 ? <p className="text-muted-foreground">No IQC check or due delivery this month.</p> : (
                <div>
                  <div className="grid grid-cols-[1fr_5rem_4rem_4.5rem] gap-2 pb-1 text-xs text-muted-foreground"><span>Supplier</span><span className="text-right">Rejected</span><span className="text-right">Late</span><span className="text-right">Avg late</span></div>
                  {r.suppliers.bySupplier.map((s) => (
                    <Link key={s.name} to={`/purchase?q=${q(s.name)}`} className="-mx-2 grid grid-cols-[1fr_5rem_4rem_4.5rem] gap-2 rounded-md border-t px-2 py-1.5 hover:bg-muted/60">
                      <span>{s.name}</span>
                      <span className={cn("text-right tabular-nums", s.rejectedPct > 2 && "font-semibold text-destructive")}>{show(s.rejectedPct, "%")}</span>
                      <span className={cn("text-right tabular-nums", s.late > 0 && "font-semibold text-destructive")}>{s.late} / {s.due}</span>
                      <span className="text-right tabular-nums">{show(s.avgLateDays, " d")}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Where the order time goes (average days)" to="/order-tracker?show=done" toLabel="Delivered orders">
              {r.orderTime.delivered === 0 ? <p className="text-muted-foreground">No order was delivered this month.</p> : (
                <div className="space-y-1">
                  {[["Waiting for approval", r.orderTime.avgApprovalDays], ["Buying + production + QC", r.orderTime.avgBuildDays], ["Packing to delivery", r.orderTime.avgDispatchDays]].map(([l, v]) => (
                    <Row key={l} to="/order-tracker?show=done"><span>{l}</span><span className="font-semibold tabular-nums">{show(v, " d")}</span></Row>
                  ))}
                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slowest orders</p>
                  {r.orderTime.slowest.map((o) => (
                    <Row key={o.orderNumber} to={`/order-tracker?show=all&order=${o.orderId}`} className="text-muted-foreground"><span>{o.orderNumber}</span><span className="tabular-nums">{o.days} d</span></Row>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Sales by customer">
              {r.sales.byCustomer.length === 0 ? <p className="text-muted-foreground">No bill this month.</p> : r.sales.byCustomer.map((c) => (
                <Row key={c.name} to={`/bills?show=all&month=${month}&q=${q(c.name)}`}>
                  <span>{c.name} <span className="text-xs text-muted-foreground">· {c.bills} bill{c.bills === 1 ? "" : "s"}</span></span>
                  <span className="font-semibold tabular-nums">{rupees(c.total)}</span>
                </Row>
              ))}
            </Section>

            <Section title="QC fails by product" to="/qc-failed" toLabel="QC Failed / Rework">
              {r.qualityCheck.failsByProduct.length === 0 ? <p className="text-muted-foreground">No batch failed QC this month.</p> : r.qualityCheck.failsByProduct.map((p) => (
                <Row key={p.product} to={`/quality-control?q=${q(p.product)}`}><span>{p.product}</span><span className="font-semibold tabular-nums text-destructive">{p.fails}</span></Row>
              ))}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
