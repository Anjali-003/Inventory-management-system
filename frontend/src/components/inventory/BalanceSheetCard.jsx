import { useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, ChevronRight, ClipboardList, PackageSearch, Search } from "lucide-react"
import { EmptyState } from "../feedback"
import { Modal } from "../Modal"
import { CfButton, CountUp, Pill, reasonTone } from "./HistoryUI"
import { cn } from "../../lib/utils"
import { fmtDateTime, fmtQty } from "../../lib/stock"

/*
    Balance sheet tab:  received - components used = expected remaining, compared with what is actually on hand.
    Shortfall tab: when stock is short, where it went, grouped by reason (the same reasons as Stock out),
    then entry by entry with quantity and order.
    `balance` is the response of GET /inventory/history/balance; nothing is calculated in the browser.
*/

const th = "h-[34px] whitespace-nowrap px-[18px] text-[9px] font-bold uppercase tracking-[0.5px] text-cf-faint"
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

const BG = { success: "bg-cf-green-soft/70", danger: "bg-cf-red-soft/70", warning: "bg-cf-amber-soft/70" }
const CHIP = { success: "bg-cf-green-soft text-primary", danger: "bg-cf-red-soft text-destructive", warning: "bg-cf-amber-soft text-warning" }

const stepVariants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

// One line of the working, numbered so each one can point back to the ones before it.
function Step({ n, label, formula, caption, amount, op, tone, strong }) {
  const overlay = tone ? BG[tone] : strong ? "bg-cf-head" : ""
  return (
    <motion.li variants={stepVariants} className="relative flex min-h-[68px] items-center gap-3.5 px-[18px] py-3 transition-colors hover:bg-cf-head">
      {overlay && <span aria-hidden className={cn("pointer-events-none absolute inset-0", overlay)} />}
      <span
        aria-hidden
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-1",
          tone ? `${CHIP[tone]} ring-current/25` : "bg-muted text-muted-foreground ring-border"
        )}
      >
        {n}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className={cn("text-[13px]", strong ? "font-bold" : "font-semibold")}>
          {label}
          {formula && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">({formula})</span>}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
      </div>
      <p className={cn("relative text-xl font-bold tabular-nums tracking-[-0.5px]", strong && "text-[22px]", tone && TEXT[tone])}>
        {op && <span className="mr-1.5 font-normal text-muted-foreground">{op}</span>}
        <CountUp value={amount} format={fmtQty} />
      </p>
    </motion.li>
  )
}

