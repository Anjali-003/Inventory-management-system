/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CheckCircle2, ChevronRight } from "lucide-react"
import { Modal } from "@/components/Modal"
import PageHeader from "@/components/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard } from "@/components/HistoryUI"
import { useGetMeQuery } from "@/core/auth/authApi"
import { cn } from "@/lib/utils"

/*
  THE dashboard look (the Super Admin's), shared by every role's dashboard so they all read the same way:

    <Greeting description="the one thing to do next">   "Hello, <name>", one line, at most one primary button
    <StatRow stats={...} />                             4-5 figures, each answers one question and opens its list
    grid of <Panel> / <ListPanel>                        the lists and figures behind them; "All 5 ›" links
                                                         at the top right, a one-line note when a list is empty

  A ROW is { id, title, sub, badge: { variant, label }, right, detail }:
    detail = (close) => <Modal .../>   the popup that opens when the row is clicked (optional)
    to     = "/some/page"              go straight to that page when the row is clicked (used instead of detail)
  Clicking a stat card opens a popup listing its rows; clicking a row inside it (or in a panel) opens that row's popup.
  Closing a row popup that was opened from a list brings the list back.
*/

export function Greeting({ description, children }) {
  const { data: me } = useGetMeQuery()
  return <PageHeader title={me?.name ? `Hello, ${me.name}` : "Hello"} description={description}>{children}</PageHeader>
}

/* The link at the top right of a panel: "All late ›". A link with `to`, a button with `onClick`. */
export function PanelLink({ to, onClick, children }) {
  const cls = "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-lp-tint focus-visible:ring-2 focus-visible:ring-lp-green/40"
  return to
    ? <Link to={to} className={cls}>{children}<ChevronRight className="size-3.5" /></Link>
    : <button type="button" onClick={onClick} className={cls}>{children}<ChevronRight className="size-3.5" /></button>
}

/* What an empty list says, in one line (no big empty box): "Nothing is stuck." */
export function EmptyLine({ children }) {
  return <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground"><CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />{children}</p>
}

/*
  A titled card: title and one line of help, a link at the top right, then its content.
  `flush`: the content runs to the card's edges (a list of rows); otherwise it gets the card's padding.
*/
export function Panel({ title, description, to, toLabel, action, children, className, flush = false }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="items-center">
        <div className="min-w-0"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
        {action ?? (to && <PanelLink to={to}>{toLabel}</PanelLink>)}
      </CardHeader>
      {flush ? children : <div className="px-5 pb-5">{children}</div>}
    </Card>
  )
}

/* One figure in a Panel: label (and a muted line under it) on the left, the value on the right; a link with `to`. */
export function Line({ label, value, bad, sub, to }) {
  const body = (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">{label}{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
      <span className={cn("shrink-0 font-semibold tabular-nums", bad && "text-destructive")}>{value}</span>
    </div>
  )
  return to ? <Link to={to} className="-mx-2 block rounded-md px-2 hover:bg-muted/60">{body}</Link> : body
}

const openable = (r) => !!(r.detail || r.to)

export function useDrill() {
  const navigate = useNavigate()
  const [list, setList] = useState(null) // { title, description, rows, to, toLabel, empty }
  const [row, setRow] = useState(null)
  const openRow = (r) => (r?.to ? navigate(r.to) : setRow(r)) // a row with `to` skips the popup
  return { openList: setList, openRow, host: <DrillHost list={list} row={row} onOpenRow={setRow} onCloseList={() => setList(null)} onCloseRow={() => setRow(null)} /> }
}

function RowButton({ row, onOpen }) {
  const clickable = openable(row)
  const Tag = clickable ? "button" : "div"
  return (
    <Tag
      {...(clickable ? { type: "button", onClick: () => onOpen(row) } : {})}
      className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left outline-none transition-colors enabled:hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{row.title}</p>
        {row.sub && <p className="truncate text-xs text-muted-foreground">{row.sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.right != null && <span className="text-sm font-semibold tabular-nums">{row.right}</span>}
        {row.badge && <Badge variant={row.badge.variant}>{row.badge.label}</Badge>}
        {clickable && <ChevronRight className="size-4 text-muted-foreground" />}
      </div>
    </Tag>
  )
}

function DrillHost({ list, row, onOpenRow, onCloseList, onCloseRow }) {
  const navigate = useNavigate()
  return (
    <>
      <Modal
        open={!!list && !row}
        onClose={onCloseList}
        size="lg"
        title={list?.title || ""}
        description={list?.description}
        footer={
          <>
            <Button type="button" variant="outline" size="lg" onClick={onCloseList} data-autofocus>Close</Button>
            {list?.to && <Button size="lg" onClick={() => { onCloseList(); navigate(list.to) }}>{list.toLabel || "Open page"}</Button>}
          </>
        }
      >
        {list && (list.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{list.empty || "Nothing here right now"}</p>
        ) : (
          <div className="-mx-5 -my-4 max-h-[60vh] divide-y overflow-y-auto">
            {list.rows.map((r) => <RowButton key={r.id} row={r} onOpen={onOpenRow} />)}
          </div>
        ))}
      </Modal>
      {row?.detail?.(onCloseRow)}
    </>
  )
}

