import { useState } from "react"
import { AlertTriangle, CheckCircle2, Info, PackageSearch, X } from "lucide-react"
import { EmptyState } from "../feedback"
import { Button } from "../ui/button"
import { Initials, Pill, reasonTone } from "./HistoryUI"
import { cn } from "../../lib/utils"
import { fmtDateTime, fmtQty } from "../../lib/stock"

/*
    Balance sheet tab:  received - components used = expected remaining, compared with what is actually on hand.
    Shortfall tab: when stock is short, where it went, grouped by reason (the same reasons as Stock out),
    then entry by entry with quantity and worker.
    `balance` is the response of GET /inventory/history/balance; nothing is calculated in the browser.
*/

const th = "h-10 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
const BAR = {
  danger: "bg-destructive",
  info: "bg-primary",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/45",
}
export const TEXT = { success: "text-success", danger: "text-destructive", warning: "text-warning" }

export function balanceStatus(diff) {
  if (diff === 0) return { tone: "success", pill: "Balanced", short: "Matches expected", text: "Stock on hand matches the records." }
  if (diff < 0) {
    return {
      tone: "danger",
      pill: "Short",
      short: "Short of expected",
      text: `${fmtQty(Math.abs(diff))} components are missing from stock. The Shortfall tab shows where they went.`,
    }
  }
  return {
    tone: "warning",
    pill: "Over",
    short: "More than expected",
    text: `${fmtQty(diff)} more components are on hand than the records show. Check BOM quantities and stock-in entries.`,
  }
}

const BG = { success: "bg-success/5", danger: "bg-destructive/5", warning: "bg-warning/5" }
const CHIP = { success: "bg-success/10 text-success", danger: "bg-destructive/10 text-destructive", warning: "bg-warning/10 text-warning" }

// One line of the working, in plain words, numbered so each line can point back to the ones before it.
function Step({ n, label, formula, caption, value, op, tone, strong }) {
  return (
    <li className={cn("flex items-center gap-3 px-5", strong ? "border-y bg-muted/50 py-3" : "py-2.5")}>
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", strong ? "font-semibold" : "font-medium")}>
          {label}
          {formula && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({formula})</span>}
        </p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      <p className={cn("tabular-nums", strong ? "text-lg font-semibold" : "text-base font-medium", tone && TEXT[tone])}>
        {op && <span className="mr-1 font-normal text-muted-foreground">{op}</span>}
        {value}
      </p>
    </li>
  )
}

export default function BalanceSheetCard({ balance, onSeeShortfall }) {
  const diff = Number(balance.difference)
  const st = balanceStatus(diff)
  const isShort = diff < 0
  const isOver = diff > 0
  const amount = fmtQty(Math.abs(diff))
  const should = fmtQty(balance.expected_remaining)
  const actual = fmtQty(balance.actual_on_hand)
  const Icon = isShort ? AlertTriangle : isOver ? Info : CheckCircle2

  const headline = isShort ? `${amount} components are missing` : isOver ? `${amount} extra components in stock` : "Everything matches"
  const sentence = isShort
    ? `The records say ${should} should be in stock, but only ${actual} are.`
    : isOver
      ? `The records say ${should} should be in stock, but ${actual} are.`
      : `All ${should} components that should be in stock are there.`

  return (
    <div className="grid lg:grid-cols-5">
      <div className={cn("order-first flex flex-col justify-center gap-3 border-b px-5 py-5 lg:order-last lg:col-span-2 lg:border-b-0 lg:border-l", BG[st.tone])}>
        <span className={cn("grid size-10 place-items-center rounded-full", CHIP[st.tone])}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className={cn("text-xl font-semibold leading-snug", TEXT[st.tone])}>{headline}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{sentence}</p>
        </div>
        {isShort && onSeeShortfall && (
          <div>
            <Button variant="outline" size="sm" onClick={onSeeShortfall}>See where they went</Button>
          </div>
        )}
        {isOver && <p className="text-sm text-muted-foreground">Check BOM quantities and stock-in entries.</p>}
      </div>

      <ol className="py-1 lg:col-span-3">
        <Step n={1} label="Received so far" caption="Everything that has come in since the start" value={fmtQty(balance.received_total)} />
        <Step n={2} label="Used in finished products" caption="Components that went into products that passed quality control" value={fmtQty(balance.components_used)} op="−" />
        <Step n={3} label="Should be in stock" formula="1 − 2" caption="What the records say is left" value={should} strong />
        <Step n={4} label="Actually in stock" caption="What the inventory shows right now" value={actual} />
        <Step
          n={5}
          label={isShort ? "Missing" : isOver ? "Extra" : "Difference"}
          formula={isOver ? "4 − 3" : "3 − 4"}
          caption={isShort ? "Should be in stock, but not found" : isOver ? "Found, but not in the records" : "Nothing missing, nothing extra"}
          value={amount}
          tone={st.tone}
          strong
        />
      </ol>
    </div>
  )
}