/*
    "Should be" vs "Actually in stock", side by side, with the gap (5) between them drawn on the actual bar.
    The numbers here are very far apart in size (e.g. 154,000 received vs 114 missing), so a chart of everything
    would hide the gap. This one is zoomed in on lines 3, 4 and 5: when the gap is small compared with the stock,
    the bars start above 0 so the gap is easy to see.
    Missing = a dashed empty block on top of the actual bar (what should be there but isn't).
    Extra = a solid amber block above the expected line (more than expected was found).
    Drawing only: every quantity comes from the server.
*/
function GapChart3D({ expected, actual }) {
  const W = 340
  const H = 214
  const base = 158
  const top = 40
  const barW = 84
  const d = 10 // depth of the 3D blocks
  const x3 = 22
  const x4 = 140

  const gap = Math.abs(actual - expected)
  const isShort = actual < expected
  const isOver = actual > expected
  const high = Math.max(expected, actual, 1)
  const low = Math.min(expected, actual)
  const axisMin = gap > 0 && gap < high * 0.25 ? Math.max(low - gap * 2.2, 0) : 0
  const zoomed = axisMin > 0
  const y = (v) => base - ((v - axisMin) / (high - axisMin || 1)) * (base - top)

  // one 3D block between two values
  const block = (key, x, vHi, vLo, { cls, ghost = false, topFace = true }) => {
    const yT = y(vHi)
    const h = Math.max(y(vLo) - yT, 2)
    const ghostProps = ghost ? { strokeDasharray: "4 3", strokeWidth: 1.5 } : {}
    return (
      <g key={key}>
        <rect x={x} y={yT} width={barW} height={h} className={cls} {...ghostProps} />
        {topFace && <polygon points={`${x},${yT} ${x + d},${yT - d * 0.6} ${x + barW + d},${yT - d * 0.6} ${x + barW},${yT}`} className={cls} style={ghost ? undefined : { filter: "brightness(1.25)" }} {...ghostProps} />}
        <polygon points={`${x + barW},${yT} ${x + barW + d},${yT - d * 0.6} ${x + barW + d},${yT + h - d * 0.6} ${x + barW},${yT + h}`} className={cls} style={ghost ? undefined : { filter: "brightness(0.7)" }} {...ghostProps} />
      </g>
    )
  }

  // number inside the bar when there is room, above it when the bar is very short
  const valueLabel = (x, v, yTopOfBar) => {
    const room = y(axisMin) - yTopOfBar
    const inside = room >= 30
    return (
      <text x={x + barW / 2 + d / 2} y={inside ? yTopOfBar + 20 : yTopOfBar - d * 0.6 - 6} textAnchor="middle" className={cn("text-[13px] font-bold", inside ? "fill-white" : "fill-foreground")}>
        {fmtQty(v)}
      </text>
    )
  }

  const stockTop = Math.min(actual, expected) // the solid part of the "actual" bar
  const capFill = isShort ? "fill-destructive/10 stroke-destructive" : "fill-warning"
  const capColor = isShort ? "fill-destructive" : "fill-warning"
  const tx = x4 + barW + d + 12
  const capMid = (y(Math.max(actual, expected)) + y(Math.min(actual, expected))) / 2
  const cx3 = x3 + barW / 2 + d / 2
  const cx4 = x4 + barW / 2 + d / 2

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-md overflow-visible" role="img" aria-label={`Should be in stock ${fmtQty(expected)}, actually in stock ${fmtQty(actual)}${gap ? `, ${fmtQty(gap)} ${isShort ? "missing" : "extra"}` : ", nothing missing"}`}>
        <line x1={x3 - 10} x2={x4 + barW + d + 10} y1={base} y2={base} className="stroke-border" strokeWidth={1.5} />

        <motion.g initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45, ease: "easeOut" }}>
          {block("b3", x3, expected, axisMin, { cls: "fill-cf-blue" })}
          {valueLabel(x3, expected, y(expected))}
        </motion.g>

        <motion.g initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45, ease: "easeOut" }}>
          {block("b4", x4, stockTop, axisMin, { cls: "fill-primary", topFace: !(isShort || isOver) })}
          {valueLabel(x4, actual, y(stockTop))}
        </motion.g>

        {gap > 0 && (
          <motion.g initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.45, ease: "easeOut" }}>
            {block("cap", x4, Math.max(actual, expected), stockTop, { cls: capFill, ghost: isShort })}
            {/* the expected level, carried across from the "should be" bar */}
            <line x1={x3 + barW + d} x2={x4 + barW} y1={y(expected) - d * 0.6} y2={y(expected) - d * 0.6} className="stroke-muted-foreground/60" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={tx + 8} cy={capMid - 6} r={8} className={capColor} />
            <text x={tx + 8} y={capMid - 6} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-bold">5</text>
            <text x={tx + 22} y={capMid - 2} className={cn("text-[15px] font-bold", isShort ? "fill-destructive" : "fill-warning")}>{isShort ? "−" : "+"}{fmtQty(gap)}</text>
            <text x={tx + 22} y={capMid + 12} className="fill-muted-foreground text-[10px] font-medium">{isShort ? "Missing" : "Extra"}</text>
          </motion.g>
        )}

        <circle cx={cx3} cy={base + 17} r={7.5} className="fill-cf-blue" />
        <text x={cx3} y={base + 17} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-bold">3</text>
        <text x={cx3} y={base + 38} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Should be in stock</text>
        <circle cx={cx4} cy={base + 17} r={7.5} className="fill-primary" />
        <text x={cx4} y={base + 17} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-bold">4</text>
        <text x={cx4} y={base + 38} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Actually in stock</text>
      </svg>
      {zoomed && <p className="mt-1 text-center text-[11px] text-muted-foreground">Zoomed in: the bars don't start at 0, so the gap is easy to see.</p>}
    </div>
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

  const headline = isShort ? `${amount} components are missing` : isOver ? `${amount} extra components in stock` : "Everything matches"
  const sentence = isShort
    ? `The records say ${should} should be in stock, but only ${actual} are.`
    : isOver
      ? `The records say ${should} should be in stock, but ${actual} are.`
      : `All ${should} components that should be in stock are there.`

  const expected = Math.max(Number(balance.expected_remaining) || 0, 0)
  const actualN = Math.max(Number(balance.actual_on_hand) || 0, 0)

  return (
    <div className="grid lg:grid-cols-5">
      <div className={cn("order-first flex flex-col items-start justify-center gap-3.5 border-b px-[18px] py-5 lg:order-last lg:col-span-2 lg:border-b-0 lg:border-l lg:px-5", BG[st.tone])}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
          <div className="mb-1.5"><Pill tone={st.tone} dot pulse={isShort}>{st.pill}</Pill></div>
          <p className={cn("text-sm font-bold leading-snug tracking-[-0.15px]", TEXT[st.tone])}>{headline}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{sentence}</p>
        </motion.div>
        <GapChart3D expected={expected} actual={actualN} />
        {isShort && onSeeShortfall && (
          <CfButton variant="ghost" className="group" onClick={onSeeShortfall}>
            See where they went <ChevronRight className="transition-transform group-hover:translate-x-0.5" />
          </CfButton>
        )}
      </div>

      <motion.ol
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
        className="divide-y lg:col-span-3"
      >
        <Step n={1} label="Received so far" caption="Everything that has come in since the start" amount={Number(balance.received_total)} />
        <Step n={2} label="Used in finished products" caption="Components that went into products that passed quality control" amount={Number(balance.components_used)} op="−" />
        <Step n={3} label="Should be in stock" formula="1 − 2" caption="What the records say is left" amount={Number(balance.expected_remaining)} strong />
        <Step n={4} label="Actually in stock" caption="What the inventory shows right now" amount={Number(balance.actual_on_hand)} />
        <Step
          n={5}
          label={isShort ? "Missing" : isOver ? "Extra" : "Difference"}
          formula={isOver ? "4 − 3" : "3 − 4"}
          caption={isShort ? "Should be in stock, but not found" : isOver ? "Found, but not in the records" : "Nothing missing, nothing extra"}
          amount={Math.abs(diff)}
          tone={st.tone}
          strong
        />
      </motion.ol>
    </div>
  )
}

