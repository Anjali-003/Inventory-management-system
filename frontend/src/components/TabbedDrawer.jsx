import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING } from "@/features/marketing-orders/mktMotion"
import { cn } from "@/lib/utils"

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/*
  Right-side drawer with tabs. Same look and behaviour as the Marketing / Operations order drawer
  (focus trap, Escape, scroll lock, arrow keys on the tabs, slide in/out), but it knows nothing about orders:

    <TabbedDrawer
      open                     // false keeps it closed (the slide-out still plays)
      eyebrow="Purchase details"
      title="PO-0012"
      subtitle={<>...pill, counts...</>}
      tabs={[{ id, label, badge? }]}   // badge = small number next to the label
      tab="overview" onTab={setTab}
      tabContent={{ overview: <.../>, components: <.../> }}
      actions={<MktBtn/>}      // right side of the footer, next to Close
      footerStart={<MktBtn/>}  // left side of the footer
      onClose={...}
    />
*/

function Panel({ eyebrow, title, subtitle, tabs = [], tab, onTab, tabContent, actions, footerStart, onClose }) {
  const ref = useRef(null)
  const bodyRef = useRef(null)
  const uid = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl"
  const offscreen = `${rtl ? -100 : 100}%`

  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement
    const body = document.body
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = "hidden"
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    ;(el.querySelector("[data-autofocus]") || el).focus()

    const onKey = (e) => {
      if (e.key === "Escape") { closeRef.current(); return }
      if (e.key !== "Tab") return
      const nodes = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (nodes.length === 0) { e.preventDefault(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      body.style.overflow = before.overflow
      body.style.paddingRight = before.paddingRight
      if (previous && previous.focus) previous.focus()
    }
  }, [])

  // a new tab starts at the top
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0 }, [tab])

  const tabId = (id) => `${uid}-tab-${id}`
  const panelId = (id) => `${uid}-panel-${id}`

  const onTabKey = (e) => {
    const i = tabs.findIndex((t) => t.id === tab)
    const n = tabs.length
    const next = rtl ? -1 : 1
    let to = null
    if (e.key === "ArrowRight") to = (i + next + n) % n
    else if (e.key === "ArrowLeft") to = (i - next + n) % n
    else if (e.key === "Home") to = 0
    else if (e.key === "End") to = n - 1
    if (to === null) return
    e.preventDefault()
    onTab(tabs[to].id)
    document.getElementById(tabId(tabs[to].id))?.focus()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-[#101a17]/45 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current() }}
    >
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        className="absolute inset-y-0 end-0 flex w-full flex-col bg-card shadow-[-24px_0_64px_-12px_rgba(16,26,23,0.35)] outline-none ring-1 ring-[#E3E6EB] sm:max-w-xl"
        initial={{ x: offscreen }}
        animate={{ x: 0 }}
        exit={{ x: offscreen }}
        transition={SPRING}
      >
        <div className="flex items-start justify-between gap-4 border-b bg-gradient-to-r from-emerald-50/70 via-white to-white px-5 pt-4">
          <div className="min-w-0 pb-3">
            {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">{eyebrow}</p>}
            <h2 id={`${uid}-title`} className="mt-0.5 truncate text-[17px] font-bold leading-snug tracking-[-0.2px] tabular-nums">{title}</h2>
            {subtitle && <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            type="button"
            aria-label="Close details"
            data-autofocus
            onClick={onClose}
            className="-me-1.5 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="size-4" />
          </button>
        </div>

        {tabs.length > 0 && (
        <div role="tablist" aria-label="Sections" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b px-3">
          {tabs.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={panelId(t.id)}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.badge != null && (
                  <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums", active ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600")}>{t.badge}</span>
                )}
                {active && <motion.span layoutId={`${uid}-ink`} transition={SPRING} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
        )}

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <motion.div
            key={tab}
            id={panelId(tab)}
            role={tabs.length > 0 ? "tabpanel" : "region"}
            aria-labelledby={tabs.length > 0 ? tabId(tab) : `${uid}-title`}
            tabIndex={0}
            className="outline-none"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: SPRING }}
          >
            {tabContent?.[tab]}
          </motion.div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-cf-head px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end">
          {footerStart}
          <MktBtn onClick={onClose} className={footerStart || actions ? "sm:me-auto" : undefined}>Close</MktBtn>
          {actions}
        </div>
      </motion.aside>
    </motion.div>
  )
}

export default function TabbedDrawer({ open, ...props }) {
  if (typeof document === "undefined") return null
  return createPortal(<AnimatePresence>{open && <Panel key="tabbed-drawer" {...props} />}</AnimatePresence>, document.body)
}

/* Small label + value box used inside drawer tabs. */
export function Fact({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-sm font-medium">{children}</dd>
    </div>
  )
}
