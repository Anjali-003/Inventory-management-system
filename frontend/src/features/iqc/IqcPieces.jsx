import { useMemo, useState } from "react"
import { CheckCircle2, Download, XCircle } from "lucide-react"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WAS_INSPECTED, badQty, downloadInspectedLines, goodQty } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  The IQC history in pieces: every inspected component line, newest first, in two lists.
    Accepted  the pieces that passed and went to the store
    Rejected  the pieces that failed and stayed with IQC (with the reason)
  Each list downloads as an Excel file.
*/
const KINDS = {
  good: { label: "Accepted pieces", icon: CheckCircle2, qty: goodQty, tone: "text-success", file: "iqc-accepted-pieces.xlsx", empty: "Nothing accepted yet" },
  bad: { label: "Rejected pieces", icon: XCircle, qty: badQty, tone: "text-destructive", file: "iqc-rejected-pieces.xlsx", empty: "Nothing rejected so far" },
}

const matches = (p, query) => {
  const q = query.trim().toLowerCase()
  return !q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
    p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
}

export default function IqcPieces({ purchases, loading, query = "" }) {
  const [kind, setKind] = useState("good")

  // one entry per inspected line; a line can be in both lists (some good, some bad)
  const entries = useMemo(
    () =>
      purchases
        .filter((p) => WAS_INSPECTED(p.status) && matches(p, query))
        .sort((a, b) => String(b.iqc_at || "").localeCompare(String(a.iqc_at || "")))
        .flatMap((purchase) => purchase.items.filter((item) => item.iqc_decision).map((item) => ({ purchase, item }))),
    [purchases, query]
  )
  const lists = useMemo(
    () => ({
      good: entries.filter((e) => goodQty(e.item) > 0),
      bad: entries.filter((e) => badQty(e.item) > 0),
    }),
    [entries]
  )
  const totals = {
    good: lists.good.reduce((s, e) => s + goodQty(e.item), 0),
    bad: lists.bad.reduce((s, e) => s + badQty(e.item), 0),
  }
  const k = KINDS[kind]
  const shown = lists[kind]

  return (
    <Card id="iqc-pieces" className="mt-4 scroll-mt-4 overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Pieces history</CardTitle>
          <CardDescription>Every inspected component: how many pieces were accepted and how many rejected.</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={shown.length === 0} onClick={() => downloadInspectedLines(k.file, k.label, shown)}>
          <Download /> {k.label} (Excel)
        </Button>
      </CardHeader>

      <div role="tablist" aria-label="Pieces history" className="grid grid-cols-2 gap-px border-y bg-border">
        {Object.entries(KINDS).map(([key, v]) => {
          const active = key === kind
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKind(key)}
              className={cn(
                "flex items-center justify-center gap-2 bg-card px-4 py-3 text-sm outline-none transition-colors focus-visible:bg-muted",
                active ? "font-semibold shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              <v.icon className={cn("size-4", v.tone)} aria-hidden />
              {v.label}
              <span className={cn("tabular-nums font-bold", v.tone)}>{fmtQty(totals[key])}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <TableSkeleton rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState icon={k.icon} title={k.empty}>Inspected purchases show up here.</EmptyState>
      ) : (
        <div role="tabpanel" className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">{kind === "good" ? "Accepted" : "Rejected"}</TableHead>
                {kind === "bad" && <TableHead>Reason</TableHead>}
                <TableHead>Inspected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ purchase: p, item: it }) => (
                <TableRow key={`${p.id}-${it.id}`}>
                  <TableCell>
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.sku}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium tabular-nums">{p.po_number}</p>
                    <p className="text-xs text-muted-foreground">{p.supplier}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(it.quantity_received)} {it.unit}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", k.tone)}>{fmtQty(k.qty(it))} {it.unit}</TableCell>
                  {kind === "bad" && <TableCell className="max-w-64 text-sm">{it.remarks || p.iqc_remarks || <span className="text-muted-foreground">-</span>}</TableCell>}
                  <TableCell className="whitespace-nowrap text-sm">
                    {fmtDateTime(p.iqc_at)}
                    {p.iqc_by_name && <span className="block text-xs text-muted-foreground">{p.iqc_by_name}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
