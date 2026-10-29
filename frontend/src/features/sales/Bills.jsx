import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useUrlState } from "@/lib/useUrlState"
import { ChevronRight, Receipt, X } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { BillView } from "@/features/finished-goods/FinishedGoods"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetBillsQuery, useGetPaymentsQuery, useGetSalesSummaryQuery } from "./salesApi"

const EMPTY = []
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const when = (at) => (at ? new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")
const BADGE = { PAID: ["success", "Paid"], PART_PAID: ["warning", "Part paid"], UNPAID: ["danger", "Not paid"], CANCELLED: ["neutral", "Cancelled"] }
// a bill is paid in full in one go, so it is either still to be paid ("open") or paid
const FILTERS = [["open", "Not paid"], ["PAID", "Paid"], ["all", "All"], ["CANCELLED", "Cancelled"], ["received", "Received"]]
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
// "2026-09" for a bill's date (the browser's own time zone, the same day the bill shows)
const monthOf = (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` }
const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
const METHOD = { CASH: "Cash", BANK: "Bank", UPI: "UPI", CHEQUE: "Cheque", OTHER: "Other" }

function Figure({ label, value, sub, to, bad }) {
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

/*
  Sales & Billing: every bill, what it was for, what came in and what is still to collect. Click a bill to open it
  (record a payment, print; the Super Admin can cancel it).
  "Received" lists the payments themselves (by the date the money came), not bills.
  Links in: ?show=open|PAID|all|CANCELLED|received, ?q=<customer / bill / order>, ?bill=<bill id>,
            ?month=2026-09 (the bills made and the money received in that month, as the Marketing dashboard picked it;
            "Not paid" always shows everything still owed today, whatever month the bill is from)
*/
export default function Bills() {
  const { role } = usePermissions()
  const { params, setParams, openPopup, closePopup } = useUrlState()
  const month = MONTH_RE.test(params.get("month") || "") ? params.get("month") : null
  const { data: bills = EMPTY, isLoading, error, refetch } = useGetBillsQuery()
  const { data: summary } = useGetSalesSummaryQuery(month || undefined)
  const { data: payments = EMPTY, isLoading: paymentsLoading } = useGetPaymentsQuery(month || undefined)
  const period = month ? `in ${monthName(month)}` : "this month"
  const clearMonth = () => setParams((p) => { const next = new URLSearchParams(p); next.delete("month"); return next }, { replace: true })
  // a month picked: only that month's bills, except "Not paid" (what is owed today, from any month)
  const inMonth = (b, k) => !month || k === "open" || monthOf(b.createdAt) === month
  const [query, setQuery] = useState(() => params.get("q") || "")
  const show = FILTERS.some(([k]) => k === params.get("show")) ? params.get("show") : "open"
  const setShow = (k) => setParams((p) => { const next = new URLSearchParams(p); next.set("show", k); return next }, { replace: true })
  const opened = bills.find((b) => String(b.id) === params.get("bill")) || null
  const openBill = (b) => (b ? openPopup({ bill: b.id }) : closePopup({ bill: null }))

  const count = (k) => k === "received" ? payments.length : bills.filter((b) => inMonth(b, k) && (k === "open" ? b.due > 0 : k === "all" ? b.status === "ACTIVE" : b.paymentStatus === k)).length
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bills
      .filter((b) => (!month || show === "open" || monthOf(b.createdAt) === month) && (show === "open" ? b.due > 0 : show === "all" ? b.status === "ACTIVE" : b.paymentStatus === show))
      .filter((b) => !q || `${b.billNumber} ${b.orderNumber} ${b.customerName}`.toLowerCase().includes(q))
      // what is owed longest first; otherwise newest first
      .sort((a, b) => (show === "open" ? b.days - a.days : b.id - a.id))
  }, [bills, query, show, month])
  const paymentRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return payments.filter((p) => !q || `${p.billNumber} ${p.orderNumber} ${p.customerName} ${p.reference || ""}`.toLowerCase().includes(q))
  }, [payments, query])
  const openPaymentBill = (p) => p.billStatus === "ACTIVE" && openPopup({ bill: p.billId })

  return (
    <>
      <PageHeader title="Bills" description="Every bill: what came in and what is still to collect. Click a bill to record a payment or print it.">
        <Link to="/to-bill" className="inline-flex h-10 items-center rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30">
          Make a bill ({summary?.toBill ?? 0} waiting)
        </Link>
      </PageHeader>

      {summary && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label={`Sales ${period}`} to={`/bills?show=all${month ? `&month=${month}` : ""}`} value={rupees(summary.net)} sub={`${summary.bills} bill${summary.bills === 1 ? "" : "s"}`} />
          <Figure label={`Received ${period}`} to={`/bills?show=received${month ? `&month=${month}` : ""}`} value={rupees(summary.collected)} sub={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} />
          <Figure label="NOT RECEIVED" to="/bills?show=open" value={rupees(summary.toCollect)} bad={summary.toCollect > 0} sub={summary.owed[0] ? `Oldest: ${summary.owed[0].billNumber}, ${summary.owed[0].days} days` : "Every bill is paid"} />
          <Figure label="Orders to bill" to="/to-bill" value={summary.toBill} bad={summary.toBill > 0} sub="In the Store, no bill yet" />
        </div>
      )}

      {month && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Showing bills made and money received in
          <button type="button" onClick={clearMonth} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-semibold text-primary hover:bg-violet-100" aria-label={`Show every month, not only ${monthName(month)}`}>
            {monthName(month)} <X className="size-3.5" />
          </button>
          <span className="text-xs">("Not paid" shows everything still owed today.)</span>
        </p>
      )}

      {error && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(error, "Could not load the bills.")}</Notice></div>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", show === k ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-slate-50")}>
              {k === "received" ? `Received ${period}` : l} <span className="tabular-nums opacity-80">{count(k)}</span>
            </button>
          ))}
          <div className="w-full sm:ml-auto sm:w-64"><SearchBar value={query} onChange={setQuery} placeholder="Search bill, order or customer..." /></div>
        </div>
        {show === "received" ? (
          paymentsLoading ? <TableSkeleton rows={6} /> : paymentRows.length === 0 ? (
            <EmptyState icon={Receipt} title={`No payment ${period}`}>
              {payments.length ? "Clear the search to see every payment." : "Payments show here once Marketing records money received on a bill."}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Bill</TableHead><TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">How</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paymentRows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => openPaymentBill(p)}>
                    <TableCell className="whitespace-nowrap tabular-nums">{when(p.paidOn)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="block font-semibold tabular-nums">{p.billNumber}</span>
                      <span className="block text-xs text-muted-foreground">
                        <Link to={`/order-tracker?order=${p.orderId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{p.orderNumber}</Link>
                        {p.billStatus !== "ACTIVE" && " · bill cancelled"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {p.customerId
                        ? <Link to={`/customers?q=${encodeURIComponent(p.customerName)}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{p.customerName}</Link>
                        : p.customerName}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal sm:table-cell">
                      {METHOD[p.method] || p.method}
                      {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                      {p.createdByName && <span className="block text-xs text-muted-foreground">by {p.createdByName}</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-success">{rupees(p.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={3} className="font-semibold sm:hidden">Total</TableCell>
                  <TableCell colSpan={4} className="hidden font-semibold sm:table-cell">Total</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{rupees(paymentRows.reduce((sum, p) => sum + p.amount, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )
        ) : isLoading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={Receipt} title={bills.length ? "No bill here" : "No bills yet"}>
            {bills.length ? "Pick another filter above or clear the search." : "Bills appear here once Marketing bills an order that reached the Store."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Bill</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Received</TableHead><TableHead className="text-right">To collect</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => b.status === "ACTIVE" && openBill(b)}>
                  <TableCell className="whitespace-normal">
                    <span className="block font-semibold tabular-nums">{b.billNumber}</span>
                    <span className="block text-xs text-muted-foreground">
                      <Link to={`/order-tracker?order=${b.orderId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{b.orderNumber}</Link> · {when(b.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {b.customerId
                      ? <Link to={`/customers?q=${encodeURIComponent(b.customerName)}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{b.customerName}</Link>
                      : b.customerName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(b.net)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{rupees(b.paid)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", b.due > 0 && "text-destructive")}>
                    {rupees(b.due)}{b.due > 0 && <span className="block text-xs font-normal text-muted-foreground">{b.days} d old</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BADGE[b.paymentStatus][0]}>{BADGE[b.paymentStatus][1]}</Badge>
                    {b.status === "CANCELLED" && b.cancelReason && <span className="mt-1 block max-w-48 text-xs text-muted-foreground">{b.cancelReason}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <BillView item={opened ? { id: opened.finishedGoodsId, orderNumber: opened.orderNumber } : null} role={role} onClose={() => openBill(null)} onChanged={refetch} />
    </>
  )
}
