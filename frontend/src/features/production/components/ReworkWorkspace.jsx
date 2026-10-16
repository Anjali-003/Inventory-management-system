import { useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock3, PackageCheck, Wrench } from "lucide-react"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { EmptyState } from "@/components/feedback"
import { cn } from "@/lib/utils"

const STAGES = [
  { key: "failed", status: "NEEDS_REWORK", label: "QC Failed", description: "Review the original QC failure, record the fix and submit the batch for retesting.", tone: "danger", icon: AlertTriangle },
  { key: "ready", status: "READY_FOR_QC", label: "Ready for QC", description: "These batches have been submitted and are waiting for a QC retest decision.", tone: "success", icon: ClipboardCheck },
]

function formatWhen(value) {
  if (!value) return "Not recorded"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function StageBadge({ status }) {
  const styles = {
    NEEDS_REWORK: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200",
    IN_PROGRESS: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    READY_FOR_QC: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  }
  const labels = {
    NEEDS_REWORK: "Needs rework",
    IN_PROGRESS: "Correction started",
    READY_FOR_QC: "Ready for QC retest",
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", styles[status] || "bg-slate-100 text-slate-700")}>
      <span className={cn("size-1.5 rounded-full", status === "NEEDS_REWORK" ? "bg-rose-600" : status === "IN_PROGRESS" ? "bg-amber-500" : "bg-emerald-600")} />
      {labels[status] || status || "Unknown"}
    </span>
  )
}

function ReworkCard({ item, editable, busy, onSubmit }) {
  const status = item.rework_status
  const failedAttempt = Number(item.rework_attempt_number || item.qc_attempt_number || 1)
  const attemptLabel = status === "READY_FOR_QC" ? `Retest attempt ${failedAttempt + 1}` : `QC attempt ${failedAttempt}`
  const canSubmit = editable && (status === "NEEDS_REWORK" || status === "IN_PROGRESS")

  return (
    <article className="relative min-w-0 overflow-hidden rounded-2xl border border-[#dce5e0] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-shadow hover:shadow-md">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b", status === "NEEDS_REWORK" ? "from-rose-500 to-red-700" : status === "IN_PROGRESS" ? "from-amber-400 to-orange-600" : "from-emerald-500 to-teal-700")} />
      <div className="min-w-0 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-slate-950 tabular-nums">{item.order_number || `Production #${item.id}`}</p>
            <p className="mt-1 break-words text-sm font-medium leading-snug text-slate-800">{item.product_name || "Product unavailable"}</p>
            {item.product_sku && <p className="mt-1 break-words text-xs text-slate-600">{item.product_sku}</p>}
            <p className="mt-2 text-xs text-slate-600">{Number(item.quantity_completed || 0).toLocaleString()} / {Number(item.ordered_quantity || 0).toLocaleString()} units completed · {attemptLabel}</p>
          </div>
          <StageBadge status={status} />
        </div>

        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.06em] text-rose-800">
            <AlertTriangle className="size-4" aria-hidden /> Original QC failure
          </div>
          <p className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{item.qc_remarks || "No remark recorded for this legacy failure. Inspect the batch carefully before rework."}</p>
          <p className="mt-2 text-[11px] text-slate-600">Failed {formatWhen(item.qc_decided_at)}</p>
        </div>

        {status !== "NEEDS_REWORK" && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-600">Correction notes</p>
            {item.rework_remarks
              ? <p className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{item.rework_remarks}</p>
              : <p className="mt-1.5 text-sm text-slate-600">No repair notes recorded yet.</p>}
            {status === "IN_PROGRESS" && <p className="mt-2 text-xs text-slate-600">Started {formatWhen(item.rework_started_at)}{item.rework_started_by_name ? ` by ${item.rework_started_by_name}` : ""}</p>}
            {status === "READY_FOR_QC" && <p className="mt-2 text-xs text-slate-600">Submitted {formatWhen(item.rework_submitted_at)}{item.rework_submitted_by_name ? ` by ${item.rework_submitted_by_name}` : ""}</p>}
          </div>
        )}

        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"><ClipboardCheck className="size-3.5" /> Attempt {item.rework_attempt_number || 1}</span>
          {canSubmit ? (
            <MktBtn type="button" variant="primary" size="md" className="w-full sm:w-auto" onClick={() => onSubmit(item)} disabled={busy}>
              <Wrench className="size-4" /> Record fix &amp; submit <ArrowRight className="size-4" />
            </MktBtn>
          ) : status === "READY_FOR_QC" ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><PackageCheck className="size-4" /> QC team has the batch</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock3 className="size-4" /> View only</span>
          )}
        </div>
      </div>
    </article>
  )
}

