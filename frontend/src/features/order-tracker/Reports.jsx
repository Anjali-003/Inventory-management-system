import { useState } from "react"
import PageHeader from "@/components/PageHeader"
import { Notice, TableSkeleton } from "@/components/feedback"
import { Card } from "@/components/ui/card"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetMonthlyReportQuery } from "./orderTrackerApi"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
const show = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`)

function Figure({ label, value, sub, bad }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", bad && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

function Section({ title, children }) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b px-4 py-3 font-semibold sm:px-5">{title}</p>
      <div className="p-4 text-sm sm:p-5">{children}</div>
    </Card>
  )
}

/* The month in four figures: sales, supplier quality, QC first-try pass, and how long an order takes. */
export default function Reports() {
  const [month, setMonth] = useState(thisMonth)
  const { data: r, isLoading, error } = useGetMonthlyReportQuery(month)

  return (
    <>
      <PageHeader title="Reports" description="The month in four numbers. Pick a month to compare.">
        <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 rounded-[8px] border bg-card px-3 text-[13px]" />
      </PageHeader>
      {error && <Notice title="Could not build the report">{errorMessage(error, "Try again.")}</Notice>}
      {isLoading || !r ? <TableSkeleton rows={6} /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Sales" value={rupees(r.sales.total)} sub={`${r.sales.bills} bill${r.sales.bills === 1 ? "" : "s"} · GST ${rupees(r.sales.gst)}`} />
            <Figure label="IQC rejected" value={show(r.suppliers.rejectedPct, "%")} bad={r.suppliers.rejectedPct > 2}
              sub={`${fmtQty(r.suppliers.rejected)} of ${fmtQty(r.suppliers.received)} pieces · ${r.suppliers.late} of ${r.suppliers.due} deliveries late`} />
            <Figure label="QC passed first try" value={show(r.qualityCheck.firstTryPassPct, "%")} bad={r.qualityCheck.firstTryPassPct !== null && r.qualityCheck.firstTryPassPct < 90}
              sub={`${r.qualityCheck.firstTryPassed} of ${r.qualityCheck.firstTryBatches} batches · ${r.qualityCheck.failed} fails in total`} />
            <Figure label="Order to delivery" value={show(r.orderTime.avgDays, " days")} sub={`${r.orderTime.delivered} order${r.orderTime.delivered === 1 ? "" : "s"} delivered`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Suppliers (worst first)">
              {r.suppliers.bySupplier.length === 0 ? <p className="text-muted-foreground">No IQC check or due delivery this month.</p> : (
                <table className="w-full text-left">
                  <thead className="text-xs text-muted-foreground"><tr><th className="py-1">Supplier</th><th className="py-1 text-right">Rejected</th><th className="py-1 text-right">Late</th><th className="py-1 text-right">Avg late</th></tr></thead>
                  <tbody className="divide-y border-t">{r.suppliers.bySupplier.map((s) => (
                    <tr key={s.name}>
                      <td className="py-1.5">{s.name}</td>
                      <td className={cn("text-right tabular-nums", s.rejectedPct > 2 && "font-semibold text-destructive")}>{show(s.rejectedPct, "%")}</td>
                      <td className={cn("text-right tabular-nums", s.late > 0 && "font-semibold text-destructive")}>{s.late} / {s.due}</td>
                      <td className="text-right tabular-nums">{show(s.avgLateDays, " d")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Section>

            <Section title="Where the order time goes (average days)">
              {r.orderTime.delivered === 0 ? <p className="text-muted-foreground">No order was delivered this month.</p> : (
                <div className="space-y-3">
                  {[["Waiting for approval", r.orderTime.avgApprovalDays], ["Buying + production + QC", r.orderTime.avgBuildDays], ["Packing to delivery", r.orderTime.avgDispatchDays]].map(([l, v]) => (
                    <div key={l} className="flex justify-between"><span>{l}</span><span className="font-semibold tabular-nums">{show(v, " d")}</span></div>
                  ))}
                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slowest orders</p>
                  {r.orderTime.slowest.map((o) => <div key={o.orderNumber} className="flex justify-between text-muted-foreground"><span>{o.orderNumber}</span><span className="tabular-nums">{o.days} d</span></div>)}
                </div>
              )}
            </Section>

            <Section title="Sales by customer">
              {r.sales.byCustomer.length === 0 ? <p className="text-muted-foreground">No bill this month.</p> : r.sales.byCustomer.map((c) => (
                <div key={c.name} className="flex justify-between py-1"><span>{c.name} <span className="text-xs text-muted-foreground">· {c.bills} bill{c.bills === 1 ? "" : "s"}</span></span><span className="font-semibold tabular-nums">{rupees(c.total)}</span></div>
              ))}
            </Section>

            <Section title="QC fails by product">
              {r.qualityCheck.failsByProduct.length === 0 ? <p className="text-muted-foreground">No batch failed QC this month.</p> : r.qualityCheck.failsByProduct.map((p) => (
                <div key={p.product} className="flex justify-between py-1"><span>{p.product}</span><span className="font-semibold tabular-nums text-destructive">{p.fails}</span></div>
              ))}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
