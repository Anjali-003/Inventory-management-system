/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom"
import { ChevronRight, ClipboardList, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtQty } from "@/lib/stock"
import { stageOf } from "./orderParts"

/*
  "Readable from across the room" building blocks for the Marketing Manager screens.

  Rules used everywhere in here:
    - body text 16px or more, table text 16px, headings 24-36px, figures 48px
    - text is slate-900 / slate-700 (never the faint grey of the shared theme)
    - every status has a strong solid colour AND an icon + word, so it is not colour alone
    - controls are 40-48px tall, focus ring is 4px

  These are used by the Marketing dashboard, Marketing Orders and its popups only.
  The shared Table / Badge / Button / StatCard are not changed, so no other role's screen moves.
*/

/* ------------------------------------------------------------------ colours */

/* The five tile / badge colours. Full class names (not built from strings) so Tailwind can see them. */
export const ALL_STAGE = {
  label: "All orders",
  icon: ClipboardList,
  // hint: "Everything you raised",
  s: {
    tile: "border-blue-700 bg-blue-50",
    icon: "bg-blue-700 text-white",
    num: "text-blue-950",
  },
}

/* ---------------------------------------------------------------- page head */

export function MktHeader({ title, description, children }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-lg leading-snug text-slate-700">{description}</p>}
      </div>
      {children}
    </header>
  )
}

/* ------------------------------------------------------------------ buttons */

const BTN_BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-blue-600/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0"
const BTN_VARIANT = {
  primary: "bg-primary text-white shadow-sm hover:bg-[#6424E300",
  outline: "border-2 border-slate-400 bg-white text-slate-900 hover:bg-slate-100",
  danger: "border-2 border-red-600 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-[#5B21D6] hover:bg-accent",
}
const BTN_SIZE = { md: "h-12 px-5 text-base", sm: "h-10 px-4 text-base", icon: "size-11" }

/** Class string, so a <Link> can look like a button: className={btn("primary")} */
export const btn = (variant = "primary", size = "md", extra) => cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra)

export function MktButton({ variant = "primary", size = "md", className, type = "button", ...p }) {
  return <button type={type} className={btn(variant, size, className)} {...p} />
}

/* -------------------------------------------------------------------- tiles */

/* The grid every row of figures uses: "All orders" is the wide one, then the four stages. */
export const TILE_GRID = "grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-5"
export const TILE_ALL = "col-span-2 xl:col-span-4 2xl:col-span-1"

/**
 * One big figure. Give it `to` (a link) or `onClick` (a filter toggle, `active` marks the chosen one).
 * `stage` is an entry of STAGES or ALL_STAGE.
 */
export function MktTile({ stage, value, loading, active, to, onClick, className }) {
  const Icon = stage.icon
  const body = (
    <>
      <span className={cn("grid size-14 shrink-0 place-items-center rounded-xl", stage.s.icon)}>
        <Icon className="size-7" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold leading-tight text-slate-900">{stage.label}</span>
        <span className={cn("mt-1 block text-5xl font-extrabold leading-none tabular-nums tracking-tight", stage.s.num)}>
          {loading ? <span className="inline-block h-10 w-16 animate-pulse rounded-lg bg-slate-300/70 align-middle" aria-label="Loading" /> : fmtQty(value)}
        </span>
        <span className="mt-2 block text-base leading-snug text-slate-700">{stage.hint}</span>
      </span>
    </>
  )
  const cls = cn(
    "flex min-h-[148px] w-full items-start gap-4 rounded-xl border-2 border-l-[10px] p-5 text-left shadow-sm outline-none transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-4 focus-visible:ring-blue-600/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    stage.s.tile,
    active && "ring-4 ring-slate-900",
    className
  )
  return to ? (
    <Link to={to} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={!!active} className={cls}>{body}</button>
  )
}

/* ------------------------------------------------------------------- status */

/* Solid colour + icon + word, e.g. a green "Approved" with a tick. */
export function MktStatus({ value, className }) {
  const stage = stageOf(value)
  if (!stage) return <span className={cn("inline-flex rounded-full bg-slate-200 px-4 py-1.5 text-base font-bold text-slate-900", className)}>{value || "Unknown"}</span>
  const Icon = stage.icon
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-base font-bold", stage.s.badge, className)}>
      <Icon className="size-5 shrink-0" aria-hidden />
      {stage.label}
    </span>
  )
}

/* -------------------------------------------------------------------- cards */

