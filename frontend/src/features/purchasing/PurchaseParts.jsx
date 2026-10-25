import { fmtDueDate } from "./purchasingUtils"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UserCell from "@/components/UserCell"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { Download } from "lucide-react"
import { STATUS_META, WAS_INSPECTED, badLines, badQty, downloadRejected, goodQty, purchaseFor, qtyWithUnit } from "./purchasingUtils"

export function PurchaseStatus({ value }) {
  const m = STATUS_META[value] || { variant: "neutral", label: value || "Unknown" }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

/* The lines of one purchase. Received and the IQC decision stay "-" until IQC has inspected it. */
export function PurchaseLines({ items, inspected }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead className="text-right">Ordered</TableHead>
            <TableHead className="text-right">Received</TableHead>
            {inspected && <TableHead className="text-right">Accepted</TableHead>}
            {inspected && <TableHead className="text-right">Rejected</TableHead>}
            {inspected && <TableHead>IQC result</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => {
            const bad = badQty(it)
            return (
              <TableRow key={it.id}>
                <TableCell>
                  <p className="font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.sku}{it.remarks ? ` · ${it.remarks}` : ""}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{qtyWithUnit(it.quantity_ordered, it.unit)}</TableCell>
                <TableCell className="text-right tabular-nums">{inspected ? qtyWithUnit(it.quantity_received, it.unit) : "-"}</TableCell>
                {inspected && <TableCell className="text-right font-semibold tabular-nums text-success">{fmtQty(goodQty(it))}</TableCell>}
                {inspected && <TableCell className={cn("text-right tabular-nums", bad > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>{fmtQty(bad)}</TableCell>}
                {inspected && (
                  <TableCell>
                    {it.iqc_decision === "REJECTED" ? (
                      <Badge variant="danger">Rejected</Badge>
                    ) : bad > 0 ? (
                      <Badge variant="warning">Part rejected</Badge>
                    ) : (
                      <Badge variant="success">All accepted</Badge>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/* Read-only view of one purchase: who did what and when, plus its lines. */
export function PurchaseDetailModal({ purchase, onClose }) {
  if (!purchase) return null
  const inspected = WAS_INSPECTED(purchase.status)
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${purchase.po_number} · ${purchase.supplier}`}
      description={[purchaseFor(purchase) && `For ${purchaseFor(purchase)}`, purchase.notes].filter(Boolean).join(" · ") || undefined}
      footer={
        <>
          {badLines(purchase).length > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => downloadRejected(purchase)}>
              <Download /> Rejected pieces (Excel)
            </Button>
          )}
          <Button type="button" variant="outline" size="lg" onClick={onClose} data-autofocus>Close</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <PurchaseStatus value={purchase.status} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order placed</p>
            <UserCell name={purchase.created_by_name} sub={fmtDateTime(purchase.created_at)} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Received</p>
            {purchase.received_by_name ? <UserCell name={purchase.received_by_name} sub={fmtDateTime(purchase.received_at)} /> : <span className="text-sm text-muted-foreground">Not yet</span>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sent to IQC</p>
            {purchase.sent_to_iqc_by_name ? <UserCell name={purchase.sent_to_iqc_by_name} sub={fmtDateTime(purchase.sent_to_iqc_at)} /> : <span className="text-sm text-muted-foreground">Not yet</span>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inspected by IQC</p>
            {purchase.iqc_by_name ? <UserCell name={purchase.iqc_by_name} sub={fmtDateTime(purchase.iqc_at)} /> : <span className="text-sm text-muted-foreground">Not yet</span>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Accepted by store</p>
            {purchase.accepted_by_name ? <UserCell name={purchase.accepted_by_name} sub={fmtDateTime(purchase.accepted_at)} /> : <span className="text-sm text-muted-foreground">Not yet</span>}
          </div>
        </div>

        <PurchaseLines items={purchase.items} inspected={inspected} />

        {purchase.iqc_remarks && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-semibold">IQC remarks: </span>{purchase.iqc_remarks}</p>
        )}
      </div>
    </Modal>
  )
}


/* "Due 12 Nov" under the supplier, red "Late by 3 days" once the promised date has passed and the goods are not in */
export function DueLine({ purchase: p }) {
  if (!p?.expected_delivery_date) return null
  const late = Number(p.late_days) || 0
  const arrived = !!p.received_at
  return (
    <span className={`block text-xs ${late > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
      {late > 0
        ? arrived ? `Arrived ${late} day${late === 1 ? "" : "s"} late` : `Late by ${late} day${late === 1 ? "" : "s"}`
        : arrived ? "Arrived on time" : `Due ${fmtDueDate(p.expected_delivery_date)}`}
    </span>
  )
}
