import { useMemo, useState } from "react"
import { AlertOctagon, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Filter, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import PurchaseDrawer from "@/features/purchase/PurchaseDrawer"
import { downloadRejected } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

export default function IqcRejectionsSection({ purchases = [] }) {
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [drawerTab, setDrawerTab] = useState("overview")
  const [query, setQuery] = useState("")

  // Extract all rejected lines from all purchases
  const rejectedItems = useMemo(() => {
    const list = []
    purchases.forEach((p) => {
      const rejLines = (p.items || []).filter((i) => i.iqc_decision === "REJECTED")
      if (rejLines.length > 0) {
        rejLines.forEach((item) => {
          list.push({
            id: `rej-${p.id}-${item.id}`,
            purchaseId: p.id,
            po_number: p.po_number,
            supplier: p.supplier,
            component_id: item.component_id,
            component_name: item.name,
            sku: item.sku,
            quantity: item.quantity_defective || item.quantity_received || item.quantity_ordered,
            unit: item.unit || "pcs",
            reason: item.remarks || p.iqc_remarks || "Inspection criteria failed",
            iqc_by: p.iqc_by_name || "IQC Inspector",
            iqc_at: p.iqc_at,
            purchase: p,
          })
        })
      } else if (p.status === "REJECTED") {
        list.push({
          id: `rej-lot-${p.id}`,
          purchaseId: p.id,
          po_number: p.po_number,
          supplier: p.supplier,
          component_name: "Entire Lot / Shipment",
          sku: "-",
          quantity: p.items?.reduce((sum, it) => sum + Number(it.quantity_ordered || 0), 0) || 0,
          unit: "items",
          reason: p.iqc_remarks || "Entire shipment rejected at receiving",
          iqc_by: p.iqc_by_name || "IQC Inspector",
          iqc_at: p.iqc_at,
          purchase: p,
        })
      }
    })
    return list.sort((a, b) => new Date(b.iqc_at || 0) - new Date(a.iqc_at || 0))
  }, [purchases])

  const filtered = useMemo(() => {
    if (!query.trim()) return rejectedItems
    const q = query.trim().toLowerCase()
    return rejectedItems.filter(
      (r) =>
        r.po_number?.toLowerCase().includes(q) ||
        r.supplier?.toLowerCase().includes(q) ||
        r.component_name?.toLowerCase().includes(q) ||
        r.sku?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
    )
  }, [rejectedItems, query])

  if (rejectedItems.length === 0) {
    return (
      <Card className="mt-6 border-emerald-500/20 bg-emerald-50/20">
        <div className="p-6 text-center">
          <div className="inline-flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
            <CheckCircle2 className="size-5" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Discarded / Rejected Components</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            All supplier purchases have passed IQC testing or no rejections recorded.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mt-6 overflow-hidden border-rose-200 dark:border-rose-900/40">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-rose-50/40 dark:bg-rose-950/10 border-b border-rose-100 dark:border-rose-900/30">
        <div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="size-5 text-rose-600 shrink-0" />
            <CardTitle className="text-lg font-bold text-rose-950 dark:text-rose-200">
              IQC Rejected / Discarded Components
            </CardTitle>
            <Badge variant="danger" className="font-semibold">
              {rejectedItems.length} {rejectedItems.length === 1 ? "rejection" : "rejections"}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            Supplier goods rejected during quality inspection. Follow up with vendor for replacement, credit note, or return.
          </CardDescription>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search supplier, PO, component..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-card pl-8 pr-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </CardHeader>

      <div className="hidden md:block">
        <Table data-cards="off">
          <TableHeader>
            <TableRow>
              <TableHead>PO & Supplier</TableHead>
              <TableHead>Rejected Component</TableHead>
              <TableHead>Rejected Qty</TableHead>
              <TableHead>IQC Rejection Remarks (Reason)</TableHead>
              <TableHead>Inspected At</TableHead>
              <TableHead className="text-end">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow
                key={item.id}
                onClick={() => setSelectedPurchase(item.purchase)}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <TableCell className="font-semibold">
                  <p className="font-bold text-primary">{item.po_number}</p>
                  <p className="text-xs text-muted-foreground font-normal">{item.supplier}</p>
                </TableCell>

                <TableCell className="min-w-44 whitespace-normal">
                  <p className="text-xs font-bold leading-tight text-foreground">{item.component_name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{item.sku}</p>
                </TableCell>

                <TableCell>
                  <span className="inline-flex items-center rounded-md bg-rose-100 text-rose-900 px-2 py-0.5 text-xs font-bold tabular-nums">
                    {fmtQty(item.quantity)} {item.unit}
                  </span>
                </TableCell>

                <TableCell className="min-w-56 whitespace-normal">
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 text-xs text-rose-900 dark:text-rose-200">
                    <span className="font-semibold">Reason:</span> {item.reason}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Inspected by {item.iqc_by}</p>
                </TableCell>

                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {item.iqc_at ? fmtDateTime(item.iqc_at) : "-"}
                </TableCell>

                <TableCell className="text-end space-x-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadRejected(item.purchase)
                    }}
                    title="Download rejection spreadsheet"
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted transition-colors"
                  >
                    <Download className="size-3" /> Slip
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedPurchase(item.purchase)
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted/80 transition-colors"
                  >
                    View PO
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile view */}
      <div className="divide-y md:hidden">
        {filtered.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedPurchase(item.purchase)}
            className="p-4 space-y-2 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-primary">{item.po_number}</p>
                <p className="text-xs text-muted-foreground">{item.supplier}</p>
              </div>
              <span className="rounded-md bg-rose-100 text-rose-900 px-2 py-0.5 text-xs font-bold tabular-nums">
                {fmtQty(item.quantity)} {item.unit} rejected
              </span>
            </div>

            <p className="text-xs font-medium text-foreground">{item.component_name} ({item.sku})</p>

            <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-900">
              <span className="font-semibold">Reason:</span> {item.reason}
            </div>

            <div className="flex justify-between items-center pt-1 text-xs text-muted-foreground">
              <span>{item.iqc_at ? fmtDateTime(item.iqc_at) : ""}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  downloadRejected(item.purchase)
                }}
                className="text-primary font-semibold hover:underline"
              >
                Download Rejection Slip
              </button>
            </div>
          </div>
        ))}
      </div>

      <PurchaseDrawer
        purchase={selectedPurchase}
        tab={drawerTab}
        onTab={setDrawerTab}
        onClose={() => { setSelectedPurchase(null); setDrawerTab("overview") }}
      />
    </Card>
  )
}