function Tile({ label, sub, qty, max, tone, active, onClick }) {
  const q = Number(qty)
  const width = max > 0 && q !== 0 ? Math.max(3, (Math.abs(q) / max) * 100) : 0
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{fmtQty(q)}</span>
      </span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", BAR[tone])} style={{ width: `${width}%` }} />
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{sub}</span>
    </>
  )
  const base = "block w-full px-5 py-3 text-left"
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60", active ? "bg-accent/70 shadow-[inset_3px_0_0_var(--primary)]" : "bg-card hover:bg-muted/50")}
    >
      {body}
    </button>
  ) : (
    <div className={cn(base, "bg-card")}>{body}</div>
  )
}

function Chip({ children, onClear }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {children}
      <X className="size-3.5" aria-label="Clear filter" />
    </button>
  )
}

export function ShortfallDetail({ balance }) {
  const [view, setView] = useState("component")
  const [code, setCode] = useState("")
  const [sku, setSku] = useState("")
  const sf = balance.shortfall
  const missing = Math.abs(Number(balance.difference))
  const unexplained = Number(sf.unexplained)
  const inProduction = Number(sf.in_production)
  const byComponent = view === "component"
  // Each view shows only its own side: by component hides everything about reasons, by reason hides components.
  const rows = sf.movements.filter((m) => (byComponent ? !sku || m.sku === sku : !code || m.code === code))
  const activeReason = sf.by_reason.find((g) => g.code === code)?.label
  const activeComponent = sf.components.find((c) => c.sku === sku)
  const max = Math.max(Math.abs(inProduction), ...sf.by_reason.map((g) => Math.abs(Number(g.quantity))), 0)
  const toggleSku = (v) => setSku((c) => (c === v ? "" : v))

  const tiles = []
  if (inProduction !== 0) {
    tiles.push(<Tile key="prod" label="Used in unfinished products" sub="Production done, not yet finished goods" qty={inProduction} max={max} tone="neutral" />)
  }
  sf.by_reason.forEach((g) =>
    tiles.push(
      <Tile
        key={g.code}
        label={g.label}
        sub={`${g.movements} ${g.movements === 1 ? "entry" : "entries"}`}
        qty={g.quantity}
        max={max}
        tone={reasonTone(g.code)}
        active={code === g.code}
        onClick={() => setCode((c) => (c === g.code ? "" : g.code))}
      />
    )
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{fmtQty(missing)}</span> components short. Select a {byComponent ? "component" : "reason"} to see its entries.
        </p>
        {unexplained === 0 ? (
          <Pill tone="success" dot>Fully explained</Pill>
        ) : unexplained > 0 ? (
          <Pill tone="danger" dot>{fmtQty(unexplained)} still unexplained</Pill>
        ) : (
          <Pill tone="warning" dot>Explained {fmtQty(Math.abs(unexplained))} more than the shortfall</Pill>
        )}
      </div>

      <div className="flex items-center gap-3 border-b px-5 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Break down by</span>
        <div role="group" aria-label="Break down by" className="inline-flex rounded-md bg-muted p-0.5">
          {[["component", "Component"], ["reason", "Reason"]].map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => { setView(k); setCode(""); setSku("") }}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {view === "reason" ? (
        tiles.length > 0 && (
          <div className="grid gap-px border-b bg-border sm:grid-cols-2 lg:grid-cols-3">
            {tiles}
            {tiles.length % 2 === 1 && <div className="hidden bg-card sm:block lg:hidden" />}
            {Array.from({ length: (3 - (tiles.length % 3)) % 3 }).map((_, i) => (
              <div key={i} className="hidden bg-card lg:block" />
            ))}
          </div>
        )
      ) : (
        <div className="grid border-b sm:grid-cols-2 sm:divide-x">
          <div>
            <div className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-5 py-2.5">
              <p className="text-sm font-medium">Missing by component</p>
              <p className="text-sm font-semibold tabular-nums text-destructive">{fmtQty(sf.components_missing_total)}</p>
            </div>
            <div className="max-h-52 overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {sf.components.map((c) => {
                    const m = Number(c.missing)
                    const active = sku === c.sku
                    return (
                      <tr
                        key={c.component_id}
                        onClick={() => toggleSku(c.sku)}
                        className={cn("cursor-pointer border-t transition-colors first:border-t-0", active ? "bg-accent/70" : "hover:bg-muted/40")}
                      >
                        <td className="px-5 py-2.5">
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={(e) => { e.stopPropagation(); toggleSku(c.sku) }}
                            className="block text-left outline-none focus-visible:underline"
                          >
                            <span className="block font-medium">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">{c.sku}</span>
                          </button>
                        </td>
                        <td className={cn("whitespace-nowrap px-5 py-2.5 text-right font-semibold tabular-nums", m > 0 ? TEXT.danger : TEXT.success)}>
                          {m > 0 ? `${fmtQty(m)} missing` : `+${fmtQty(Math.abs(m))} extra`}{" "}
                          <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t sm:border-t-0">
            <div className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-5 py-2.5">
              <p className="text-sm font-medium">Used in unfinished products</p>
              <p className="text-sm font-semibold tabular-nums">{fmtQty(inProduction)}</p>
            </div>
            <p className="border-b px-5 py-2 text-xs leading-5 text-muted-foreground">
              Production is complete, but these products have not reached finished goods yet (testing / quality control). These components are not missing.
            </p>
            {sf.unfinished_components.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No products are waiting between production and finished goods.</p>
            ) : (
              <div className="max-h-40 overflow-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {sf.unfinished_components.map((c) => (
                      <tr key={c.component_id} className="border-t first:border-t-0">
                        <td className="px-5 py-2.5">
                          <span className="block font-medium">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">{c.sku}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right font-semibold tabular-nums">
                          {fmtQty(c.quantity)} <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest {sf.movements.length} entries</p>
        <div className="flex flex-wrap items-center gap-2">
          {byComponent && activeComponent && <Chip onClear={() => setSku("")}>{activeComponent.name}</Chip>}
          {!byComponent && code && <Chip onClear={() => setCode("")}>{activeReason}</Chip>}
        </div>
      </div>

      {sf.movements.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No stock-outs recorded">
          Nothing has been taken out or adjusted, so the shortfall has no recorded cause yet.
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No entries for this selection.</p>
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted">
              <tr>
                <th scope="col" className={`${th} text-left`}>Date</th>
                <th scope="col" className={`${th} text-left`}>Component</th>
                {!byComponent && <th scope="col" className={`${th} text-left`}>Reason</th>}
                <th scope="col" className={`${th} text-right`}>Qty</th>
                <th scope="col" className={`${th} text-left`}>Worker</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t transition-colors first:border-t-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{fmtDateTime(m.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <p className="font-medium">{m.component_name}</p>
                    <p className="text-xs text-muted-foreground">{m.sku}</p>
                  </td>
                  {!byComponent && (
                    <td className="px-4 py-2.5">
                      <Pill tone={reasonTone(m.code)}>{m.reason_label}</Pill>
                      {(m.reason || m.reference_no) && (
                        <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={m.reason || ""}>
                          {m.reason}{m.reference_no ? ` (${m.reference_no})` : ""}
                        </p>
                      )}
                    </td>
                  )}
                  <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums", Number(m.quantity) < 0 && TEXT.success)}>
                    {fmtQty(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {m.worker_name ? (
                      <div className="flex items-center gap-2">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
