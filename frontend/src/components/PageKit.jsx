/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/*
  The one look of the app, taken from the home page: white surfaces, thin lp-line borders, one solid violet for the
  main action, the Geist heading font and a few fixed text sizes. No gradients, no glow.

  Every shared piece draws from here (PageHeader, MktHero, Button, MktBtn, HeroButton, CfButton, Card, Panel), so a
  change made here reaches every page.

  Text sizes (and nothing in between): title 28/32px · section 16px · body 14px · small 13px · tiny 12px
*/

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-lp-green focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg"
export const PRESS = { scale: 0.98, transition: { type: "spring", duration: 0.18, bounce: 0 } }

/** The surface of every card and panel. */
export const SURFACE = "rounded-2xl border border-lp-line bg-white shadow-[0_1px_2px_rgba(16,33,28,0.04)]"

/** Page title: small violet eyebrow, big heading, one line of help, buttons on the right. */
export function PageHeader({ eyebrow, title, description, children, className }) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-semibold text-lp-green">{eyebrow}</p>}
        <h1 className={cn("font-lp-head text-[28px] font-bold leading-tight tracking-tight text-balance text-lp-ink sm:text-[32px]", eyebrow && "mt-1")}>{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-pretty text-lp-muted sm:text-base">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

const BTN_BASE = `inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-600 [&_svg]:size-4 [&_svg]:shrink-0 ${FOCUS}`
const BTN_VARIANT = {
  primary: "bg-lp-green text-white hover:bg-lp-green-dark",
  outline: "border border-lp-line bg-white text-lp-ink hover:border-lp-rule hover:bg-lp-bg",
  danger: "border border-lp-line bg-white text-destructive hover:border-destructive/30 hover:bg-cf-red-soft",
  ghost: "text-lp-green hover:bg-lp-tint",
}
const BTN_SIZE = { md: "h-11 px-4 sm:h-9 sm:px-3.5", sm: "h-9 px-3", icon: "size-11 sm:size-9" }

/** Class string of a button, for things that are not a <PageButton> (links, other button components). */
export const pageButtonClass = (variant = "outline", size = "md") => cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size])

/** variant: primary (one per area) · outline · danger · ghost.  size: md · sm · icon */
export function PageButton({ variant = "outline", size = "md", className, type = "button", ...p }) {
  return <motion.button type={type} whileTap={PRESS} className={cn(pageButtonClass(variant, size), className)} {...p} />
}

/** White surface with a thin border, the same as the home page cards. */
export function Panel({ as: Tag = "div", className, ...p }) {
  return <Tag className={cn(SURFACE, className)} {...p} />
}

/* soft icon colours, written out whole so Tailwind sees them */
export const TINT = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  rose: "bg-rose-50 text-rose-800 ring-rose-200",
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  violet: "bg-lp-tint text-lp-green ring-lp-portal-on/50",
  purple: "bg-lp-tint text-lp-green ring-lp-portal-on/50",
}

/** Soft colour of a stage's icon: its own `s.pill`, else the colour named in its gradient or dot. */
export function tintOf(stage) {
  if (stage?.s?.pill) return stage.s.pill
  const name = `${stage?.s?.grad ?? ""} ${stage?.dot ?? ""}`.match(/(slate|amber|orange|sky|blue|indigo|emerald|teal|rose|red|violet|purple)-/)
  return TINT[name?.[1]] ?? TINT.slate
}

const RISE = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.4, bounce: 0 } } }

/**
  One big figure on a white tile: soft coloured icon, the number, a label and one line of help.
  Give it `to` (a link) or `onClick` (a filter: `active` marks the chosen one with a violet border).
  `toggle` = it is a filter, so it reports aria-pressed. Children of a stagger parent rise in one after another.
*/
export function FigureTile({ icon: Icon, label, hint, tint, value, loading, active, to, onClick, toggle = true, className }) {
  const body = (
    <>
      <span className="flex items-start justify-between">
        <span className={cn("grid size-10 place-items-center rounded-xl ring-1 ring-inset", tint)}>
          <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
        </span>
        {(to || onClick) && <ArrowUpRight aria-hidden className="size-4 text-lp-muted transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-lp-green" />}
      </span>
      <span className="mt-4 block">
        <span className="block text-[28px] font-bold leading-none tracking-tight text-lp-ink tabular-nums">
          {loading ? <span className="inline-block h-7 w-14 animate-pulse rounded-md bg-slate-200/80 align-middle" aria-label="Loading" /> : value}
        </span>
        <span className="mt-2 block text-[13px] font-semibold leading-tight text-lp-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-lp-muted">{hint}</span>}
      </span>
    </>
  )
  const cls = cn(
    SURFACE,
    "group relative block w-full p-4 text-start transition-[border-color,box-shadow] duration-200",
    FOCUS,
    active ? "border-lp-green ring-2 ring-lp-green/20" : "hover:border-lp-rule"
  )
  return (
    <motion.div variants={RISE} whileTap={PRESS} className={className}>
      {to ? (
        <Link to={to} className={cls}>{body}</Link>
      ) : (
        <button type="button" onClick={onClick} {...(toggle ? { "aria-pressed": !!active } : {})} className={cls}>{body}</button>
      )}
    </motion.div>
  )
}

/**
  One row of filter tabs with their counts. Scrolls sideways on a phone; the selected tab slides.
  items: [{ key, label, value, active, onClick }]
*/
export function FilterTabs({ items, label, layoutId = "page-filter", className }) {
  return (
    <div role="group" aria-label={label} className={cn("mkt-scroll-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <div className="inline-flex gap-1 rounded-xl border border-lp-line bg-white p-1">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            aria-pressed={!!it.active}
            onClick={it.onClick}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors",
              FOCUS,
              it.active ? "text-white" : "text-lp-text hover:bg-lp-bg hover:text-lp-ink"
            )}
          >
            {it.active && <motion.span layoutId={layoutId} transition={{ type: "spring", duration: 0.35, bounce: 0 }} className="absolute inset-0 rounded-lg bg-lp-green" />}
            <span className="relative">{it.label}</span>
            <span className={cn("relative min-w-5 rounded-full px-1.5 text-xs tabular-nums", it.active ? "bg-white/20 text-white" : "bg-lp-bg text-lp-muted")}>{it.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