const TONE_TEXT = { success: "text-success", danger: "text-destructive", warning: "text-warning", info: "text-primary", neutral: "text-foreground" }

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[7px] bg-muted p-[3px]">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[11px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
            value === k ? "bg-card font-semibold text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "font-medium text-muted-foreground hover:text-foreground"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder, className }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[15px] -translate-y-1/2 text-cf-faint" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-[7px] border border-cf-line-strong bg-card pl-8 pr-3 text-xs outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
      />
    </div>
  )
}

// A summary figure. With onClick it opens a pop-up with the detail behind the number.
function Stat({ dot, label, value, sub, onClick }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden />
          {label}
        </span>
        {onClick && <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
      </span>
      <span className="mt-1.5 block text-xl font-bold leading-none tracking-[-0.5px] tabular-nums">{value}</span>
      <span className="mt-1.5 block text-[10px] text-muted-foreground">{sub}</span>
    </>
  )
  const base = "block w-full rounded-[10px] border bg-card px-3.5 py-3 text-left shadow-cf"
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, "group outline-none transition-all hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/60")}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  )
}

// One component (or one reason): the number is the point.
function ItemCard({ title, sub, value, unit, caption, valueClass, onClick, index = 0 }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.3, ease: "easeOut" }}
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-[10px] border bg-card p-3.5 text-left shadow-cf outline-none transition-all hover:-translate-y-px hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-xs font-semibold leading-snug">{title}</span>
          <span className="mt-0.5 block truncate text-[10px] text-cf-faint">{sub}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("block text-xl font-bold leading-none tracking-[-0.5px] tabular-nums", valueClass)}>{value}</span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.5px] text-cf-faint">{caption || unit}</span>
        </span>
      </span>
      <span className="flex items-center justify-end gap-0.5 text-[11px] font-semibold text-primary">
        View entries <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </motion.button>
  )
}

