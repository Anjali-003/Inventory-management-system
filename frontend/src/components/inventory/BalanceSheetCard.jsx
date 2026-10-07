import { useCallback, useEffect, useState } from "react"
import { PackageSearch, X } from "lucide-react"
import api from "../../api/api"
import ErrorBanner from "../ErrorBanner"
import { EmptyState } from "../feedback"
import { Initials, Panel, PanelSkeleton, Pill, reasonTone } from "./HistoryUI"
import { cn } from "../../lib/utils"
import { errorMessage, fmtDateTime, fmtQty } from "../../lib/stock"

/*
    Balance sheet:  received - components used = expected remaining, compared with what is actually on hand.
    When stock is short, the second half explains where it went: grouped by reason (the same reasons as Stock out),
    then entry by entry with quantity and worker.
    Figures come from GET /inventory/history/balance; nothing is calculated in the browser.
*/

const th = "whitespace-nowrap px-6 py-3 text-xs font-medium text-muted-foreground"
const BAR = {
  danger: "bg-destructive",
  info: "bg-primary",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/45",
  success: "bg-success",
}
const TEXT = { success: "text-success", danger: "text-destructive", warning: "text-warning" }

function Line({ label, value, op, strong }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-6", strong ? "border-t bg-muted/50 py-4" : "py-3.5")}>
      <p className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>
        {op && <span className="mr-2 inline-block w-3 text-center tabular-nums">{op}</span>}
        {label}
      </p>
      <p className={cn("tabular-nums", strong ? "text-lg font-semibold" : "text-base font-medium")}>{value}</p>
    </div>
  )
}

function status(diff, missing) {
  if (diff === 0) return { tone: "success", pill: "Balanced", text: "Stock on hand matches the records." }
  if (diff < 0) return { tone: "danger", pill: "Short", text: `${fmtQty(missing)} components are missing from stock. The breakdown below shows where they went.` }
  return { tone: "warning", pill: "Over", text: `${fmtQty(diff)} more components are on hand than the records show. Check BOM quantities and stock-in entries.` }
}

function ReasonRow({ label, sub, qty, max, tone, active, onClick }) {
  const q = Number(qty)
  const width = max > 0 ? Math.max(2, (Math.abs(q) / max) * 100) : 0
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
        <span className={cn("block h-full rounded-full", BAR[tone])} style={{ width: `${q === 0 ? 0 : width}%` }} />
      </span>
      <span className="w-20 text-right text-sm font-semibold tabular-nums">{fmtQty(q)}</span>
    </>
  )
  const base = "flex w-full items-center gap-4 px-6 py-3 text-left"
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60", active ? "bg-accent/70 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/40")}
    >
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  )
}

