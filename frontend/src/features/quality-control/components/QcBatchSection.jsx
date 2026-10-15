import { useNavigate } from "react-router-dom"
import { CheckCircle2, PackageCheck, XCircle } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, TableSkeleton } from "@/components/feedback"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UserCell from "@/components/UserCell"

function dateLabel(value) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function ResultBadge({ decision }) {
  return decision === "PASS"
    ? <Badge variant="success">Passed</Badge>
    : decision === "FAIL"
      ? <Badge variant="danger">Failed</Badge>
      : <Badge variant="warning">Pending decision</Badge>
}

function BatchIdentity({ item }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-semibold tabular-nums">{item.orderNumber || `Production #${item.id}`}</p>
      <p className="mt-1 break-words text-sm text-foreground">{item.productName || "Product unavailable"}</p>
      <p className="break-words text-xs text-muted-foreground">{item.productSku || "SKU unavailable"}</p>
    </div>
  )
}

function DecisionActions({ item, onDecide, editable }) {
  if (!editable) return <span className="text-xs text-muted-foreground">View only</span>
  return (
    <div className="flex flex-wrap gap-2 xl:justify-end">
      <Button size="sm" onClick={() => onDecide(item, "PASS")}><CheckCircle2 /> Pass</Button>
      <Button size="sm" variant="destructive" onClick={() => onDecide(item, "FAIL")}><XCircle /> Fail</Button>
    </div>
  )
}

function BatchCard({ item, kind, onDecide, editable, navigate }) {
  const history = kind === "history"
  return (
    <article className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><BatchIdentity item={item} /></div>
        {history && <ResultBadge decision={item.batchDecision} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Batch completed</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ordered</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.orderedQuantity || 0).toLocaleString()}</p></div>
      </div>
      {history ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Decision recorded {dateLabel(item.decisionAt)}</p>{item.decisionByName && <UserCell className="mt-1" name={item.decisionByName} sub="Decided by" />}</div>
          {item.batchDecision === "PASS" && <Button size="sm" variant="outline" onClick={() => navigate("/finished-goods")}><PackageCheck /> Finished Goods</Button>}
          {item.batchDecision === "FAIL" && <span className="text-xs font-medium text-destructive">Held from Finished Goods</span>}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3"><DecisionActions item={item} onDecide={onDecide} editable={editable} /></div>
      )}
    </article>
  )
}

export default function QcBatchSection({ title, description, icon: Icon, kind, items = [], loading, query, editable, onDecide }) {
  const navigate = useNavigate()
  const history = kind === "history"
  const emptyTitle = query
    ? "No matching batches"
    : history ? "No previous QC decisions" : "No batches waiting for QC"
  const emptyDescription = query
    ? "Try a different order number, product name or SKU."
    : history ? "Batch decisions will be recorded here after Pass or Fail is confirmed." : "A batch appears here only after all ordered units have completed production."

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cf-green-soft text-primary"><Icon className="size-4" /></span>
          <div className="min-w-0"><CardTitle>{title}</CardTitle><CardDescription className="mt-1 max-w-3xl">{description}</CardDescription></div>
        </div>
        <Badge variant="neutral">{loading ? "Loading…" : `${items.length} batch${items.length === 1 ? "" : "es"}`}</Badge>
      </CardHeader>

      {loading ? <div className="p-3"><TableSkeleton rows={3} /></div> : items.length === 0 ? (
        <EmptyState icon={history ? CheckCircle2 : Icon} title={emptyTitle}>{emptyDescription}</EmptyState>
      ) : (
        <>
          <div className="hidden min-w-0 overflow-hidden xl:block">
            <Table className="w-full table-fixed">
              <TableHeader><TableRow>
                <TableHead className="w-[23%]">Order / Product</TableHead>
                <TableHead className="w-[13%]">Completed / Ordered</TableHead>
                {history && <TableHead className="w-[12%]">QC result</TableHead>}
                <TableHead className={history ? "w-[25%]" : "w-[33%]"}>{history ? "Decision recorded" : "Production completed"}</TableHead>
                <TableHead className={history ? "w-[27%] text-right" : "w-[31%] text-right"}>{history ? "Outcome" : "Final decision"}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-0 whitespace-normal align-top"><BatchIdentity item={item} /></TableCell>
                  <TableCell className="whitespace-normal align-top"><p className="font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">of {Number(item.orderedQuantity || 0).toLocaleString()} units</p></TableCell>
                  {history && <TableCell className="whitespace-normal align-top"><ResultBadge decision={item.batchDecision} /></TableCell>}
                  <TableCell className="whitespace-normal align-top">
                    {history ? <><p className="break-words text-sm">{dateLabel(item.decisionAt)}</p>{item.decisionByName && <UserCell className="mt-1" name={item.decisionByName} sub="Decided by" />}</> : <><p className="break-words text-sm">{dateLabel(item.completedAt)}</p><p className="mt-1 text-xs text-muted-foreground">Entire batch completed</p></>}
                  </TableCell>
                  <TableCell className="whitespace-normal text-right align-top">
                    {history
                      ? item.batchDecision === "PASS"
                        ? <Button size="sm" variant="outline" onClick={() => navigate("/finished-goods")}><PackageCheck /> Open Finished Goods</Button>
                        : <span className="text-sm font-medium text-destructive">Not released</span>
                      : <DecisionActions item={item} onDecide={onDecide} editable={editable} />}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <div className="grid min-w-0 gap-3 p-3 xl:hidden">
            {items.map((item) => <BatchCard key={item.id} item={item} kind={kind} onDecide={onDecide} editable={editable} navigate={navigate} />)}
          </div>
        </>
      )}
    </Card>
  )
}
