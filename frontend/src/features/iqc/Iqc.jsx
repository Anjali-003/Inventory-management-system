import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, Download, PackageCheck, RefreshCw } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { StatCard } from "@/components/HistoryUI"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGetMeQuery } from "@/features/auth/authApi"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetIqcQueueQuery } from "@/features/purchasing/purchasingApi"
import { PurchaseDetailModal, PurchaseStatus } from "@/features/purchasing/PurchaseParts"
import { WAS_INSPECTED, downloadRejected, rejectedLines } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import InspectModal from "./InspectModal"

const EMPTY = []

/*
  IQC dashboard (Incoming Quality Control).
  Purchased components land here first. The inspector checks the quantity that arrived and marks
  approved components go on to the store manager, who must accept them into stock.
  The Store Manager can open this page too, but read-only (no Inspect button).
*/
export default function Iqc() {
  const { data: me } = useGetMeQuery()
  const { canEdit } = usePermissions()
  const editable = canEdit("iqc")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetIqcQueueQuery()
  const [query, setQuery] = useState("")
  const [inspecting, setInspecting] = useState(null) // purchase id (looked up again so the dialog always has fresh data)
  const [viewing, setViewing] = useState(null)

  const byStatus = (s) => data.filter((p) => p.status === s)
  const waiting = byStatus("PENDING_IQC")
  const inspected = data.filter((p) => WAS_INSPECTED(p.status))

  const match = (p) => {
    const q = query.trim().toLowerCase()
    return !q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
      p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
  }
  const waitingShown = useMemo(() => waiting.filter(match), [waiting, query]) // eslint-disable-line react-hooks/exhaustive-deps
  const inspectedShown = useMemo(() => inspected.filter(match), [inspected, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const toInspect = inspecting ? data.find((p) => p.id === inspecting && p.status === "PENDING_IQC") : null
  const first = (me?.name || "").split(/\s+/)[0]

  return (
    <>
      <PageHeader
        title={me?.name ? `Hello, ${me.name}` : "IQC"}
        description={
          waiting.length > 0
            ? `${waiting.length} purchase${waiting.length === 1 ? " is" : "s are"} waiting for your inspection${first ? `, ${first}` : ""}.`
            : "Nothing is waiting for inspection right now."
        }
      >
        <Button variant="outline" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && (
        <div className="mb-6">
          <Notice title="Something went wrong">Could not load the IQC queue. Check that the server is running.</Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={ClipboardList} tone={waiting.length ? "amber" : "green"} label="Waiting for inspection" value={waiting.length} loading={isLoading} detail="Purchased, not checked yet" />
        <StatCard index={1} icon={PackageCheck} tone="blue" label="Sent to store" value={byStatus("PENDING_STORE").length} loading={isLoading} detail="Approved, store must accept" />
        <StatCard index={2} icon={CheckCircle2} tone="green" label="Accepted into stock" value={byStatus("STORED").length} loading={isLoading} detail="Fully through the flow" />
        <StatCard index={3} icon={AlertTriangle} tone={byStatus("REJECTED").length ? "red" : "violet"} label="Rejected" value={byStatus("REJECTED").length} loading={isLoading} detail="Nothing approved" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>To inspect</CardTitle>
            <CardDescription>Purchases the purchase manager has received and sent to IQC.</CardDescription>
          </div>
          <SearchBar value={query} onChange={setQuery} placeholder="Search PO, supplier or component..." />
        </CardHeader>

        {isLoading ? (
          <TableSkeleton />
        ) : waitingShown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={query ? "No purchase matches your search" : "All caught up"}>
            {query ? "Try a different PO number, supplier or component." : "Purchases show up here once the purchase manager sends them to IQC."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Purchased by</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitingShown.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.po_number}</TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.totals.lines} item{p.totals.lines === 1 ? "" : "s"} · {fmtQty(p.totals.ordered)} pcs ordered
                    </TableCell>
                    <TableCell><UserCell name={p.created_by_name} sub={fmtDateTime(p.created_at)} /></TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Button size="sm" onClick={() => setInspecting(p.id)}>Inspect</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setViewing(p)}>View</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Inspected</CardTitle>
            <CardDescription>What happened to each purchase after the check.</CardDescription>
          </div>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : inspectedShown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing inspected yet">Inspected purchases and their result appear here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Rejected lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inspected by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspectedShown.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.po_number}</TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(p.totals.received)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtQty(p.totals.approved)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${rejectedLines(p).length > 0 ? "font-semibold text-destructive" : ""}`}>
                      {rejectedLines(p).length} of {p.totals.lines}
                    </TableCell>
                    <TableCell><PurchaseStatus value={p.status} /></TableCell>
                    <TableCell><UserCell name={p.iqc_by_name} sub={fmtDateTime(p.iqc_at)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {rejectedLines(p).length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => downloadRejected(p)}><Download /> Rejected (Excel)</Button>
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

      {toInspect && <InspectModal key={toInspect.id} purchase={toInspect} onClose={() => setInspecting(null)} />}
      <PurchaseDetailModal purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </>
  )
}
