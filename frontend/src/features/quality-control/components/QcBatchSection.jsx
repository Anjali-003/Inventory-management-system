import { useNavigate } from "react-router-dom"
import { AlertTriangle, CheckCircle2, PackageCheck, RefreshCw, XCircle } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MktBtn } from "@/features/marketing-orders/mktKit"
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
      <p className="break-words font-semibold tabular-nums">{item.orderNumber || `Production #${item.productionId || item.id}`}</p>
      <p className="mt-1 break-words text-sm text-foreground">{item.productName || "Product unavailable"}</p>
      <p className="break-words text-xs text-muted-foreground">{item.productSku || "SKU unavailable"}</p>
    </div>
  )
}

function DecisionActions({ item, onDecide, editable }) {
  if (!editable) return <span className="text-xs text-muted-foreground">View only</span>
  return (
    <div className="flex flex-wrap gap-2 xl:justify-end">
      <MktBtn size="sm" variant="primary" onClick={() => onDecide(item, "PASS")}><CheckCircle2 className="size-4" /> Pass</MktBtn>
      <MktBtn size="sm" variant="danger" onClick={() => onDecide(item, "FAIL")}><XCircle className="size-4" /> Fail</MktBtn>
    </div>
  )
}

function Remarks({ title, value, tone = "neutral" }) {
  if (!value) return null
  const toneClass = tone === "danger"
    ? "border-destructive/20 bg-cf-red-soft"
    : tone === "success"
      ? "border-primary/20 bg-cf-green-soft"
      : "border-border bg-muted/30"
  return (
    <div className={`mt-2 min-w-0 rounded-lg border p-2.5 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
    </div>
  )
}

function BatchCard({ item, kind, onDecide, editable, navigate }) {
  const history = kind === "history"
  const retest = !history && (item.reworkStatus === "READY_FOR_QC" || Number(item.attemptNumber || 1) > 1)
  return (
    <article className={`min-w-0 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] ${retest ? "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white ring-1 ring-amber-200" : "border-[#dce5e0] bg-white"}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><BatchIdentity item={item} /></div>
        {history ? <ResultBadge decision={item.batchDecision} /> : retest && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-amber-900"><RefreshCw className="size-3.5" aria-hidden /> Retest · Attempt {item.attemptNumber || 2}</span>}
      </div>
      {retest && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-100/70 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-950"><RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden /><span>This batch has been repaired and returned for another QC decision. Review both notes below before deciding.</span></div>}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Batch completed</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ordered</p><p className="mt-1 text-lg font-semibold tabular-nums">{Number(item.orderedQuantity || 0).toLocaleString()}</p></div>
      </div>
      {history ? (
        <>
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Attempt {item.attemptNumber || 1} · {dateLabel(item.decisionAt)}</p>
              {item.decisionByName && <UserCell className="mt-1" name={item.decisionByName} sub="QC decision by" />}
            </div>
            {item.batchDecision === "PASS"
              ? <MktBtn size="sm" variant="outline" onClick={() => navigate("/finished-goods")}><PackageCheck className="size-4" /> Finished Goods</MktBtn>
              : <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="size-3.5" /> Held from Finished Goods</span>}
          </div>
          <Remarks title="QC failure remark" value={item.decisionRemarks || (item.batchDecision === "FAIL" ? "No remark recorded for this legacy failure." : "")} tone="danger" />
          {item.reworkRemarks && <Remarks title="Production rework notes" value={item.reworkRemarks} tone="success" />}
        </>
      ) : (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {item.attemptNumber > 1 ? `Retest attempt ${item.attemptNumber}` : "Entire batch completed"}
            {item.reworkStatus === "READY_FOR_QC" ? " · Rework submitted" : ` · Completed ${dateLabel(item.completedAt)}`}
          </p>
          {(item.latestDecision === "FAIL" || retest) && <>
            <Remarks title="Previous QC failure" value={item.decisionRemarks || "No failure reason recorded."} tone="danger" />
            {retest && <Remarks title="Repair notes" value={item.reworkRemarks || "No repair notes recorded."} tone="success" />}
          </>}
          <div className="mt-3 flex flex-wrap justify-end gap-2"><DecisionActions item={item} onDecide={onDecide} editable={editable} /></div>
        </div>
      )}
    </article>
  )
}

export default function QcBatchSection({ title, description, icon: Icon, kind, items = [], loading, query, editable, onDecide, view = "table" }) {
  const navigate = useNavigate()
  const history = kind === "history"
  const emptyTitle = query
    ? "No matching batches"
    : history ? "No previous QC decisions" : "No batches waiting for QC"
  const emptyDescription = query
    ? "Try a different order number, product name or SKU."
    : history ? "Each Pass/Fail decision and its rework notes will be retained here." : "A batch appears here only after all ordered units are complete or rework has been submitted for retest."

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="size-5" /></span>
          <div className="min-w-0"><CardTitle className="text-lg font-extrabold leading-tight text-slate-950 sm:text-2xl">{title}</CardTitle><CardDescription className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-700">{description}</CardDescription></div>
        </div>
        <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{loading ? "Loading…" : `${items.length} ${history ? "attempt" : "batch"}${items.length === 1 ? "" : "es"}`}</span>
      </CardHeader>

      {loading ? <div className="p-3"><TableSkeleton rows={3} /></div> : items.length === 0 ? (
        <EmptyState icon={history ? CheckCircle2 : Icon} title={emptyTitle}>{emptyDescription}</EmptyState>
      ) : (
        <>
          <div className={`hidden min-w-0 overflow-hidden ${view === "table" ? "xl:block" : "xl:hidden"}`}>
            <Table className="w-full table-fixed">
              <TableHeader><TableRow>
                <TableHead className="w-[20%]">Order / Product</TableHead>
                <TableHead className="w-[11%]">Completed / Ordered</TableHead>
                {history && <TableHead className="w-[9%]">Result</TableHead>}
                <TableHead className={history ? "w-[9%]" : "w-[13%]"}>{history ? "Attempt" : "Production completed"}</TableHead>
                <TableHead className={history ? "w-[29%]" : "w-[27%]"}>{history ? "QC and rework remarks" : "Previous issue / next decision"}</TableHead>
                <TableHead className={history ? "w-[22%]" : "w-[29%] text-right"}>{history ? "Decision / Outcome" : "Final decision"}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{items.map((item) => {
                const retest = !history && (item.reworkStatus === "READY_FOR_QC" || Number(item.attemptNumber || 1) > 1)
                return (
                <TableRow key={item.id} className={retest ? "bg-amber-50/80 [&>td]:border-amber-100" : undefined}>
                  <TableCell className="min-w-0 whitespace-normal align-top"><BatchIdentity item={item} /></TableCell>
                  <TableCell className="whitespace-normal align-top"><p className="font-semibold tabular-nums">{Number(item.quantityCompleted || 0).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">of {Number(item.orderedQuantity || 0).toLocaleString()}</p></TableCell>
                  {history && <TableCell className="whitespace-normal align-top"><ResultBadge decision={item.batchDecision} /></TableCell>}
                  <TableCell className="whitespace-normal align-top text-sm">
                    {history ? <><p>Attempt {item.attemptNumber || 1}</p><p className="mt-1 break-words text-xs text-muted-foreground">{dateLabel(item.decisionAt)}</p>{item.decisionByName && <UserCell className="mt-1" name={item.decisionByName} sub="QC by" />}</> : <>{retest && <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900"><RefreshCw className="size-3" aria-hidden /> Retest · Attempt {item.attemptNumber || 2}</span>}<p className="break-words">{retest ? `Retest ${item.attemptNumber || 2}` : dateLabel(item.completedAt)}</p><p className="mt-1 text-xs text-muted-foreground">Full batch completed</p></>}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    {history ? <>
                      <Remarks title="QC remark" value={item.decisionRemarks || (item.batchDecision === "FAIL" ? "No remark recorded (legacy decision)." : "No remark recorded.")} tone={item.batchDecision === "FAIL" ? "danger" : "neutral"} />
                      {item.reworkRemarks && <Remarks title="Rework notes" value={item.reworkRemarks} tone="success" />}
                    </> : <>
                      {(item.latestDecision === "FAIL" || retest) ? <>
                        <Remarks title="Previous QC failure" value={item.decisionRemarks || "No failure reason recorded."} tone="danger" />
                        {retest && <Remarks title="Repair notes" value={item.reworkRemarks || "No repair notes recorded."} tone="success" />}
                      </> : <span className="text-xs text-muted-foreground">Ready for final batch decision.</span>}
                    </>}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    {history
                      ? item.batchDecision === "PASS"
                        ? <div className="space-y-2"><Badge variant="success">Released</Badge><MktBtn size="sm" variant="outline" onClick={() => navigate("/finished-goods")}><PackageCheck className="size-4" /> Finished Goods</MktBtn></div>
                        : <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive"><XCircle className="size-4" /> Held from release</span>
                      : <DecisionActions item={item} onDecide={onDecide} editable={editable} />}
                  </TableCell>
                </TableRow>
              )})}</TableBody>
            </Table>
          </div>
          <div className={`grid min-w-0 gap-3 p-3 ${view === "table" ? "xl:hidden" : "xl:grid"}`}>
            {items.map((item) => <BatchCard key={item.id} item={item} kind={kind} onDecide={onDecide} editable={editable} navigate={navigate} />)}
          </div>
        </>
      )}
    </Card>
  )
}
