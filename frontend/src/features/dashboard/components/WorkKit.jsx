/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Card, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/*
  Extra pieces for a role dashboard whose work is a list in tabs (Marketing, Production), next to the figures and
  panels of DashboardKit: the work card (WorkCard), the bar of where the open work is (StageBar), Flag, useFlash.
*/

/* a status word with its colour: "4 late" in red, "2 this week" in amber */
export const Flag = ({ tone, children }) => <span className={cn("font-medium", tone === "bad" ? "text-destructive" : "text-warning")}>{children}</span>

/*
  "You landed here": after a figure or link above scrolls the page down to a card, the whole card blinks twice (light
  violet fill and a violet ring, the Tailwind animation animate-card-flash in index.css) so the eye finds it.
  flash() restarts it on every click: the class goes off for one frame, then on again; it goes off by itself at the end.
*/
export function useFlash() {
  const [on, setOn] = useState(false)
  const flash = () => { setOn(false); requestAnimationFrame(() => setOn(true)) }
  // only the card's own animation ends it (the rows inside fade in with animations of their own)
  const onAnimationEnd = (e) => { if (e.target === e.currentTarget) setOn(false) }
  return [{ className: on ? "animate-card-flash" : "", onAnimationEnd }, flash]
}

/*
  The list that needs something, in one card: a tab per kind of work, each with how many are waiting.
  tabs: [{ id, label, count, alert }] (alert: the count shows in red). `pipeline` sits between the title and the tabs.
*/
export function WorkCard({ id = "work", title, tabs, tab, onTab, summary, pipeline, children, footer, flash }) {
  return (
    <Card id={id} className={cn("scroll-mt-20 overflow-hidden", flash?.className)} onAnimationEnd={flash?.onAnimationEnd}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-xs text-lp-muted">{summary}</p>
        </div>
      </div>
      <div className="px-5">{pipeline}</div>
      <div role="tablist" aria-label={title} className="mkt-scroll-x mt-3 flex gap-1 overflow-x-auto border-b px-3">
        {tabs.map((t) => {
          const active = t.id === tab
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onTab(t.id)}
              className={cn("-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-2 py-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:bg-lp-bg active:bg-lp-line/60",
                active ? "border-lp-green text-lp-green" : "border-transparent text-lp-muted hover:border-lp-portal-on hover:bg-lp-tint hover:text-lp-green")}>
              {t.label}
              {t.count != null && <span className={cn("rounded px-1.5 text-[11px] font-semibold tabular-nums", t.alert && t.count ? "bg-rose-50 text-rose-700" : "bg-lp-bg text-lp-muted")}>{t.count}</span>}
            </button>
          )
        })}
      </div>
      <div role="tabpanel">{children}</div>
      {footer && <div className="border-t px-5 py-2.5 text-end">{footer}</div>}
    </Card>
  )
}

/*
  Where the open work is, as one bar: each part as wide as its count, named under the bar with its count.
  stages: [{ id, label, color (a bg- class) }], counts: { [id]: n }. `noun` names what is counted ("open orders").
*/
export function StageBar({ stages, counts, noun }) {
  const total = stages.reduce((sum, p) => sum + (counts[p.id] || 0), 0)
  if (!total) return null
  return (
    <div className="mt-3">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-lp-bg" role="img"
        aria-label={`${total} ${noun}: ${stages.map((p) => `${p.label} ${counts[p.id] || 0}`).join(", ")}`}>
        {stages.map((p) => counts[p.id] > 0 && (
          <span key={p.id} title={`${p.label}: ${counts[p.id]}`} className={cn("h-full first:rounded-s-full last:rounded-e-full", p.color)} style={{ width: `${(counts[p.id] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-lp-muted" aria-hidden>
        {stages.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-1.5", !counts[p.id] && "opacity-50")}>
            <span className={cn("size-2 rounded-full", p.color)} />{p.label} <b className="font-semibold text-lp-ink tabular-nums">{counts[p.id] || 0}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
