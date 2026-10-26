import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useGetSalesSummaryQuery } from "./salesApi"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

/* Marketing dashboard: this month's sales, money in, money still out (oldest bills first) and orders to bill */
export default function SalesSnapshot({ className }) {
  const { data: s, isLoading } = useGetSalesSummaryQuery()
  const figures = s ? [
    ["Sales this month", rupees(s.net), "/bills?show=all", false],
    ["Received", rupees(s.collected), "/bills?show=PAID", false],
    ["Still to collect", rupees(s.toCollect), "/bills?show=open", s.toCollect > 0],
    ["Orders to bill", s.toBill, "/finished-goods?status=IN_STORE", s.toBill > 0],
  ] : []

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="items-center">
        <div><CardTitle>Sales & billing</CardTitle><CardDescription>This month. Click any number for the bills behind it.</CardDescription></div>
        <Link to="/bills" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">All bills<ChevronRight className="size-3.5" /></Link>
      </CardHeader>
      {isLoading || !s ? <p className="px-5 pb-5 text-sm text-muted-foreground">Loading…</p> : (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map(([label, value, to, bad]) => (
              <Link key={label} to={to} className="rounded-lg border px-3 py-2 hover:bg-muted/60">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-xl font-semibold tabular-nums", bad && "text-destructive")}>{value}</p>
              </Link>
            ))}
          </div>
          {s.owed.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collect first (oldest bills)</p>
              <ul className="divide-y">
                {s.owed.slice(0, 5).map((o) => (
                  <li key={o.billNumber}>
                    <Link to={`/bills?show=open&q=${encodeURIComponent(o.billNumber)}`} className="-mx-2 flex justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60">
                      <span>{o.billNumber} <span className="text-xs text-muted-foreground">· {o.customer} · {o.days} d</span></span>
                      <span className={cn("font-semibold tabular-nums", o.days > 30 && "text-destructive")}>{rupees(o.due)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
