import { useMemo, useState } from "react"
import { Loader2, PackageCheck, Plus, RefreshCw, Send, ShoppingCart } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetPurchasesQuery, useReceivePurchaseMutation, useSendPurchaseToIqcMutation } from "@/features/purchasing/purchasingApi"
import { PurchaseDetailModal, PurchaseStatus } from "@/features/purchasing/PurchaseParts"
import { useToast } from "@/components/toast"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import NewPurchaseModal from "./NewPurchaseModal"

const EMPTY = []

/*
  Purchase department. The purchase manager places an order, marks it Received when the goods arrive,
  then presses Send to IQC: only then does it reach the IQC manager (inspection) and, once approved
  there, the store manager. The Store Manager sees this page read-only.
*/
export default function Purchase() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("purchase")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetPurchasesQuery()
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [receive] = useReceivePurchaseMutation()
  const [sendToIqc] = useSendPurchaseToIqcMutation()
  const [busyId, setBusyId] = useState(null) // the purchase whose button was just pressed

  // one step forward for one purchase; the list refreshes itself (tag "Purchases")
  const step = async (p, run, done) => {
    setBusyId(p.id)
    try {
      await run(p.id).unwrap()
      toast.success(`${p.po_number} ${done}`)
    } catch (err) {
      toast.error(errorMessage(err, "Could not update this purchase."))
    } finally {
      setBusyId(null)
    }
  }

  const count = (s) => data.filter((p) => p.status === s).length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter((p) => !q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
      p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
  }, [data, query])

  return (
    <>
      <PageHeader title="Purchase" description="Place the order, mark it received when the goods arrive, then send it to IQC.">
        <div className="flex gap-2">
          <Button variant="outline" onClick={refetch} disabled={isFetching}><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</Button>
          {editable && <Button onClick={() => setAdding(true)}><Plus /> New purchase</Button>}
        </div>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load purchases. Check that the server is running.</Notice></div>}

      <Card className="overflow-hidden">
        <StatStrip
          cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
          layoutId="purchase-summary"
          items={[
            { key: "ordered", label: "Order placed", value: count("ORDER_PLACED"), tone: "neutral", hint: "Waiting for the goods" },
            { key: "received", label: "Received", value: count("RECEIVED"), tone: "info", hint: "Not sent to IQC yet" },
            { key: "iqc", label: "With IQC", value: count("PENDING_IQC"), tone: "warning", hint: "Waiting for inspection" },
            { key: "store", label: "With store", value: count("PENDING_STORE"), tone: "info", hint: "Approved, waiting to be accepted" },
            { key: "stored", label: "In stock", value: count("STORED"), tone: "success" },
            { key: "rej", label: "Rejected", value: count("REJECTED"), tone: "danger" },
          ]}
        />
        <div className="border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQuery} placeholder="Search PO, supplier or component..." />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={query ? "No purchase matches your search" : "No purchases yet"}>
            {query ? "Try a different PO number, supplier or component." : editable ? "Use New purchase to record the components you bought." : "Purchases will appear here."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purchased by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.po_number}</TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-muted-foreground">{p.totals.lines} item{p.totals.lines === 1 ? "" : "s"} · {fmtQty(p.totals.ordered)} ordered</TableCell>
                    <TableCell><PurchaseStatus value={p.status} /></TableCell>
                    <TableCell><UserCell name={p.created_by_name} sub={fmtDateTime(p.created_at)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {editable && p.status === "ORDER_PLACED" && (
                          <Button size="sm" disabled={busyId === p.id} onClick={() => step(p, receive, "marked as received")}>
                            {busyId === p.id ? <Loader2 className="animate-spin" /> : <PackageCheck />} Received
                          </Button>
                        )}
                        {editable && p.status === "RECEIVED" && (
                          <Button size="sm" disabled={busyId === p.id} onClick={() => step(p, sendToIqc, "sent to IQC")}>
                            {busyId === p.id ? <Loader2 className="animate-spin" /> : <Send />} Send to IQC
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setViewing(p)}>Details</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {adding && <NewPurchaseModal onClose={() => setAdding(false)} />}
      <PurchaseDetailModal purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </>
  )
}