export function MktPanel({ title, description, to, toLabel, loading, children, className }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 bg-slate-50 px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold leading-tight text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-base text-slate-700">{description}</p>}
        </div>
        {to && (
          <Link to={to} className={btn("ghost", "sm")}>
            {toLabel} <ChevronRight />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200" />)}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

export function MktEmpty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && (
        <span className="mb-5 grid size-16 place-items-center rounded-xl bg-accent text-[#5B21D6]">
          <Icon className="size-8" aria-hidden />
        </span>
      )}
      <p className="text-2xl font-extrabold text-slate-950">{title}</p>
      {children && <div className="mt-2 max-w-lg text-lg text-slate-700">{children}</div>}
    </div>
  )
}

export function MktNotice({ title, children }) {
  return (
    <div role="alert" className="flex gap-4 rounded-xl border-2 border-red-600 bg-red-50 px-5 py-4 text-red-900">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-red-600 text-lg font-extrabold text-white" aria-hidden>!</span>
      <div>
        {title && <p className="text-lg font-bold">{title}</p>}
        {children && <p className="mt-0.5 text-base">{children}</p>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- table */

export const MTable = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-base">{children}</table>
  </div>
)
export const MHead = ({ children }) => <thead className="border-b-2 border-slate-300 bg-slate-100">{children}</thead>
export const MTh = ({ className, ...p }) => (
  <th className={cn("h-14 whitespace-nowrap px-5 text-left align-middle text-sm font-extrabold uppercase tracking-wide text-slate-800", className)} {...p} />
)
export const MTr = ({ className, ...p }) => (
  <tr className={cn("animate-in fade-in border-t-2 border-slate-200 duration-300 first:border-t-0 hover:bg-accent/60", className)} {...p} />
)
export const MTd = ({ className, ...p }) => <td className={cn("px-5 py-5 align-middle text-base text-slate-900", className)} {...p} />

/* Product lines of one order (read-only), in the big type. */
export function MktOrderLines({ items }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-300">
      <MTable>
        <MHead>
          <tr>
            <MTh>Product</MTh>
            <MTh className="text-right">Quantity</MTh>
          </tr>
        </MHead>
        <tbody>
          {items.map((it) => (
            <MTr key={it.product_id}>
              <MTd>
                <p className="text-lg font-bold">{it.name}</p>
                {it.sku && <p className="text-base text-slate-600">{it.sku}</p>}
              </MTd>
              <MTd className="text-right text-xl font-extrabold tabular-nums">{fmtQty(it.quantity)}</MTd>
            </MTr>
          ))}
        </tbody>
      </MTable>
    </div>
  )
}

/* ------------------------------------------------------------------- inputs */

export function MktSearch({ value, onChange, placeholder = "Search" }) {
  return (
    <div className="relative w-full sm:w-96">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-600" aria-hidden />
      <input
        className="h-12 w-full rounded-xl border-2 border-slate-400 bg-white pl-12 pr-11 text-base text-slate-900 outline-none transition-shadow placeholder:text-slate-500 focus-visible:border-blue-700 focus-visible:ring-4 focus-visible:ring-blue-600/25"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-700 hover:bg-slate-200">
          <X className="size-5" />
        </button>
      )}
    </div>
  )
}

/* Form pieces for the New order popup. */
export const MKT_FIELD =
  "h-12 w-full rounded-xl border-2 bg-white px-4 text-base text-slate-900 outline-none transition-shadow placeholder:text-slate-500 focus-visible:ring-4"
export const MKT_FIELD_OK = "border-slate-400 focus-visible:border-blue-700 focus-visible:ring-blue-600/25"
export const MKT_FIELD_BAD = "border-red-600 focus-visible:border-red-600 focus-visible:ring-red-600/25"

export function MktField({ label, htmlFor, error, children }) {
  return (
    <div>
      {label ? (
        <label htmlFor={htmlFor} className="mb-2 block min-h-6 text-base font-bold text-slate-900">{label}</label>
      ) : (
        <span className="mb-2 hidden min-h-6 sm:block" aria-hidden />
      )}
      {children}
      {error && <p id={`${htmlFor}-error`} className="mt-2 text-base font-semibold text-red-700">{error}</p>}
    </div>
  )
}

/* Passed to <Modal className=...>: makes the shared popup's title and subtitle large without touching Modal. */
export const BIG_MODAL = "[&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:text-slate-950 [&_h2+p]:text-base [&_h2+p]:text-slate-700"
