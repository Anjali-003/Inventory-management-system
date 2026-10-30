/*
  The Saturday look (2026-10-24) of the page title, buttons and figure tiles, kept for the Production, Quality Control
  and Finished Goods screens, which stay as they were on Saturday. The rest of the app uses components/PageKit.
  Copied from sales/marketing-orders/mktKit.jsx as it was in commit 9efc4bd. Do not restyle it to the new look.
*/
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import { CountUp } from "@/components/HistoryUI"
import { cn } from "@/lib/utils"
import { PRESS, PRESS_SOFT, SPRING_SOFT, rise, stagger } from "@/sales/marketing-orders/mktMotion"

export { SearchField } from "@/sales/marketing-orders/mktKit"

/** Gradient banner at the top of a page: eyebrow, big title, one line of help, buttons on the right. */
export function MktHero({ eyebrow, title, description, children, className }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: SPRING_SOFT }}
      className={cn(
        "relative mb-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#7A35FF] via-[#6424E3] to-[#3E1494] p-5 text-white shadow-[0_18px_40px_-18px_rgba(122,53,255,0.75)] sm:mb-6 sm:p-7",
        className
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -end-10 -top-16 size-52 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 start-1/3 size-52 rounded-full bg-amber-300/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/95">{eyebrow}</p>}
          <h1 className="break-words text-[26px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[34px]">{title}</h1>
          {description && <p className="mt-2 max-w-xl text-[13px] leading-snug text-white/95 sm:text-[15px]">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </motion.header>
  )
}

const HERO_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#6424E3] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0"
const HERO_VARIANT = {
  solid: "bg-white text-[#5B21D6] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35)] hover:bg-white/95",
  glass: "bg-black/20 text-white ring-1 ring-inset ring-white/40 backdrop-blur-md hover:bg-black/30",
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
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-100 disabled:bg-none disabled:bg-slate-200 disabled:text-slate-600 disabled:shadow-none disabled:border-transparent [&_svg]:size-4 [&_svg]:shrink-0"
const BTN_VARIANT = {
  primary: "bg-gradient-to-br from-[#7A35FF] to-[#5B21D6] text-white shadow-[0_8px_18px_-8px_rgba(122,53,255,0.7)] hover:brightness-110",
  outline: "border border-cf-line-strong bg-card text-foreground hover:bg-muted",
  danger: "bg-cf-red-soft text-destructive hover:bg-destructive/15",
  ghost: "text-primary hover:bg-accent",
}
const BTN_SIZE = { md: "h-11 px-4 sm:h-9 sm:px-3.5", sm: "h-9 px-3", icon: "size-11 sm:size-9" }

export function MktBtn({ variant = "outline", size = "md", className, type = "button", ...p }) {
  return <motion.button type={type} whileTap={PRESS} className={cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} {...p} />
}

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
            className={cn("size-4 transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5", on ? "text-white/95" : "text-slate-400 group-hover:text-primary")}
          />
        )}
      </span>

      <span className="relative mt-4 block">
        <span className={cn("block text-[30px] font-bold leading-none tracking-[-0.04em] tabular-nums transition-colors duration-300", on ? "text-white" : "text-foreground")}>
          {loading ? <span className="inline-block h-7 w-14 animate-pulse rounded-md bg-slate-200/80 align-middle" aria-label="Loading" /> : <CountUp value={value} />}
        </span>
        <span className={cn("mt-2 block text-[13px] font-semibold leading-tight transition-colors duration-300", on ? "text-white" : "text-foreground")}>{stage.label}</span>
        <span className={cn("mt-0.5 block text-[11px] leading-snug transition-colors duration-300", on ? "text-white/95" : "text-muted-foreground")}>{stage.hint}</span>
      </span>
    </>
  )

  const cls = cn(
    "group relative block w-full overflow-hidden rounded-2xl border p-4 text-start outline-none transition-[box-shadow,border-color] duration-300 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
    on ? cn("border-transparent shadow-lg", stage.s.glow) : "border-border bg-card shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] hover:shadow-md"
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

