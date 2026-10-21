/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Check, ChevronDown, Minus, Plus, Search, X } from "lucide-react"
import { CountUp } from "@/components/HistoryUI"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { PRESS, PRESS_SOFT, SPRING, SPRING_POP, SPRING_SOFT, rise, stagger } from "./mktMotion"
import { stageOf } from "./orderParts"

/*
  Building blocks for the Marketing Manager screens (dashboard, Marketing Orders and its popups).
  Nothing shared with other roles is changed: the shared Table / Modal / StatCard stay as they were.

  Rules used in here:
    - touch targets are 44px on a phone (h-11) and shrink to 36px with a mouse (sm:h-9)
    - inputs are 16px on a phone (iOS zooms the page in on anything smaller) and 13px from `sm` up
    - every press shows feedback on pointer-DOWN (whileTap), every colour also comes with an icon or a word
    - big text is tracked tighter, small text stays at normal tracking
*/

/* ------------------------------------------------------------------- header */

/** Gradient banner at the top of a page: eyebrow, big title, one line of help, buttons on the right. */
export function MktHero({ eyebrow, title, description, children, className }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: SPRING_SOFT }}
      className={cn(
        "relative mb-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white shadow-[0_18px_40px_-18px_rgba(13,148,136,0.75)] sm:mb-6 sm:p-7",
        className
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -end-10 -top-16 size-52 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 start-1/3 size-52 rounded-full bg-amber-300/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">{eyebrow}</p>}
          <h1 className="break-words text-[26px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[34px]">{title}</h1>
          {description && <p className="mt-2 max-w-xl text-[13px] leading-snug text-white/80 sm:text-[15px]">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </motion.header>
  )
}

const HERO_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-700 disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0"
const HERO_VARIANT = {
  solid: "bg-white text-emerald-800 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35)] hover:bg-white/95",
  glass: "bg-white/15 text-white ring-1 ring-inset ring-white/30 backdrop-blur-md hover:bg-white/25",
}

export function HeroButton({ variant = "solid", className, ...p }) {
  return <motion.button type="button" whileTap={PRESS} className={cn(HERO_BTN, HERO_VARIANT[variant], className)} {...p} />
}

/** A link that looks like a hero button. `wrap` is for the wrapper (e.g. "hidden md:inline-flex"). */
export function HeroLink({ variant = "solid", wrap = "inline-flex", className, children, ...p }) {
  return (
    <motion.div whileTap={PRESS} className={wrap}>
      <Link className={cn(HERO_BTN, HERO_VARIANT[variant], className)} {...p}>{children}</Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ buttons */

const BTN_BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
const BTN_VARIANT = {
  primary: "bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-[0_8px_18px_-8px_rgba(13,148,136,0.8)] hover:brightness-110",
  outline: "border border-cf-line-strong bg-card text-foreground hover:bg-muted",
  danger: "bg-cf-red-soft text-destructive hover:bg-destructive/15",
  ghost: "text-primary hover:bg-cf-green-soft",
}
const BTN_SIZE = { md: "h-11 px-4 sm:h-9 sm:px-3.5", sm: "h-9 px-3", icon: "size-11 sm:size-9" }

export function MktBtn({ variant = "outline", size = "md", className, type = "button", ...p }) {
  return <motion.button type={type} whileTap={PRESS} className={cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} {...p} />
}

/** Floating "New order" button for phones: stays under the thumb. Give it `to` (a link) or `onClick`. */
export function NewOrderFab({ to, onClick }) {
  const cls =
    "inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 px-5 text-sm font-semibold text-white shadow-[0_14px_30px_-8px_rgba(13,148,136,0.8)] ring-1 ring-inset ring-white/30 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  const button = (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { ...SPRING_POP, delay: 0.3 } }}
        whileTap={PRESS}
        className="fixed end-4 z-40 md:hidden"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {to ? (
          <Link to={to} className={cls}><Plus className="size-5" /> New order</Link>
        ) : (
          <button type="button" onClick={onClick} className={cls}><Plus className="size-5" /> New order</button>
        )}
      </motion.div>
  )
  return (
    <>
      {/* on <body>, not inside the page: a transformed or clipped parent can never hide or move it */}
      {typeof document !== "undefined" ? createPortal(button, document.body) : null}
      {/* so the last card is never hidden behind the button */}
      <div aria-hidden className="h-16 md:hidden" />
    </>
  )
}

/* -------------------------------------------------------------------- tiles */

/** The grid every row of figures uses. Children are <StageTile/>; they rise in one after another. */
export function TileGrid({ children, className }) {
  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="hidden"
      animate="show"
      className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5", className)}
    >
      {children}
    </motion.div>
  )
}

/**
 * One big figure. `stage` is an entry of STAGES or ALL_STAGE. Give it `to` (a link) or `onClick` (a filter toggle).
 * `solid` fills it with the stage colour; `active` does the same (the chosen filter), fading in/out.
 */
export function StageTile({ stage, value, loading, active, solid, to, onClick, className }) {
  const Icon = stage.icon
  const on = !!(solid || active)

  const body = (
    <>
      {/* the colour layer fades, so toggling a filter never "flashes" */}
      <span aria-hidden className={cn("absolute inset-0 bg-gradient-to-br transition-opacity duration-300", stage.s.grad, on ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute -end-6 -top-8 size-24 rounded-full bg-white/25 blur-xl transition-opacity duration-300", on ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-px bg-white/60 transition-opacity duration-300", on ? "opacity-100" : "opacity-0")} />

      <span className="relative flex items-start justify-between">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl text-white transition-colors duration-300",
            on ? "bg-white/20 ring-1 ring-inset ring-white/30" : cn("bg-gradient-to-br shadow-sm", stage.s.grad)
          )}
        >
          <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden />
        </span>
        {(to || onClick) && (
          <ArrowUpRight
            aria-hidden
            className={cn("size-4 transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5", on ? "text-white/80" : "text-slate-400 group-hover:text-primary")}
          />
        )}
      </span>

      <span className="relative mt-4 block">
        <span className={cn("block text-[30px] font-bold leading-none tracking-[-0.04em] tabular-nums transition-colors duration-300", on ? "text-white" : "text-foreground")}>
          {loading ? <span className="inline-block h-7 w-14 animate-pulse rounded-md bg-slate-200/80 align-middle" aria-label="Loading" /> : <CountUp value={value} />}
        </span>
        <span className={cn("mt-2 block text-[13px] font-semibold leading-tight transition-colors duration-300", on ? "text-white" : "text-foreground")}>{stage.label}</span>
        <span className={cn("mt-0.5 block text-[11px] leading-snug transition-colors duration-300", on ? "text-white/75" : "text-muted-foreground")}>{stage.hint}</span>
      </span>
    </>
  )

  const cls = cn(
    "group relative block w-full overflow-hidden rounded-2xl border p-4 text-start outline-none transition-[box-shadow,border-color] duration-300 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
    on ? cn("border-transparent shadow-lg", stage.s.glow) : "border-[#dce5e0] bg-card shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] hover:shadow-md"
  )

  return (
    <motion.div variants={rise} whileTap={PRESS_SOFT} whileHover={{ y: -2 }} className={className}>
      {to ? (
        <Link to={to} className={cls}>{body}</Link>
      ) : (
        <button type="button" onClick={onClick} aria-pressed={!!active} className={cls}>{body}</button>
      )}
    </motion.div>
  )
}