function OrderCell({ m }) {
  return m.order_number ? (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-cf-green-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
        <ClipboardList className="size-3" aria-hidden />
        {m.order_number}
      </span>
      {m.recorded_by && <p className="mt-1 text-xs text-muted-foreground">Entered by {m.recorded_by}</p>}
    </div>
  ) : (
    <div className="text-muted-foreground">
      {/* older entries (before stock-outs were tied to orders) keep the worker they were saved with */}
      <p>{m.worker_name ? `Worker: ${m.worker_name}` : "-"}</p>
      {m.recorded_by && <p className="mt-1 text-xs">Entered by {m.recorded_by}</p>}
    </div>
  )
}

function EntriesTable({ rows, showComponent, showReason }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10 border-b bg-cf-head">
        <tr>
          <th scope="col" className={`${th} text-left`}>Date</th>
          {showComponent && <th scope="col" className={`${th} text-left`}>Component</th>}
          {showReason && <th scope="col" className={`${th} text-left`}>Reason</th>}
          <th scope="col" className={`${th} text-right`}>Qty</th>
          <th scope="col" className={`${th} text-left`}>Order</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} className="border-t transition-colors first:border-t-0 hover:bg-cf-head">
            <td className="whitespace-nowrap px-[18px] py-3 tabular-nums text-muted-foreground">{fmtDateTime(m.created_at)}</td>
            {showComponent && (
              <td className="whitespace-nowrap px-[18px] py-3">
                <p className="font-semibold">{m.component_name}</p>
                <p className="mt-0.5 text-[10px] text-cf-faint">{m.sku}</p>
              </td>
            )}
            {showReason && (
              <td className="px-[18px] py-3">
                <Pill tone={reasonTone(m.code)}>{m.reason_label}</Pill>
                {(m.reason || m.reference_no) && (
                  <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={m.reason || ""}>
                    {m.reason}{m.reference_no ? ` (${m.reference_no})` : ""}
                  </p>
                )}
              </td>
            )}
            <td className={cn("whitespace-nowrap px-[18px] py-3 text-right font-semibold tabular-nums", Number(m.quantity) < 0 && TEXT.success)}>
              {fmtQty(m.quantity)} <span className="text-[10px] font-normal text-muted-foreground">{m.unit}</span>
            </td>
            <td className="whitespace-nowrap px-[18px] py-3"><OrderCell m={m} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ShortfallDetail({ balance }) {
  const [view, setView] = useState("component")
  const [find, setFind] = useState("") // filters the cards
  const [dialog, setDialog] = useState(null) // { kind: "entries", sku?, code?, all? } | { kind: "production" }
  const [dq, setDq] = useState("") // search inside the "all entries" pop-up
  const sf = balance.shortfall
  const missing = Math.abs(Number(balance.difference))
  const unexplained = Number(sf.unexplained)
  const inProduction = Number(sf.in_production)
  const explained = Number(sf.explained_total)
  const byComponent = view === "component"
  const capped = sf.movements.length >= 200

  const status =
    unexplained === 0
      ? { tone: "success", pill: "Fully explained", sub: "Every missing piece has a recorded reason" }
      : unexplained > 0
        ? { tone: "danger", pill: `${fmtQty(unexplained)} unexplained`, sub: "Still to be traced to a stock-out" }
        : { tone: "warning", pill: `Over-explained by ${fmtQty(Math.abs(unexplained))}`, sub: "More was taken out than the shortfall" }

  // Drawing only: how the shortfall splits. The figures themselves come from the server.
  const segments = [
    { key: "prod", label: "Waiting in production", value: Math.max(inProduction, 0), bar: "bg-muted-foreground/45" },
    { key: "out", label: "Taken out with a reason", value: Math.max(explained, 0), bar: "bg-primary" },
    { key: "un", label: "Unexplained", value: Math.max(unexplained, 0), bar: "bg-destructive" },
  ]
  const segTotal = segments.reduce((s, x) => s + x.value, 0)

  const f = find.trim().toLowerCase()
  const comps = sf.components.filter((c) => !f || `${c.name} ${c.sku}`.toLowerCase().includes(f))
  const reasons = sf.by_reason.filter((g) => !f || g.label.toLowerCase().includes(f))

  // ---- pop-up content
  const open = (d) => { setDq(""); setDialog(d) }
  let dTitle = ""
  let dDesc = ""
  let dRows = []
  if (dialog?.kind === "entries") {
    const dc = dialog.sku ? sf.components.find((c) => c.sku === dialog.sku) : null
    const dr = dialog.code ? sf.by_reason.find((g) => g.code === dialog.code) : null
    dTitle = dc ? dc.name : dr ? dr.label : "All stock-out entries"
    const qq = dq.trim().toLowerCase()
    dRows = sf.movements.filter((m) => {
      if (dialog.sku && m.sku !== dialog.sku) return false
      if (dialog.code && m.code !== dialog.code) return false
      if (!qq) return true
      return [m.component_name, m.sku, m.order_number, m.reason, m.reason_label, m.reference_no, m.recorded_by, m.worker_name].some((v) =>
        String(v || "").toLowerCase().includes(qq)
      )
    })
    dDesc = `${dc ? `${dc.sku} · ` : ""}${dRows.length} ${dRows.length === 1 ? "entry" : "entries"}${capped ? " · latest 200 stock-outs" : ""}`
  }

  return (
    <div>
      {/* ------------------------------------------------------------ summary */}
      <div className="grid border-b lg:grid-cols-[minmax(15rem,1fr)_2.2fr] lg:divide-x">
        <div className="flex flex-col justify-center gap-2 bg-cf-red-soft/60 px-[18px] py-5">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.6px] text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-full bg-cf-red-soft text-destructive"><AlertTriangle className="size-3.5" aria-hidden /></span>
            Total shortfall
          </span>
          <p className="text-[32px] font-bold leading-none tracking-[-0.8px] tabular-nums text-destructive"><CountUp value={missing} /></p>
          <p className="text-[11px] text-muted-foreground">
            Expected <span className="font-medium text-foreground tabular-nums">{fmtQty(balance.expected_remaining)}</span> · In stock{" "}
            <span className="font-medium text-foreground tabular-nums">{fmtQty(balance.actual_on_hand)}</span>
          </p>
          <div><Pill tone={status.tone} dot>{status.pill}</Pill></div>
        </div>

        <div className="px-[18px] py-5">
          <p className="text-[13px] font-bold">Where the shortfall went</p>
          <div
            className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${fmtQty(s.value)}`).join(", ")}
          >
            {segTotal > 0 &&
              segments.map((s) =>
                s.value > 0 ? <motion.span key={s.key} title={`${s.label}: ${fmtQty(s.value)}`} className={cn("h-full", s.bar)} initial={{ width: 0 }} animate={{ width: `${(s.value / segTotal) * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} /> : null
              )}
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
            <Stat dot="bg-muted-foreground/45" label="Waiting in production" value={fmtQty(inProduction)} sub="Used, not finished yet. Not missing" onClick={() => open({ kind: "production" })} />
            <Stat dot="bg-primary" label="Taken out with a reason" value={fmtQty(explained)} sub="Stock-outs and count adjustments" onClick={() => open({ kind: "entries", all: true })} />
            <Stat dot="bg-destructive" label="Unexplained" value={fmtQty(Math.abs(unexplained))} sub={status.sub} />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-cf-head px-[18px] py-2.5">
        <Segmented
          label="Break down by"
          value={view}
          onChange={(k) => { setView(k); setFind("") }}
          options={[["component", "By component"], ["reason", "By reason"]]}
        />
        <p className="hidden text-[11px] text-muted-foreground md:block">
          {byComponent ? `${sf.components.length} components · ${fmtQty(sf.components_missing_total)} missing in total` : `${sf.by_reason.length} reasons`}
        </p>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <SearchBox value={find} onChange={setFind} placeholder={byComponent ? "Search components…" : "Search reasons…"} className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
          <CfButton variant="secondary" onClick={() => open({ kind: "entries", all: true })} disabled={sf.movements.length === 0}>
            <ClipboardList /> All entries
          </CfButton>
        </div>
      </div>

      {/* ------------------------------------------------------------ cards */}
      <div className="p-[18px]">
        {byComponent ? (
          sf.components.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No component is short">Every component is at or above its expected quantity.</EmptyState>
          ) : comps.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No component matches "{find}".</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3">
              {comps.map((c, i) => {
                const m = Number(c.missing)
                const extra = m <= 0
                return (
                  <ItemCard
                    key={c.component_id}
                    index={i}
                    title={c.name}
                    sub={c.sku}
                    value={extra ? `+${fmtQty(Math.abs(m))}` : fmtQty(m)}
                    unit={c.unit}
                    caption={extra ? `${c.unit} extra` : `${c.unit} missing`}
                    valueClass={extra ? TONE_TEXT.success : TONE_TEXT.danger}
                    onClick={() => open({ kind: "entries", sku: c.sku })}
                  />
                )
              })}
            </div>
          )
        ) : sf.by_reason.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No stock-outs recorded">
            Nothing has been taken out or adjusted, so the shortfall has no recorded cause yet.
          </EmptyState>
        ) : reasons.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No reason matches "{find}".</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3">
            {reasons.map((g, i) => (
              <ItemCard
                key={g.code}
                index={i}
                title={g.label}
                sub={`${g.movements} ${g.movements === 1 ? "entry" : "entries"}`}
                value={fmtQty(g.quantity)}
                caption="taken out"
                onClick={() => open({ kind: "entries", code: g.code })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ pop-ups */}
      <Modal
        open={dialog?.kind === "entries"}
        onClose={() => setDialog(null)}
        size="xl"
        className="cf-scope"
        title={dTitle}
        description={dDesc}
        footer={<CfButton variant="secondary" onClick={() => setDialog(null)}>Close</CfButton>}
      >
        <div className="-mx-5 -my-5">
          {dialog?.all && (
            <div className="border-b bg-cf-head px-[18px] py-2.5">
              <SearchBox value={dq} onChange={setDq} placeholder="Search component, order, reason…" />
            </div>
          )}
          {dRows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">{dq ? "No entries match your search." : "No stock-out entries recorded for this selection."}</p>
          ) : (
            <div className="max-h-[calc(100dvh-17rem)] overflow-auto">
              <EntriesTable rows={dRows} showComponent={!dialog?.sku} showReason={!dialog?.code} />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === "production"}
        onClose={() => setDialog(null)}
        size="md"
        className="cf-scope"
        title="Waiting in production"
        description={`${fmtQty(inProduction)} components · not missing`}
        footer={<CfButton variant="secondary" onClick={() => setDialog(null)}>Close</CfButton>}
      >
        <div className="-mx-5 -my-5">
          <p className="border-b bg-cf-head px-[18px] py-3 text-[11px] leading-5 text-muted-foreground">
            Production is complete, but these products have not reached finished goods yet (testing / quality control).
          </p>
          {sf.unfinished_components.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No products are waiting between production and finished goods.</p>
          ) : (
            <ul className="divide-y">
              {sf.unfinished_components.map((c) => (
                <li key={c.component_id} className="flex items-center justify-between gap-3 px-[18px] py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{c.name}</p>
                    <p className="mt-0.5 text-[10px] text-cf-faint">{c.sku}</p>
                  </div>
                  <p className="whitespace-nowrap text-xs font-bold tabular-nums">
                    {fmtQty(c.quantity)} <span className="text-[10px] font-normal text-muted-foreground">{c.unit}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}