/*
  Top-of-page figures (4 or 5 in a row). Each one goes to its page (`to`), does something on this page (`onClick`,
  with `active` while its list is the one shown below), or opens a popup with the records behind it (`drill`).
  Optional per figure: `chart` (a small chart beside the number), `title` (a hover note).
*/
export function StatRow({ stats, drill, cols }) {
  const shown = stats.filter(Boolean)
  const grid = cols ?? (shown.length >= 5 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-4")
  return (
    <div className={`grid gap-4 ${grid}`}>
      {shown.map((s, i) => (
        <StatCard
          key={s.label}
          index={i}
          icon={s.icon}
          tone={s.tone}
          label={s.label}
          value={s.value}
          detail={s.detail}
          loading={s.loading}
          chart={s.chart}
          title={s.title}
          active={s.active}
          to={s.onClick ? undefined : s.to}
          onClick={s.onClick ?? (!s.to && s.drill ? () => drill.openList(s.drill) : undefined)}
        />
      ))}
    </div>
  )
}

/* Opt-in look for a ListPanel (`table` prop): a compact table from 768px, short tap-to-open cards on a phone. */
function RowTable({ rows, onOpen, rightLabel }) {
  const hasRight = rows.some((r) => r.right != null)
  return (
    <Table data-cards="off">
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          {hasRight && <TableHead className="text-right">{rightLabel || "Value"}</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right"><span className="sr-only">Open</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} onClick={openable(r) ? () => onOpen(r) : undefined} className={openable(r) ? "cursor-pointer" : undefined}>
            <TableCell className="min-w-40 whitespace-normal">
              {openable(r) ? (
                <button type="button" onClick={() => onOpen(r)} className="break-words text-left font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{r.title}</button>
              ) : (
                <p className="break-words font-semibold">{r.title}</p>
              )}
              {r.sub && <p className="break-words text-xs text-muted-foreground">{r.sub}</p>}
            </TableCell>
            {hasRight && <TableCell className="text-right font-semibold tabular-nums">{r.right ?? "-"}</TableCell>}
            <TableCell>{r.badge ? <Badge variant={r.badge.variant}>{r.badge.label}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
            <TableCell className="text-right">{openable(r) && <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RowCards({ rows, onOpen, rightLabel }) {
  return (
    <ul className="grid gap-3 p-3 sm:p-4">
      {rows.map((r) => (
        <li key={r.id} className="relative rounded-xl border border-border bg-card transition-colors duration-200 hover:border-lp-rule">
          {openable(r) && <button type="button" onClick={() => onOpen(r)} aria-label={`Open ${r.title}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />}
          <div className="pointer-events-none relative p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-[15px] font-semibold leading-snug">{r.title}</span>
              {r.badge && <Badge variant={r.badge.variant} className="shrink-0">{r.badge.label}</Badge>}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                {r.sub && <p className="break-words text-xs text-muted-foreground">{r.sub}</p>}
                {r.right != null && <p className="mt-0.5 text-[13px] font-medium tabular-nums">{rightLabel ? `${rightLabel}: ` : ""}{r.right}</p>}
              </div>
              {openable(r) && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/*
  A card with the first few rows of a list. Top right: "All 12 ›" (the whole list in a popup) when there are more,
  else a link to the page (`to`, `toLabel`). Empty: one line (`empty`).
*/
export function ListPanel({ drill, title, description, rows, limit = 5, loading, empty, to, toLabel, className, table = false, rightLabel }) {
  const shown = rows.slice(0, limit)
  return (
    <Card className={`overflow-hidden ${className || ""}`}>
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {rows.length > limit
          ? <PanelLink onClick={() => drill.openList({ title, description, rows, to, toLabel, empty })}>All {rows.length}</PanelLink>
          : to && <PanelLink to={to}>{toLabel || "Open"}</PanelLink>}
      </CardHeader>
      {loading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyLine>{empty || "Nothing here right now."}</EmptyLine>
      ) : table ? (
        <>
          <div className="hidden md:block"><RowTable rows={shown} onOpen={drill.openRow} rightLabel={rightLabel} /></div>
          <div className="md:hidden"><RowCards rows={shown} onOpen={drill.openRow} rightLabel={rightLabel} /></div>
        </>
      ) : (
        <div className="divide-y">
          {shown.map((r) => <RowButton key={r.id} row={r} onOpen={drill.openRow} />)}
        </div>
      )}
    </Card>
  )
}

/* Label/value popup for records that have no page of their own (a component, a finished-goods batch ...). */
export function InfoModal({ title, description, badge, fields, onClose }) {
  return (
    <Modal open onClose={onClose} size="md" title={title} description={description} footer={<Button type="button" variant="outline" size="lg" onClick={onClose} data-autofocus>Close</Button>}>
      {badge && <div className="mb-3"><Badge variant={badge.variant}>{badge.label}</Badge></div>}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{value ?? "-"}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
