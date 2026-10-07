import { useCallback, useEffect, useState } from "react"
import { Scale } from "lucide-react"
import api from "../../api/api"
import ErrorBanner from "../ErrorBanner"
import { TableSkeleton } from "../feedback"
import { Card } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { cn } from "../../lib/utils"
import { errorMessage, fmtDateTime, fmtQty } from "../../lib/stock"

/*
    Balance sheet:  received - components used = expected remaining,
    compared with what is actually on hand. Figures come from GET /inventory/history/balance;
    nothing is calculated in the browser.
*/

function Row({ label, value, sign, strong }) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-3", strong && "bg-muted/40")}>
      <span className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>
        {sign && <span className="mr-2 inline-block w-3 text-center tabular-nums">{sign}</span>}
        {label}
      </span>
      <span className={cn("tabular-nums", strong ? "text-xl font-semibold" : "text-base font-medium")}>{value}</span>
    </div>
  )
}

/*
    Shown only when actual < expected: where the missing components went, grouped by reason
    (same reasons as Stock out) and then component by component with quantity and worker.
*/
function ShortfallDetail({ data }) {
  const sf = data.shortfall
  const missing = Math.abs(Number(data.difference))
  const unexplained = Number(sf.unexplained)
  const inProduction = Number(sf.in_production)

  return (
    <div className="mt-5 space-y-4">
      <Card className="divide-y overflow-hidden">
        <div className="px-5 py-3.5">
          <p className="text-sm font-semibold">Where did the missing {fmtQty(missing)} go?</p>
          <p className="text-xs text-muted-foreground">Taken from stock-outs and count adjustments, by reason.</p>
        </div>

        {inProduction !== 0 && (
          <Row label="Taken for production, not in finished products yet" value={fmtQty(inProduction)} />
        )}
        {sf.by_reason.map((g) => (
          <Row key={g.code} label={`${g.label} · ${g.movements} ${g.movements === 1 ? "entry" : "entries"}`} value={fmtQty(g.quantity)} />
        ))}
        <div className="flex items-center justify-between bg-muted/40 px-5 py-3.5">
          <span className="text-sm font-semibold">Still unexplained</span>
          <span className={cn("text-xl font-semibold tabular-nums", unexplained === 0 ? "text-success" : "text-destructive")}>
            {fmtQty(unexplained)}
          </span>
        </div>
      </Card>

      {sf.movements.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-3.5">
            <p className="text-sm font-semibold">Component-wise detail</p>
            <p className="text-xs text-muted-foreground">Latest {sf.movements.length} entries. Reasons come from Stock out.</p>
          </div>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="hidden lg:table-cell">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sf.movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmtDateTime(m.created_at)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{m.component_name}</span>
                      <span className="text-xs text-muted-foreground">{m.sku}</span>
                    </TableCell>
                    <TableCell>{m.reason_label}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", Number(m.quantity) < 0 && "text-success")}>
                      {fmtQty(m.quantity)} <span className="text-xs text-muted-foreground">{m.unit}</span>
                    </TableCell>
                    <TableCell>
                      {m.worker_name ? (
                        <>
                          <span className="block">{m.worker_name}</span>
                          {m.recorded_by && <span className="text-xs text-muted-foreground">entered by {m.recorded_by}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{m.recorded_by ? `entered by ${m.recorded_by}` : "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell" title={m.reason || ""}>
                      {m.reason || "—"}{m.reference_no ? ` · ${m.reference_no}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}

export default function BalanceSheetCard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    setError("")
    return api
      .get("/inventory/history/balance")
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, "Could not load the balance sheet.")))
  }, [])

  useEffect(() => { load() }, [load])

  const diff = data ? Number(data.difference) : 0
  const status =
    diff === 0
      ? { text: "Matches expected", cls: "text-success" }
      : diff < 0
        ? { text: "Short of expected", cls: "text-destructive" }
        : { text: "More than expected", cls: "text-warning" }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Scale className="size-4" /> Balance sheet
      </h2>

      {error && <ErrorBanner title="Couldn't load balance sheet" onRetry={load}>{error}</ErrorBanner>}
      {!error && !data && <Card><TableSkeleton rows={4} /></Card>}

      {!error && data && (
        <>
        <Card className="divide-y overflow-hidden">
          <Row label="Total received (cumulative)" value={fmtQty(data.received_total)} />
          <Row label="Components used by finished products" value={fmtQty(data.components_used)} sign="−" />
          <Row label="Expected remaining" value={fmtQty(data.expected_remaining)} sign="=" strong />
          <Row label="Actual on hand (inventory)" value={fmtQty(data.actual_on_hand)} />
          <div className="flex items-center justify-between bg-muted/40 px-5 py-3.5">
            <span className="text-sm font-semibold">Difference (actual − expected)</span>
            <span className="text-right">
              <span className={cn("block text-xl font-semibold tabular-nums", status.cls)}>
                {diff > 0 ? "+" : ""}{fmtQty(data.difference)}
              </span>
              <span className={cn("text-xs", status.cls)}>{status.text}</span>
            </span>
          </div>
        </Card>
        {diff < 0 && <ShortfallDetail data={data} />}
        </>
      )}
    </section>
  )
}
