import { useMemo, useState } from "react"
import { ClipboardCheck, PackageCheck, RefreshCw, X } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import StatStrip from "@/components/StatStrip"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/features/auth/usePermissions"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { ApprovalStatus } from "./approvalParts"
import DecisionModal from "./DecisionModal"
import OrderPlanModal from "./OrderPlanModal"
import PlanSummary from "./PlanSummary"
import { useGetOrderApprovalsQuery } from "./orderApprovalsApi"

const EMPTY = []

/*
  Operations Admin: every order that came in (e.g. from the marketing team) and whether it is approved.
  "Waiting for approval" is the work queue. Each waiting order shows right away how much of it can be built from the
  stock on the shelf. "Check stock & send" opens the plan: the producible list goes to the Production Manager and the
  list of missing components goes to the Purchase Manager. Reject needs a reason.
*/
export default function OrderApprovals() {
  const { canEdit } = usePermissions()
  const editable = canEdit("orderApprovals")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetOrderApprovalsQuery()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("PENDING_APPROVAL") // opens on the work queue
  const [deciding, setDeciding] = useState(null) // { order, mode } (reject)
  const [planning, setPlanning] = useState(null) // the order whose stock check is open

  const count = (s) => data.filter((o) => o.approval_status === s).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter(
      (o) =>
        (!status || o.approval_status === status) &&
        (!q ||
          o.order_number.toLowerCase().includes(q) ||
          (o.created_by_name || "").toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)))
    )
  }, [data, query, status])

  const strip = [
    { s: "PENDING_APPROVAL", key: "pending", label: "Waiting for approval", tone: "warning", hint: "Needs your decision" },
    { s: "APPROVED", key: "approved", label: "Approved", tone: "success", hint: "Lists sent to Production / Purchase" },
    { s: "REJECTED", key: "rejected", label: "Rejected", tone: "danger" },
  ].map(({ s, ...it }) => ({ ...it, value: count(s), active: status === s, onClick: () => setStatus(status === s ? null : s) }))

  return (
    <>
      <PageHeader title="Order Approvals" description="See what can be built from current stock, send that list to Production and the missing components to Purchase, or reject the order.">
        <Button variant="outline" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load orders. Check that the server is running.</Notice></div>}

      <Card className="overflow-hidden">
        <StatStrip cols="grid-cols-1 sm:grid-cols-3" layoutId="order-approval-summary" items={strip} />

        <div className="border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or who raised it..." />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={query || status !== "PENDING_APPROVAL" ? "No orders match" : "Nothing waiting for approval"}>
            {query || status !== "PENDING_APPROVAL"
              ? "Try a different search, or click the selected figure again to clear the filter."
              : "New orders will show up here as soon as they are raised."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stock check</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold tabular-nums">{o.order_number}</TableCell>
                    <TableCell className="min-w-56">
                      <ul className="space-y-0.5">
                        {o.items.map((i) => (
                          <li key={i.product_id} className="text-sm">
                            {i.name} <span className="text-muted-foreground">× {fmtQty(i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell><ApprovalStatus value={o.approval_status} /></TableCell>
                    <TableCell className="min-w-52">
                      {o.approval_status === "PENDING_APPROVAL" ? <PlanSummary orderId={o.id} items={o.items} /> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="min-w-44"><UserCell name={o.created_by_name} sub={fmtDateTime(o.created_at)} /></TableCell>
                    <TableCell className="min-w-44">
                      {o.approval_status === "PENDING_APPROVAL" ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <div className="space-y-0.5">
                          <UserCell name={o.approved_by_name} sub={fmtDateTime(o.approved_at)} />
                          {o.approval_remarks && <p className="text-xs text-muted-foreground">{o.approval_remarks}</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable && o.approval_status === "PENDING_APPROVAL" && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDeciding({ order: o, mode: "reject" })}><X /> Reject</Button>
                          <Button size="sm" onClick={() => setPlanning(o)}><PackageCheck /> Check stock &amp; send</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {deciding && <DecisionModal order={deciding.order} mode={deciding.mode} onClose={() => setDeciding(null)} />}
      {planning && <OrderPlanModal order={planning} onClose={() => setPlanning(null)} />}
    </>
  )
}
