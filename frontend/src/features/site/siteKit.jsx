/* eslint-disable react-refresh/only-export-components */
import { motion } from "motion/react"

/*
  Shared look of the public pages (home, about, contact): spacing, type, focus ring, the soft motion curve and the
  scroll reveal. Colours come from the lp-* tokens in index.css.
*/
export const EASE = [0.32, 0.72, 0, 1]
export const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6"
export const heading = "font-lp-head tracking-tight text-lp-ink text-balance"
export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-lp-green focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg"
export const ease = "transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
export const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-lg bg-lp-green px-3 py-2 text-base font-semibold text-white ${ease} hover:bg-lp-green-dark hover:-translate-y-0.5 active:translate-y-px active:scale-[0.98] ${focusRing}`

const MOTION_TAGS = { div: motion.div, li: motion.li, section: motion.section }

/*
  Fades up out of a soft blur as it scrolls into view. `immediate` = it is on screen when the page opens (hero, page
  title): it animates right away instead of waiting for the scroll trigger, so the first thing people see is never
  held back by it (a slow phone, a stalled tab).
*/
const SHOWN = { opacity: 1, y: 0, filter: "blur(0px)" }
export function Reveal({ children, delay = 0, className, as = "div", immediate = false, ...rest }) {
  const M = MOTION_TAGS[as]
  const show = immediate ? { animate: SHOWN } : { whileInView: SHOWN, viewport: { once: true, amount: 0.2 } }
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 64, filter: "blur(12px)" }}
      {...show}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </M>
  )
}

export function SectionHead({ eyebrow, title, text, as: Tag = "h2" }) {
  return (
    <Reveal className="mb-12 max-w-2xl">
      <p className="text-sm font-semibold text-lp-green">{eyebrow}</p>
      <Tag className={`${heading} mt-2 text-3xl font-bold sm:text-4xl`}>{title}</Tag>
      {text && <p className="mt-3 text-lg text-pretty text-lp-muted">{text}</p>}
    </Reveal>
  )
}