function ShortfallDetail({ data }) {
  const [code, setCode] = useState("")
  const sf = data.shortfall
  const missing = Math.abs(Number(data.difference))
  const unexplained = Number(sf.unexplained)
  const inProduction = Number(sf.in_production)
  const rows = code ? sf.movements.filter((m) => m.code === code) : sf.movements
  const activeLabel = sf.by_reason.find((g) => g.code === code)?.label

  const max = Math.max(Math.abs(inProduction), Math.abs(unexplained), ...sf.by_reason.map((g) => Math.abs(Number(g.quantity))), 0)

  return (
    <>
      <Panel
        title="Where the missing components went"
        description={`${fmtQty(missing)} components short. Stock-outs and count adjustments, grouped by reason. Select a reason to filter the entries below.`}
        action={
          unexplained === 0 ? (
            <Pill tone="success" dot>Fully explained</Pill>
          ) : (
            <Pill tone="danger" dot>{fmtQty(unexplained)} unexplained</Pill>
          )
        }
      >
        <div className="divide-y">
          {inProduction !== 0 && (
            <ReasonRow label="Taken for production" sub="Not in finished products yet" qty={inProduction} max={max} tone="neutral" />
          )}
          {sf.by_reason.map((g) => (
            <ReasonRow
              key={g.code}
              label={g.label}
              sub={`${g.movements} ${g.movements === 1 ? "entry" : "entries"}`}
              qty={g.quantity}
              max={max}
              tone={reasonTone(g.code)}
              active={code === g.code}
              onClick={() => setCode((c) => (c === g.code ? "" : g.code))}
            />
          ))}
          <div className="flex items-center justify-between gap-4 bg-muted/50 px-6 py-4">
            <p className="text-sm font-semibold">Still unexplained</p>
            <p className={cn("text-lg font-semibold tabular-nums", unexplained === 0 ? TEXT.success : TEXT.danger)}>{fmtQty(unexplained)}</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Entries behind the shortfall"
        description={`Latest ${sf.movements.length} entries. Reasons come from Stock out.`}
        action={
          code && (
            <button
              type="button"
              onClick={() => setCode("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {activeLabel}
              <X className="size-3.5" aria-label="Clear filter" />
            </button>
          )
        }
      >
        {sf.movements.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No stock-outs recorded">
            Nothing has been taken out or adjusted, so the shortfall has no recorded cause yet.
          </EmptyState>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted">
                <tr>
                  <th scope="col" className={`${th} text-left`}>Date</th>
                  <th scope="col" className={`${th} text-left`}>Component</th>
                  <th scope="col" className={`${th} text-left`}>Reason</th>
                  <th scope="col" className={`${th} text-right`}>Quantity</th>
                  <th scope="col" className={`${th} text-left`}>Worker</th>
                  <th scope="col" className={`${th} hidden text-left xl:table-cell`}>Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-6 py-3 tabular-nums text-muted-foreground">{fmtDateTime(m.created_at)}</td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <p className="font-medium">{m.component_name}</p>
                      <p className="text-xs text-muted-foreground">{m.sku}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <Pill tone={reasonTone(m.code)}>{m.reason_label}</Pill>
                    </td>
                    <td className={cn("whitespace-nowrap px-6 py-3 text-right font-medium tabular-nums", Number(m.quantity) < 0 && TEXT.success)}>
                      {fmtQty(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      {m.worker_name ? (
                        <div className="flex items-center gap-2.5">
                          <Initials name={m.worker_name} />
                          <div>
                            <p className="font-medium leading-tight">{m.worker_name}</p>
                            {m.recorded_by && <p className="text-xs text-muted-foreground">Entered by {m.recorded_by}</p>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{m.recorded_by ? `Entered by ${m.recorded_by}` : "-"}</span>
                      )}
                    </td>
                    <td className="hidden max-w-72 truncate px-6 py-3 text-muted-foreground xl:table-cell" title={m.reason || ""}>
                      {m.reason || "-"}{m.reference_no ? ` (${m.reference_no})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
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

  if (error) return <ErrorBanner title="Couldn't load balance sheet" onRetry={load}>{error}</ErrorBanner>
  if (!data) return <PanelSkeleton rows={4} />

  const diff = Number(data.difference)
  const st = status(diff, Math.abs(diff))

  return (
    <div className="space-y-6">
      <Panel
        title="Balance sheet"
        description="Checks the stock on hand against what the records say should be left."
        action={<Pill tone={st.tone} dot>{st.pill}</Pill>}
      >
        <div className="grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Line label="Total received (cumulative)" value={fmtQty(data.received_total)} />
            <Line label="Used by finished products" value={fmtQty(data.components_used)} op="−" />
            <Line label="Expected remaining" value={fmtQty(data.expected_remaining)} op="=" strong />
            <Line label="Actual on hand (inventory)" value={fmtQty(data.actual_on_hand)} />
          </div>

          <div className="flex flex-col justify-center border-t bg-muted/30 px-6 py-6 lg:col-span-5 lg:border-l lg:border-t-0">
            <p className="text-sm font-medium text-muted-foreground">Difference (actual − expected)</p>
            <p className={cn("mt-2 text-4xl font-semibold leading-none tracking-tight tabular-nums", TEXT[st.tone])}>
              {diff > 0 ? "+" : ""}{fmtQty(diff)}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-5 text-muted-foreground">{st.text}</p>
          </div>
        </div>
      </Panel>

      {diff < 0 && <ShortfallDetail data={data} />}
    </div>
  )
}