function StageSection({ stage, items, loading, editable, busy, onSubmit }) {
  const Icon = stage.icon

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", stage.tone === "danger" ? "bg-rose-100 text-rose-800" : stage.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-tight text-slate-950">{stage.label}</h3>
            <p className="mt-1 text-sm leading-snug text-slate-700">{stage.description}</p>
          </div>
        </div>
        <span className={cn("inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums", stage.tone === "danger" ? "bg-rose-100 text-rose-800" : stage.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
          {loading ? "…" : `${items.length} ${items.length === 1 ? "batch" : "batches"}`}
        </span>
      </header>

      {loading ? (
        <div className="grid min-w-0 gap-3 p-4 xl:grid-cols-2">
          <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Icon} title={stage.key === "failed" ? "No QC-failed batches" : "No batches waiting for QC retest"}>
          {stage.key === "failed"
            ? "Batches that fail QC appear here with the original failure remark. Record the correction and submit the batch for retesting."
            : "After the correction is submitted, the batch appears here while it waits for the QC team to make the next Pass/Fail decision."}
        </EmptyState>
      ) : (
        <div className="grid min-w-0 gap-3 p-3 sm:p-4 xl:grid-cols-2">
          {items.map((item) => <ReworkCard key={item.id} item={item} editable={editable} busy={busy} onSubmit={onSubmit} />)}
        </div>
      )}
    </section>
  )
}

export default function ReworkWorkspace({ items = [], loading = false, editable = true, busy = false, onSubmitRework }) {
  const [activeStage, setActiveStage] = useState("failed")
  const groups = useMemo(() => ({
    // Keep interrupted submissions visible so staff can retry without a hidden stage.
    failed: items.filter((item) => item.rework_status === "NEEDS_REWORK" || item.rework_status === "IN_PROGRESS"),
    ready: items.filter((item) => item.rework_status === "READY_FOR_QC"),
  }), [items])
  const openTasks = groups.failed.length + groups.ready.length
  const currentStage = STAGES.find((stage) => stage.key === activeStage) || STAGES[0]

  return (
    <div className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-[20px] border-2 border-slate-300 bg-white shadow-sm">
        <div className="relative flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-200 bg-gradient-to-r from-rose-50 via-white to-white px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-800"><Wrench className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-rose-800">QC recovery</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">QC Failed</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-700">Review the failure remark and submit the completed correction for QC retest. Only a QC PASS can release a batch to Finished Goods.</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
            <span className="size-2 rounded-full bg-rose-600" /> {loading ? "Loading tasks…" : `${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`}
          </span>
        </div>
        <div className="px-3 pt-3 sm:px-5 sm:pt-5">
          <div role="tablist" aria-label="QC failed views" className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
            {STAGES.map((stage) => {
              const Icon = stage.icon
              const selected = activeStage === stage.key
              const activeStyle = stage.key === "failed"
                ? "border-rose-700 bg-rose-700 text-white shadow-sm"
                : "border-emerald-700 bg-emerald-700 text-white shadow-sm"
              return (
                <button
                  key={stage.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveStage(stage.key)}
                  className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${selected ? activeStyle : "border-slate-200 bg-white text-slate-800 hover:bg-slate-100"}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="text-sm font-extrabold sm:text-base">{stage.label}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${selected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {loading ? "…" : groups[stage.key].length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="space-y-5 p-3 sm:p-5">
          <StageSection
            stage={currentStage}
            items={groups[currentStage.key]}
            loading={loading}
            editable={editable}
            busy={busy}
            onSubmit={onSubmitRework}
          />
        </div>
      </section>
    </div>
  )
}
