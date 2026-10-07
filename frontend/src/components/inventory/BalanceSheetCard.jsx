import { useState } from "react"
import { motion } from "motion/react"
import { AlertTriangle, ChevronRight, ClipboardList, PackageSearch, Search } from "lucide-react"
import { EmptyState } from "../feedback"
import { Button } from "../ui/button"
import { Modal } from "../Modal"
import { CountUp, Pill, reasonTone } from "./HistoryUI"
import { cn } from "../../lib/utils"
import { fmtDateTime, fmtQty } from "../../lib/stock"

/*
    Balance sheet tab:  received - components used = expected remaining, compared with what is actually on hand.
    Shortfall tab: when stock is short, where it went, grouped by reason (the same reasons as Stock out),
    then entry by entry with quantity and order.
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

const stepVariants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

// One line of the working, numbered so each one can point back to the ones before it.
function Step({ n, label, formula, caption, amount, op, tone, strong }) {
  const overlay = tone ? BG[tone] : strong ? "bg-muted/50" : ""
  return (
    <motion.li variants={stepVariants} className="relative flex items-center gap-5 px-6 py-5 transition-colors hover:bg-muted/40 lg:px-8 lg:py-6">
      {overlay && <span aria-hidden className={cn("pointer-events-none absolute inset-0", overlay)} />}
      <span
        aria-hidden
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-full text-base font-semibold ring-1",
          tone ? `${CHIP[tone]} ring-current/30` : "bg-muted text-muted-foreground ring-border"
        )}
      >
        {n}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className={cn("text-lg lg:text-xl", strong ? "font-semibold" : "font-medium")}>
          {label}
          {formula && <span className="ml-2 text-base font-normal text-muted-foreground">({formula})</span>}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground lg:text-base">{caption}</p>
      </div>
      <p className={cn("relative tabular-nums tracking-tight", strong ? "text-4xl font-semibold" : "text-3xl font-medium", tone && TEXT[tone])}>
        {op && <span className="mr-2 font-normal text-muted-foreground">{op}</span>}
        <CountUp value={amount} format={fmtQty} />
      </p>
    </motion.li>
  )
}

/*
    Waterfall: the five lines of the working as five bars (same numbers as the list).
      1 Received  ->  2 Used comes off the top  ->  3 Should be in stock  ->  4 Actually in stock  ->  5 the gap between 3 and 4
    Dashed lines carry each level across to the next bar, so the gap (missing or extra) is easy to see.
    Drawing only: every quantity comes from the server. `steps` = [{ n, short, label, lo, hi, text, fill, bg }].
*/
function Waterfall3D({ steps }) {
  const [hover, setHover] = useState(null)
  const W = 340
  const H = 218
  const padX = 8
  const colW = (W - padX * 2) / steps.length
  const barW = 38
  const d = 7 // depth of the 3D bars
  const base = 170
  const top = 36
  const max = Math.max(...steps.map((x) => x.hi), 1)
  const y = (v) => base - (v / max) * (base - top)
  const bars = steps.map((x, i) => {
    const bx = padX + i * colW + (colW - barW) / 2
    const yTop = y(x.hi)
    const h = Math.max(y(x.lo) - yTop, 2)
    return { ...x, bx, yTop, h }
  })
  const by = (n) => bars.find((x) => x.n === n)
  const [b1, b2, b3, b4, b5] = [by(1), by(2), by(3), by(4), by(5)]
  const link = (xa, xb, level) => ({ x1: xa.bx + barW + d, x2: xb.bx, y: y(level) - d * 0.6 })
  const links = [
    link(b1, b2, b1.hi), // received level -> used bar
    link(b2, b3, b3.hi), // what is left after used -> should be
    link(b3, b5, b3.hi), // the expected level, carried across to the gap bar
    link(b4, b5, b4.hi), // the actual level, carried across to the gap bar
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-md overflow-visible" role="img" aria-label={`Waterfall chart: ${steps.map((x) => `${x.n}. ${x.label} ${x.text}`).join(", ")}`}>
      <line x1={padX} x2={W - padX} y1={base} y2={base} className="stroke-border" strokeWidth={1.5} />
      {links.map((l, i) => (
        <line key={i} x1={l.x1} x2={l.x2} y1={l.y} y2={l.y} className="stroke-muted-foreground/50" strokeWidth={1} strokeDasharray="3 3" />
      ))}

      {bars.map((x, i) => {
        const cx = x.bx + barW / 2 + d / 2
        const dim = hover !== null && hover !== x.n
        return (
          <motion.g
            key={x.n}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.09, duration: 0.45, ease: "easeOut" }}
            onMouseEnter={() => setHover(x.n)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${x.n}. ${x.label}: ${x.text}`}</title>
            {/* front, top and right side: a small block */}
            <rect x={x.bx} y={x.yTop} width={barW} height={x.h} className={x.fill} />
            <polygon points={`${x.bx},${x.yTop} ${x.bx + d},${x.yTop - d * 0.6} ${x.bx + barW + d},${x.yTop - d * 0.6} ${x.bx + barW},${x.yTop}`} className={x.fill} style={{ filter: "brightness(1.25)" }} />
            <polygon points={`${x.bx + barW},${x.yTop} ${x.bx + barW + d},${x.yTop - d * 0.6} ${x.bx + barW + d},${x.yTop + x.h - d * 0.6} ${x.bx + barW},${x.yTop + x.h}`} className={x.fill} style={{ filter: "brightness(0.7)" }} />
            <text x={cx} y={x.yTop - d * 0.6 - 5} textAnchor="middle" className="fill-foreground stroke-card text-[11px] font-semibold" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">{x.text}</text>

            <circle cx={cx} cy={base + 17} r={7.5} className={x.fill} />
            <text x={cx} y={base + 17} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-bold">{x.n}</text>
            <text x={cx} y={base + 39} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">{x.short}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

// One flat bar split into used / in stock / missing. The whole bar = everything received.
function SplitBar({ parts, caption }) {
  const total = parts.reduce((t, x) => t + x.value, 0)
  return (
    <div className="w-full">
      <p className="mb-1.5 text-xs text-muted-foreground">{caption}</p>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((x) => `${x.label}: ${fmtQty(x.value)}`).join(", ")}>
        {total > 0 &&
          parts.filter((x) => x.value > 0).map((x) => (
            <motion.span
              key={x.label}
              title={`${x.label}: ${fmtQty(x.value)}`}
              className={cn("h-full", x.bg)}
              initial={{ width: 0 }}
              animate={{ width: `${(x.value / total) * 100}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            />
          ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", x.bg)} />
            <span className="text-muted-foreground">{x.label}</span>
            <span className="font-semibold tabular-nums">{fmtQty(x.value)}</span>
          </span>
        ))}
      </div>
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

  const received = Number(balance.received_total) || 0
  const used = Number(balance.components_used) || 0
  const expected = Math.max(Number(balance.expected_remaining) || 0, 0)
  const actualN = Math.max(Number(balance.actual_on_hand) || 0, 0)
  const gap = isShort ? { fill: "fill-destructive", bg: "bg-destructive" } : isOver ? { fill: "fill-warning", bg: "bg-warning" } : { fill: "fill-slate-400", bg: "bg-slate-400" }
  const gapText = isShort ? `−${fmtQty(Math.abs(diff))}` : isOver ? `+${fmtQty(diff)}` : "0"
  const steps = [
    { n: 1, short: "Received", label: "Received so far", lo: 0, hi: received, text: fmtQty(received), fill: "fill-primary" },
    { n: 2, short: "Used", label: "Used in finished products", lo: Math.max(received - used, 0), hi: received, text: `−${fmtQty(used)}`, fill: "fill-slate-500" },
    { n: 3, short: "Should be", label: "Should be in stock", lo: 0, hi: expected, text: fmtQty(expected), fill: "fill-cyan-500" },
    { n: 4, short: "In stock", label: "Actually in stock", lo: 0, hi: actualN, text: fmtQty(actualN), fill: "fill-emerald-500" },
    { n: 5, short: isShort ? "Missing" : isOver ? "Extra" : "Difference", label: isShort ? "Missing" : isOver ? "Extra" : "Difference", lo: Math.min(actualN, expected), hi: Math.max(actualN, expected), text: gapText, fill: gap.fill },
  ]
  // The whole bar is what was received: used + what is in stock (up to what should be there) + what is missing.
  const split = [
    { label: "Used", value: Math.max(used, 0), bg: "bg-slate-500" },
    { label: "In stock", value: Math.min(actualN, expected), bg: "bg-emerald-500" },
    ...(isShort ? [{ label: "Missing", value: Math.abs(diff), bg: "bg-destructive" }] : []),
  ]

  return (
    <div className="grid lg:grid-cols-5">
      <div className={cn("order-first flex flex-col items-start justify-center gap-4 border-b px-5 py-6 lg:order-last lg:col-span-2 lg:border-b-0 lg:border-l lg:px-6", BG[st.tone])}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
          <div className="mb-1.5"><Pill tone={st.tone} dot pulse={isShort}>{st.pill}</Pill></div>
          <p className={cn("text-lg font-semibold leading-snug", TEXT[st.tone])}>{headline}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{sentence}</p>
        </motion.div>
        <Waterfall3D steps={steps} />
        <SplitBar parts={split} caption={`Where the ${fmtQty(received)} received went`} />
        {isShort && onSeeShortfall && (
          <Button variant="outline" className="group" onClick={onSeeShortfall}>
            See where they went <ChevronRight className="transition-transform group-hover:translate-x-0.5" />
          </Button>
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
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/60",
            value === k ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
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
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
    </div>
  )
}

// A summary figure. With onClick it opens a pop-up with the detail behind the number.
function Stat({ dot, label, value, sub, onClick }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden />
          {label}
        </span>
        {onClick && <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
      </span>
      <span className="mt-1.5 block text-2xl font-semibold leading-none tabular-nums">{value}</span>
      <span className="mt-1.5 block text-xs text-muted-foreground">{sub}</span>
    </>
  )
  const base = "block w-full rounded-lg border bg-card px-3.5 py-3 text-left"
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
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left outline-none transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-snug">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("block text-2xl font-semibold leading-none tabular-nums", valueClass)}>{value}</span>
          <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{caption || unit}</span>
        </span>
      </span>
      <span className="flex items-center justify-end gap-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
        View entries <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </motion.button>
  )
}

function OrderCell({ m }) {
  return m.order_number ? (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
        <ClipboardList className="size-3 text-muted-foreground" aria-hidden />
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
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 border-b bg-muted">
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
          <tr key={m.id} className="border-t transition-colors first:border-t-0 hover:bg-muted/40">
            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{fmtDateTime(m.created_at)}</td>
            {showComponent && (
              <td className="whitespace-nowrap px-4 py-2.5">
                <p className="font-medium">{m.component_name}</p>
                <p className="text-xs text-muted-foreground">{m.sku}</p>
              </td>
            )}
            {showReason && (
              <td className="px-4 py-2.5">
                <Pill tone={reasonTone(m.code)}>{m.reason_label}</Pill>
                {(m.reason || m.reference_no) && (
                  <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={m.reason || ""}>
                    {m.reason}{m.reference_no ? ` (${m.reference_no})` : ""}
                  </p>
                )}
              </td>
            )}
            <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums", Number(m.quantity) < 0 && TEXT.success)}>
              {fmtQty(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5"><OrderCell m={m} /></td>
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
        <div className="flex flex-col justify-center gap-2 bg-destructive/[0.04] px-5 py-5">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-3.5" aria-hidden /></span>
            Total shortfall
          </span>
          <p className="text-4xl font-semibold leading-none tabular-nums text-destructive"><CountUp value={missing} /></p>
          <p className="text-xs text-muted-foreground">
            Expected <span className="font-medium text-foreground tabular-nums">{fmtQty(balance.expected_remaining)}</span> · In stock{" "}
            <span className="font-medium text-foreground tabular-nums">{fmtQty(balance.actual_on_hand)}</span>
          </p>
          <div><Pill tone={status.tone} dot>{status.pill}</Pill></div>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm font-semibold">Where the shortfall went</p>
          <div
            className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-muted"
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
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
        <Segmented
          label="Break down by"
          value={view}
          onChange={(k) => { setView(k); setFind("") }}
          options={[["component", "By component"], ["reason", "By reason"]]}
        />
        <p className="hidden text-xs text-muted-foreground md:block">
          {byComponent ? `${sf.components.length} components · ${fmtQty(sf.components_missing_total)} missing in total` : `${sf.by_reason.length} reasons`}
        </p>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <SearchBox value={find} onChange={setFind} placeholder={byComponent ? "Search components…" : "Search reasons…"} className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
          <Button variant="outline" size="lg" onClick={() => open({ kind: "entries", all: true })} disabled={sf.movements.length === 0}>
            <ClipboardList /> All entries
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ cards */}
      <div className="p-4">
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
        title={dTitle}
        description={dDesc}
        footer={<Button type="button" variant="outline" size="lg" onClick={() => setDialog(null)}>Close</Button>}
      >
        <div className="-mx-5 -my-5">
          {dialog?.all && (
            <div className="border-b bg-muted/30 px-5 py-2.5">
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
        title="Waiting in production"
        description={`${fmtQty(inProduction)} components · not missing`}
        footer={<Button type="button" variant="outline" size="lg" onClick={() => setDialog(null)}>Close</Button>}
      >
        <div className="-mx-5 -my-5">
          <p className="border-b bg-muted/30 px-5 py-3 text-xs leading-5 text-muted-foreground">
            Production is complete, but these products have not reached finished goods yet (testing / quality control).
          </p>
          {sf.unfinished_components.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No products are waiting between production and finished goods.</p>
          ) : (
            <ul className="divide-y">
              {sf.unfinished_components.map((c) => (
                <li key={c.component_id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.sku}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {fmtQty(c.quantity)} <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
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
