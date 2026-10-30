import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, FileText, Receipt } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/core/auth/usePermissions"
import { BillDialog, BillView } from "@/production/finished-goods/FinishedGoods"
import { useGetFinishedGoodsQuery } from "@/production/finished-goods/finishedGoodsApi"
import { myFgStep } from "@/production/finished-goods/fgFlow"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"

const EMPTY = []
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const DAY = 24 * 60 * 60 * 1000
const daysSince = (at) => (at ? Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / DAY)) : null)
const waitingText = (d) => (d === null ? "" : d === 0 ? "Ready today" : d === 1 ? "Waiting 1 day" : `Waiting ${d} days`)

/*
  What the bill will come to, before it is made: each product at the rate agreed on the order, else its price list
  (the same rates the Make bill popup starts from). `missing`: products with neither, whose rate is asked in the popup.
*/
function estimate(item) {
  let amount = 0
  let missing = 0
  for (const l of item.lines) {
    const rate = l.agreedRate ?? l.listPrice
    if (rate === null || rate === undefined) missing += 1
    else amount += rate * l.quantity
  }
  return { amount, missing }
}

/*
  To Bill: the orders that reached the Store and have no bill yet, the oldest first, with whom it is for, what is in
  it and about what it comes to. Make bill opens the bill popup; once made, the new bill opens right away (print it or
  mark it as paid). Bills already made are on the Bills page.
*/
export default function ToBill() {
  const { role } = usePermissions()
  const { data: items = EMPTY, isLoading, error, refetch } = useGetFinishedGoodsQuery()
  const [query, setQuery] = useState("")
  const [billFor, setBillFor] = useState(null) // order whose bill is being made
  const [made, setMade] = useState(null) // order whose bill was just made: its bill is open

  const waiting = useMemo(
    () => items
      .filter((i) => i.status === "IN_STORE")
      .map((i) => ({ item: i, ...estimate(i), days: daysSince(i.receivedAt) }))
      .sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    [items]
  )
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return waiting.filter(({ item: i }) => !q || `${i.orderNumber} ${i.customerName || ""} ${i.lines.map((l) => `${l.name} ${l.sku}`).join(" ")}`.toLowerCase().includes(q))
  }, [waiting, query])
  const total = waiting.reduce((sum, r) => sum + r.amount, 0)
  const anyMissing = waiting.some((r) => r.missing > 0)

  return (
    <>
      <PageHeader title="To Bill" description="Orders that reached the Store and have no bill yet, the oldest first. The rate agreed on the order fills in by itself.">
        <Link to="/bills?show=open" className="inline-flex h-10 items-center gap-1 rounded-[8px] border bg-white px-4 text-[13px] font-semibold outline-none transition-colors hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-primary/30">
          Bills not paid yet <ChevronRight className="size-3.5" />
        </Link>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(error, "Could not load the orders to bill.")}</Notice></div>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
          <p className="text-sm">
            {isLoading ? "Loading…" : waiting.length === 0 ? "Nothing to bill" : (
              <><b className="tabular-nums">{waiting.length}</b> order{waiting.length === 1 ? "" : "s"} to bill · <b className="tabular-nums">{anyMissing ? "about " : ""}{rupees(total)}</b></>
            )}
          </p>
          <div className="w-full sm:ml-auto sm:w-64"><SearchBar value={query} onChange={setQuery} placeholder="Search customer, order or product..." /></div>
        </div>
        {isLoading ? <TableSkeleton rows={4} /> : rows.length === 0 ? (
          <EmptyState icon={Receipt} title={waiting.length ? "No matching order" : "Nothing to bill"}>
            {waiting.length ? "Clear the search to see every order." : "An order shows here once the Store receives it after Quality Control."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Customer</TableHead><TableHead className="hidden md:table-cell">Products</TableHead>
              <TableHead className="text-right">Bill comes to</TableHead><TableHead className="text-right"><span className="sr-only">Action</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(({ item: i, amount, missing, days }) => {
                const canBill = myFgStep(i, role)?.action === "bill"
                return (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal align-top">
                      <span className="block font-semibold">{i.customerName || "No customer on the order"}</span>
                      <span className="block text-xs text-muted-foreground">
                        <Link to={`/order-tracker?order=${i.orderId}`} className="tabular-nums hover:text-primary hover:underline">{i.orderNumber}</Link>
                        {days !== null && <> · <span className={cn(days > 3 && "font-semibold text-warning")}>{waitingText(days)}</span></>}
                      </span>
                      {/* on a phone the products go under the customer */}
                      <span className="mt-1 block text-xs text-muted-foreground md:hidden">{i.lines.map((l) => `${l.name} × ${l.quantity}`).join(", ")}</span>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal align-top md:table-cell">
                      {i.lines.map((l) => (
                        <span key={l.productId} className="block leading-snug">{l.name} <span className="tabular-nums text-muted-foreground">× {l.quantity}</span></span>
                      ))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right align-top tabular-nums">
                      <span className="block font-semibold">{missing && !amount ? "—" : rupees(amount)}</span>
                      {missing > 0 && <span className="block text-xs text-warning">{missing === 1 ? "1 rate" : `${missing} rates`} to enter</span>}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {canBill
                        ? <Button size="sm" onClick={() => setBillFor(i)}><FileText /> Make bill</Button>
                        : <span className="text-xs text-muted-foreground">Marketing makes the bill</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {billFor && <BillDialog item={billFor} onClose={() => setBillFor(null)} onDone={() => { setMade(billFor); setBillFor(null); refetch() }} />}
      <BillView item={made ? { id: made.id, orderNumber: made.orderNumber } : null} role={role} onClose={() => setMade(null)} onChanged={refetch} />
    </>
  )
}
