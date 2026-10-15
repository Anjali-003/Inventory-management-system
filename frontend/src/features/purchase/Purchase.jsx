import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ClipboardList, Loader2, PackageCheck, RefreshCw, Send, ShoppingCart } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetPurchasesQuery, useReceivePurchaseMutation, useSendPurchaseToIqcMutation } from "@/features/purchasing/purchasingApi"
import { PurchaseDetailModal, PurchaseStatus } from "@/features/purchasing/PurchaseParts"
import { ordersToOrder, qtyWithUnit } from "@/features/purchasing/purchasingUtils"
import { useGetApprovedOrdersQuery } from "@/features/order-approvals/orderApprovalsApi"
import { useToast } from "@/components/toast"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import NewPurchaseModal from "./NewPurchaseModal"

const EMPTY = []

/*
  Purchase department. The purchase manager can only buy what the Operations Admin sent: the "Components to order"
  panel lists the short components of every approved order, and "Place order" turns some or all of them into a
  purchase (no free purchases). Then he marks it Received when the goods arrive and presses Send to IQC: only then
  does it reach the IQC manager (inspection) and, once approved there, the store manager.
  The Store Manager, IQC Manager and Operations Admin see this page read-only.
*/
export default function Purchase() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("purchase")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetPurchasesQuery()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(null) // set by clicking a figure in the strip
  const [placing, setPlacing] = useState(null) // order id whose "Place order" dialog is open
  const [viewing, setViewing] = useState(null)
  const approved = useGetApprovedOrdersQuery(undefined, { skip: !editable })
  const toOrder = useMemo(() => ordersToOrder(approved.data), [approved.data])
  const placingGroup = toOrder.find((g) => g.order.id === placing) || null // closes itself once every line is ordered
  const [receive] = useReceivePurchaseMutation()
  const [sendToIqc] = useSendPurchaseToIqcMutation()
  const [busyId, setBusyId] = useState(null) // the purchase whose button was just pressed

  // "Raise purchase" on an order card sends us here with that order selected
  const location = useLocation()
  const navigate = useNavigate()
  const wantedOrder = location.state?.orderId
  useEffect(() => {
    if (!wantedOrder || !toOrder.some((g) => g.order.id === wantedOrder)) return
    setPlacing(wantedOrder)
    navigate(location.pathname, { replace: true, state: null })
  }, [wantedOrder, toOrder, navigate, location.pathname])

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
    return data.filter((p) => (!status || p.status === status) && (!q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
      p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))))
  }, [data, query, status])

  return (
    <>
      <PageHeader title="Purchase" description="Order the components the Operations Admin sent, mark them received when the goods arrive, then send them to IQC.">
        <Button variant="outline" onClick={() => { refetch(); approved.refetch?.() }} disabled={isFetching}><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load purchases. Check that the server is running.</Notice></div>}

      {editable && (
        <Card className="mb-4 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold">Components to order</h2>
              <p className="text-xs text-muted-foreground">Sent by the Operations Admin. You can only place orders for these.</p>
            </div>
            {toOrder.length > 0 && <Badge variant="danger">{toOrder.length} order{toOrder.length > 1 ? "s" : ""} waiting</Badge>}
          </div>
          {approved.isLoading ? (
            <TableSkeleton />
          ) : toOrder.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nothing to order">
              When the Operations Admin sends an order with short components, they will appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {toOrder.map(({ order, lines }) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{order.order_number}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {lines.slice(0, 3).map((l) => `${l.name} (${qtyWithUnit(l.quantity, l.unit)})`).join(", ")}
                      {lines.length > 3 && ` +${lines.length - 3} more`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setPlacing(order.id)}><ShoppingCart /> Place order ({lines.length})</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <StatStrip
          cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
          layoutId="purchase-summary"
          items={[
            ...[
              { key: "ordered", s: "ORDER_PLACED", label: "Order placed", tone: "neutral", hint: "Waiting for the goods" },
              { key: "received", s: "RECEIVED", label: "Received", tone: "info", hint: "Not sent to IQC yet" },
              { key: "iqc", s: "PENDING_IQC", label: "With IQC", tone: "warning", hint: "Waiting for inspection" },
              { key: "store", s: "PENDING_STORE", label: "With store", tone: "info", hint: "Approved, waiting to be accepted" },
              { key: "stored", s: "STORED", label: "In stock", tone: "success" },
              { key: "rej", s: "REJECTED", label: "Rejected", tone: "danger" },
            ].map(({ s, ...it }) => ({ ...it, value: count(s), active: status === s, onClick: () => setStatus(status === s ? null : s) })),
          ]}
        />
        <div className="border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQuery} placeholder="Search PO, supplier or component..." />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={query || status ? "No purchase matches your search" : "No purchases yet"}>
            {query || status ? "Try a different search, or click the selected figure again to clear the filter." : editable ? "Place an order from the components the Operations Admin sent (above)." : "Purchases will appear here."}
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
                    <TableCell>
                      <p className="font-semibold">{p.po_number}</p>
                      {p.order_number && <p className="text-xs text-muted-foreground">for {p.order_number}</p>}
                    </TableCell>
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

      {placingGroup && <NewPurchaseModal order={placingGroup.order} lines={placingGroup.lines} onClose={() => setPlacing(null)} />}
      <PurchaseDetailModal purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </>
  )
}
