import { useState } from "react"
import { CheckCircle2, PackageCheck, RefreshCw, Truck } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import UserCell from "@/components/UserCell"
import { ConfirmDialog } from "@/components/Modal"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { StatCard } from "@/components/HistoryUI"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { useAcceptPurchaseMutation, useGetIncomingStockQuery } from "@/features/purchasing/purchasingApi"
import { PurchaseDetailModal } from "@/features/purchasing/PurchaseParts"
import { qtyWithUnit } from "@/features/purchasing/purchasingUtils"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"

const EMPTY = []

/*
  Store manager: purchases that IQC has approved. Accepting is the step that puts the approved quantity
  into inventory. There is no "reject" here on purpose: IQC has already decided what is good.
*/
export default function IncomingStock() {
  const toast = useToast()
  const { canEdit } = usePermissions()
  const editable = canEdit("incomingStock")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetIncomingStockQuery()
  const [accept, { isLoading: accepting }] = useAcceptPurchaseMutation()
  const [confirming, setConfirming] = useState(null)
  const [acceptError, setAcceptError] = useState("")
  const [viewing, setViewing] = useState(null)

  const waiting = data.filter((p) => p.status === "PENDING_STORE")
  const done = data.filter((p) => p.status === "STORED")
  const piecesWaiting = waiting.reduce((s, p) => s + p.totals.approved, 0)

  const confirmAccept = async () => {
    setAcceptError("")
    try {
      await accept(confirming.id).unwrap()
      toast.success(`${confirming.po_number} accepted and added to inventory`)
      setConfirming(null)
    } catch (err) {
      setAcceptError(errorMessage(err, "Could not accept this purchase."))
    }
  }

  return (
    <>
      <PageHeader title="Incoming Stock" description="Components approved by IQC. Accept them to add them to inventory.">
        <Button variant="outline" onClick={refetch} disabled={isFetching}><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">Could not load incoming stock. Check that the server is running.</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} icon={Truck} tone={waiting.length ? "amber" : "green"} label="Waiting for you" value={waiting.length} loading={isLoading} detail="IQC approved, not accepted yet" />
        <StatCard index={1} icon={PackageCheck} tone="blue" label="Pieces to receive" value={piecesWaiting} loading={isLoading} detail="Approved quantity in those purchases" />
        <StatCard index={2} icon={CheckCircle2} tone="green" label="Accepted" value={done.length} loading={isLoading} detail="Already in inventory" />
      </div>

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <Card><TableSkeleton rows={3} /></Card>
        ) : waiting.length === 0 ? (
          <Card><EmptyState icon={Truck} title="Nothing to accept">Purchases appear here after the IQC manager approves them.</EmptyState></Card>
        ) : (
          waiting.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>{p.po_number} · {p.supplier}</CardTitle>
                  <CardDescription>
                    Approved by {p.iqc_by_name || "IQC"} on {fmtDateTime(p.iqc_at)}
                    {p.iqc_remarks ? ` · "${p.iqc_remarks}"` : ""}
                  </CardDescription>
                </div>
                {editable && <Button onClick={() => { setAcceptError(""); setConfirming(p) }}><CheckCircle2 /> Accept into stock</Button>}
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">You will receive</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.items.filter((i) => Number(i.quantity_approved) > 0).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <p className="font-medium">{i.name}</p>
                          <p className="text-xs text-muted-foreground">{i.sku}{i.remarks ? ` · ${i.remarks}` : ""}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{qtyWithUnit(i.quantity_ordered, i.unit)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{qtyWithUnit(i.quantity_approved, i.unit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ))
        )}

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Accepted</CardTitle>
              <CardDescription>Purchases already added to inventory.</CardDescription>
            </div>
          </CardHeader>
          {isLoading ? (
            <TableSkeleton rows={3} />
          ) : done.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing accepted yet">Accepted purchases are listed here.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Added to stock</TableHead>
                    <TableHead>Accepted by</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {done.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">{p.po_number}</TableCell>
                      <TableCell>{p.supplier}</TableCell>
                      <TableCell className="text-right tabular-nums"><Badge variant="success">{fmtQty(p.totals.approved)}</Badge></TableCell>
                      <TableCell><UserCell name={p.accepted_by_name} sub={fmtDateTime(p.accepted_at)} /></TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setViewing(p)}>Details</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirming}
        onClose={() => !accepting && setConfirming(null)}
        onConfirm={confirmAccept}
        busy={accepting}
        title={confirming ? `Accept ${confirming.po_number} into stock?` : "Accept"}
        confirmLabel="Accept into stock"
      >
        {confirming && (
          <>
            <p>
              IQC has approved this purchase. Accepting adds {fmtQty(confirming.totals.approved)} pieces
              ({confirming.items.filter((i) => Number(i.quantity_approved) > 0).length} components) to inventory.
            </p>
            {acceptError && <p className="font-medium text-destructive">{acceptError}</p>}
          </>
        )}
      </ConfirmDialog>

      <PurchaseDetailModal purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </>
  )
}
