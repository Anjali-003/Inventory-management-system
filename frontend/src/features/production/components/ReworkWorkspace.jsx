import { useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock3, Wrench } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback"

const STAGES = [
  { key: "failed", label: "QC failed", description: "Review the defect and start correction." },
  { key: "working", label: "Rework in progress", description: "Continue the correction and record what was fixed." },
  { key: "ready", label: "Ready for QC", description: "Submitted batches are waiting for QC to retest." },
]

function formatWhen(value) {
  if (!value) return "Not recorded"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function StageBadge({ status }) {
  if (status === "NEEDS_REWORK") return <Badge variant="danger">Needs rework</Badge>
  if (status === "IN_PROGRESS") return <Badge variant="warning">Rework in progress</Badge>
  if (status === "READY_FOR_QC") return <Badge variant="info">Ready for QC retest</Badge>
  return <Badge variant="neutral">{status || "Unknown"}</Badge>
}

function ReworkCard({ item, editable, busy, onStart, onSubmit }) {
  const status = item.rework_status
  const failedAttempt = Number(item.rework_attempt_number || item.qc_attempt_number || 1)
  const attemptLabel = status === "READY_FOR_QC" ? `Retest attempt ${failedAttempt + 1}` : `QC attempt ${failedAttempt}`
  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold tabular-nums">{item.order_number || `Production #${item.id}`}</p>
          <p className="mt-1 break-words text-sm text-foreground">{item.product_name || "Product unavailable"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{Number(item.quantity_completed || 0).toLocaleString()} / {Number(item.ordered_quantity || 0).toLocaleString()} units completed · {attemptLabel}</p>
        </div>
        <StageBadge status={status} />
      </div>

      <div className="mt-4 rounded-lg border border-destructive/20 bg-cf-red-soft p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive">
          <AlertTriangle className="size-3.5" /> Original QC failure
        </div>
        <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed">{item.qc_remarks || "No remark recorded for this legacy failure. Inspect the batch carefully before rework."}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">Failed {formatWhen(item.qc_decided_at)}</p>
      </div>

      {status !== "NEEDS_REWORK" && (
        <div className="mt-3 rounded-lg border bg-muted/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rework notes</p>
          {item.rework_remarks
            ? <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed">{item.rework_remarks}</p>
            : <p className="mt-1 text-sm text-muted-foreground">No repair notes recorded yet.</p>}
          {status === "IN_PROGRESS" && <p className="mt-2 text-xs text-muted-foreground">Started {formatWhen(item.rework_started_at)}{item.rework_started_by_name ? ` by ${item.rework_started_by_name}` : ""}</p>}
          {status === "READY_FOR_QC" && <p className="mt-2 text-xs text-muted-foreground">Submitted {formatWhen(item.rework_submitted_at)}{item.rework_submitted_by_name ? ` by ${item.rework_submitted_by_name}` : ""}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ClipboardCheck className="size-3.5" /> Attempt {item.rework_attempt_number || 1}</span>
        {editable && status === "NEEDS_REWORK" && (
          <Button type="button" size="sm" onClick={() => onStart(item)} disabled={busy}><Wrench className="size-4" /> Start rework</Button>
        )}
        {editable && status === "IN_PROGRESS" && (
          <Button type="button" size="sm" onClick={() => onSubmit(item)} disabled={busy}>Record fix & submit <ArrowRight className="size-4" /></Button>
        )}
        {status === "READY_FOR_QC" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> QC team has the batch</span>}
      </div>
    </article>
  )
}

export default function ReworkWorkspace({ items = [], loading = false, editable = true, busy = false, onStartRework, onSubmitRework }) {
  const [stage, setStage] = useState("failed")
  const groups = useMemo(() => ({
    failed: items.filter((item) => item.rework_status === "NEEDS_REWORK"),
    working: items.filter((item) => item.rework_status === "IN_PROGRESS"),
    ready: items.filter((item) => item.rework_status === "READY_FOR_QC"),
  }), [items])
  const currentStage = STAGES.find((item) => item.key === stage) || STAGES[0]
  const currentItems = groups[stage] || []

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-destructive/5 via-background to-background">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cf-red-soft text-destructive"><Wrench className="size-5" /></span>
            <div className="min-w-0">
              <CardTitle>Quality recovery workspace</CardTitle>
              <CardDescription className="mt-1 max-w-3xl">Track failed batches from the original QC remark through repair and retest submission. QC approval is required before release.</CardDescription>
            </div>
          </div>
          <Badge variant="neutral">{groups.failed.length + groups.working.length + groups.ready.length} open task{groups.failed.length + groups.working.length + groups.ready.length === 1 ? "" : "s"}</Badge>
        </div>
      </CardHeader>

      <div className="grid min-w-0 gap-2 border-b p-3 sm:grid-cols-3 sm:p-4">
        {STAGES.map((item) => {
          const active = item.key === stage
          const value = groups[item.key]?.length || 0
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setStage(item.key)}
              className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${active ? "border-primary bg-cf-green-soft shadow-sm" : "bg-card hover:bg-muted/50"}`}
              aria-pressed={active}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{loading ? "—" : value}</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
            </button>
          )
        })}
      </div>

      <div className="p-3 sm:p-4">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">{currentStage.label}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{currentStage.description}</p>
          </div>
          <Badge variant={stage === "failed" ? "danger" : stage === "working" ? "warning" : "info"}>{loading ? "Loading…" : `${currentItems.length} batch${currentItems.length === 1 ? "" : "es"}`}</Badge>
        </div>

        {loading ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2"><div className="h-44 animate-pulse rounded-xl bg-muted" /><div className="h-44 animate-pulse rounded-xl bg-muted" /></div>
        ) : currentItems.length === 0 ? (
          <EmptyState icon={stage === "failed" ? AlertTriangle : stage === "working" ? Wrench : ClipboardCheck} title={stage === "failed" ? "No failed batches need rework" : stage === "working" ? "No rework is currently in progress" : "No batches waiting for QC retest"}>
            {stage === "failed" ? "A failed batch will appear here with its QC remark and a Start rework action." : stage === "working" ? "Start rework on a failed batch to track the correction here." : "After recording repair notes and submitting, the batch returns to the QC team's pending queue."}
          </EmptyState>
        ) : (
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {currentItems.map((item) => (
              <ReworkCard
                key={item.id}
                item={item}
                editable={editable}
                busy={busy}
                onStart={onStartRework}
                onSubmit={onSubmitRework}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