/**
 * Phone version of the filter: one scrolling row of chips. The coloured "selected" chip slides to the new choice.
 * items: [{ key, label, value, grad, dot, pill, active, onClick }]  (pill = soft colour of an unselected chip)
 */
export function StageChips({ items, label }) {
  return (
    <div role="group" aria-label={label} className="mkt-scroll-x -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1 md:hidden">
      {items.map((it) => (
        <motion.button
          key={it.key}
          type="button"
          whileTap={PRESS}
          aria-pressed={!!it.active}
          onClick={it.onClick}
          className={cn(
            "relative inline-flex h-10 shrink-0 snap-start items-center rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
            it.active ? "border-transparent text-white" : it.pill ? cn("border-transparent ring-1 ring-inset", it.pill) : "border-slate-200 bg-white text-slate-700"
          )}
        >
          {it.active && <motion.span layoutId="mkt-chip" transition={SPRING} className={cn("absolute inset-0 rounded-full bg-gradient-to-r shadow-md", it.grad)} />}
          <span className="relative flex items-center gap-2">
            <span className={cn("size-2 rounded-full", it.active ? "bg-white" : it.dot)} aria-hidden />
            {it.label}
            <span className={cn("grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] tabular-nums", it.active ? "bg-white/25" : it.pill ? "bg-white/70" : "bg-slate-100 text-slate-600")}>{it.value}</span>
          </span>
        </motion.button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- status */

/** Soft colour + icon + word. `short` uses the one-word label ("Pending") for tight spaces like phone cards. */
export function StatusPill({ value, short, className }) {
  const stage = stageOf(value)
  if (!stage) return <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600", className)}>{value || "Unknown"}</span>
  const Icon = stage.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", short ? "whitespace-nowrap rounded-full" : "max-w-60 whitespace-normal rounded-2xl text-start leading-snug", stage.s.pill, className)}>
      <Icon className={cn("size-3.5 shrink-0", !short && "self-start")} aria-hidden />
      {short ? stage.short : stage.label}
    </span>
  )
}

/* ------------------------------------------------------------------- inputs */

/** Search box. 16px text on a phone so iOS does not zoom in. */
export function SearchField({ value, onChange, placeholder = "Search", className }) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-cf-faint" aria-hidden />
      <input
        type="search"
        enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-cf-line-strong bg-card ps-10 pe-10 text-base outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:h-9 sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90 sm:size-7">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}


/**
  Status filter as a dropdown (desktop). `items` = [{ key, label, value, dot, active, onClick }].
  Shows the selected status on the button; the list shows every status with its colour dot and count.
  Keyboard: Enter / Space / arrows open it, arrows move, Enter picks, Esc closes.
*/
export function StatusSelect({ items, label = "Status", className, portal = false, placeholder }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [pos, setPos] = useState(null) // portal mode: where the list sits (viewport coordinates)
  const root = useRef(null)
  const list = useRef(null)
  const id = useId()
  const current = items.find((i) => i.active) ?? (placeholder ? null : items[0]) // placeholder: a menu of figures, nothing is "selected"

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!root.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener("pointerdown", onDown)
    if (portal) { window.addEventListener("scroll", close, true); window.addEventListener("resize", close) }
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open, portal])

  const openList = () => {
    setCursor(Math.max(0, items.findIndex((i) => i.active)))
    if (portal && root.current) { const r = root.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: r.left }) }
    setOpen(true)
  }
  const pick = (it) => { it.onClick?.(); setOpen(false) }

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); return }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) return openList()
      setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length)
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (!open) openList()
      else pick(items[cursor])
    }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex h-9 w-full min-w-56 items-center gap-2 rounded-xl border border-cf-line-strong bg-card px-3 text-start text-[13px] outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
      >
        {current ? (
          <>
            <span className={cn("size-2 shrink-0 rounded-full", current.dot)} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{current.short ?? current.label}</span>
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">{current.value}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{placeholder}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {portal ? (
        typeof document !== "undefined" && createPortal(<AnimatePresence>{open && pos && (
<motion.ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
          style={portal && pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
          className={cn("z-30 w-72 max-w-[calc(100vw-2rem)] origin-top overflow-hidden rounded-xl border border-cf-line-strong bg-card p-1 shadow-lg", portal ? "z-50" : "absolute start-0 top-full mt-1.5")}
        >
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={!!it.active}>
              <button
                type="button"
                onClick={() => pick(it)}
                onMouseEnter={() => setCursor(i)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] outline-none transition-colors", i === cursor ? "bg-muted" : "bg-transparent")}
              >
                <span className={cn("size-2 shrink-0 rounded-full", it.dot)} aria-hidden />
                <span className={cn("min-w-0 flex-1 truncate", it.active && "font-semibold")}>{it.short ?? it.label}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{it.value}</span>
                {it.active ? <Check className="size-4 text-primary" aria-hidden /> : <span className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </motion.ul>
        )}</AnimatePresence>, document.body)
      ) : (
        <AnimatePresence>{open && (
<motion.ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
          style={portal && pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
          className={cn("z-30 w-72 max-w-[calc(100vw-2rem)] origin-top overflow-hidden rounded-xl border border-cf-line-strong bg-card p-1 shadow-lg", portal ? "z-50" : "absolute start-0 top-full mt-1.5")}
        >
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={!!it.active}>
              <button
                type="button"
                onClick={() => pick(it)}
                onMouseEnter={() => setCursor(i)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] outline-none transition-colors", i === cursor ? "bg-muted" : "bg-transparent")}
              >
                <span className={cn("size-2 shrink-0 rounded-full", it.dot)} aria-hidden />
                <span className={cn("min-w-0 flex-1 truncate", it.active && "font-semibold")}>{it.short ?? it.label}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{it.value}</span>
                {it.active ? <Check className="size-4 text-primary" aria-hidden /> : <span className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </motion.ul>
        )}</AnimatePresence>
      )}
    </div>
  )
}

/** [-] 12 [+] : whole numbers only. */
export function QtyStepper({ id, value, onChange, invalid }) {
  const n = /^\d+$/.test(value) ? Number(value) : 0
  const set = (v) => onChange(String(Math.max(1, v)))
  const stepBtn = "grid w-11 shrink-0 place-items-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted active:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:w-9"
  return (
    <div
      className={cn(
        "flex h-11 w-full items-stretch overflow-hidden rounded-[10px] border bg-card transition-shadow focus-within:ring-3 sm:h-9",
        invalid ? "border-destructive focus-within:ring-destructive/20" : "border-cf-line-strong focus-within:border-primary focus-within:ring-primary/15"
      )}
    >
      <button type="button" aria-label="Decrease quantity" disabled={n <= 1} onClick={() => set(n - 1)} className={stepBtn}><Minus className="size-4" /></button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid ? true : undefined}
        className="w-full min-w-0 border-x bg-transparent text-center text-base font-semibold tabular-nums outline-none sm:text-[13px]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
      />
      <button type="button" aria-label="Increase quantity" onClick={() => set(n + 1)} className={stepBtn}><Plus className="size-4" /></button>
    </div>
  )
}

/* ------------------------------------------------------------ product lines */

/* Product lines of one order (read-only): a table from `sm` up, stacked cards on a phone. */
export function OrderItems({ items }) {
  const units = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-end">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.product_id}>
                <TableCell>
                  <p className="font-medium">{it.name}</p>
                  {it.sku && <p className="text-xs text-muted-foreground">{it.sku}</p>}
                </TableCell>
                <TableCell className="text-end font-semibold tabular-nums">{fmtQty(it.quantity)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-cf-head">
              <TableCell className="text-xs font-semibold text-muted-foreground">Total</TableCell>
              <TableCell className="text-end font-bold tabular-nums">{fmtQty(units)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2 sm:hidden">
        {items.map((it) => (
          <motion.li key={it.product_id} variants={rise} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold leading-snug">{it.name}</p>
              {it.sku && <p className="mt-0.5 text-xs text-muted-foreground">{it.sku}</p>}
            </div>
            <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">× {fmtQty(it.quantity)}</span>
          </motion.li>
        ))}
        <li className="flex items-center justify-between px-1 pt-1 text-xs font-semibold text-muted-foreground">
          <span>Total units</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{fmtQty(units)}</span>
        </li>
      </motion.ul>
    </>
  )
}
