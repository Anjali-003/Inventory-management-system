import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDownToLine, ArrowUpFromLine, Package } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetProductStockMovementsQuery, useGetProductStockQuery } from "./productStockApi"

const EMPTY = []
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—")

/*
  Product inventory: how many finished products the Store holds (Fans: +100 received, -60 given out -> 40 left).
  Read only for everyone: it goes up when Store receives packed goods and down when Store gives them out for delivery.
*/
export default function ProductStock() {
  const [tab, setTab] = useState("stock")
  const [query, setQuery] = useState("")
  const [productId, setProductId] = useState(null)
  const stock = useGetProductStockQuery()
  const moves = useGetProductStockMovementsQuery(productId, { skip: tab !== "moves" })
  const items = stock.data ?? EMPTY

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => !q || `${i.name} ${i.sku}`.toLowerCase().includes(q))
  }, [items, query])
  const total = items.reduce((sum, i) => sum + i.onHand, 0)
  const selected = items.find((i) => i.productId === productId)

  const showMoves = (id) => { setProductId(id); setTab("moves") }

  return (
    <>
      <PageHeader title="Product Stock" description="Finished products in the Store. It goes up when Store receives packed goods and down when Store gives them out for delivery." />

      <div role="tablist" className="mb-4 inline-flex rounded-lg border bg-card p-1 text-sm">
        {[["stock", "Stock"], ["moves", "In / out history"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("h-8 rounded-md px-3.5 font-medium", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>

      {(stock.error || moves.error) && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(stock.error || moves.error, "Could not load product stock.")}</Notice></div>}

      <Card className="overflow-hidden">
        {tab === "stock" ? (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
              <SearchBar value={query} onChange={setQuery} placeholder="Search product or SKU..." />
              <span className="ml-auto text-sm text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span> pieces in the Store</span>
            </div>
            {stock.isLoading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
              <EmptyState icon={Package} title="No products">Products appear here once Super Admin adds them on the Products page.</EmptyState>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">In stock now</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Received (total)</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Given out (total)</TableHead>
                  <TableHead className="hidden md:table-cell">Last change</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((i) => (
                    <TableRow key={i.productId} className="cursor-pointer" onClick={() => showMoves(i.productId)}>
                      <TableCell className="whitespace-normal"><span className="block font-medium">{i.name}</span><span className="block text-xs text-muted-foreground">{i.sku}</span></TableCell>
                      <TableCell className={cn("text-right text-base font-bold tabular-nums", i.onHand === 0 && "text-muted-foreground")}>{i.onHand.toLocaleString()}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.totalIn.toLocaleString()}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.totalOut.toLocaleString()}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{when(i.lastMovementAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
              <select aria-label="Product" className="h-9 rounded-[8px] border bg-card px-3 text-[13px]" value={productId ?? ""} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All products</option>
                {items.map((i) => <option key={i.productId} value={i.productId}>{i.name}</option>)}
              </select>
              {selected && <span className="text-sm text-muted-foreground">In stock now: <span className="font-semibold text-foreground">{selected.onHand}</span></span>}
            </div>
            {moves.isLoading || (moves.isFetching && !moves.data) ? <TableSkeleton rows={6} /> : (moves.data ?? EMPTY).length === 0 ? (
              <EmptyState icon={Package} title="No movements yet">Nothing has been received or given out yet.</EmptyState>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Product</TableHead><TableHead className="text-right">In / out</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Left after</TableHead><TableHead className="hidden md:table-cell">Why</TableHead><TableHead className="hidden lg:table-cell">By</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {moves.data.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">{when(m.createdAt)}</TableCell>
                      <TableCell className="whitespace-normal font-medium">{m.name}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", m.direction === "IN" ? "text-success" : "text-destructive")}>
                        <span className="inline-flex items-center gap-1">{m.direction === "IN" ? <ArrowDownToLine className="size-3.5" /> : <ArrowUpFromLine className="size-3.5" />}{m.direction === "IN" ? "+" : "−"}{m.quantity}</span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{m.balanceAfter}</TableCell>
                      <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">
                        {m.reason}
                        {m.orderId && <Link to={`/order-tracker?order=${m.orderId}`} className="block text-xs font-semibold text-primary hover:underline">{m.orderNumber}</Link>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{m.createdByName || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Card>
    </>
  )
}
