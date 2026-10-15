/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Modal } from "@/components/Modal"
import PageHeader from "@/components/PageHeader"
import { EmptyState } from "@/components/feedback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/HistoryUI"
import { useGetMeQuery } from "@/features/auth/authApi"

/*
  Building blocks shared by every role's dashboard.

  A ROW is { id, title, sub, badge: { variant, label }, right, detail }:
    detail = (close) => <Modal .../>   the popup that opens when the row is clicked (optional)
  Clicking a stat card opens a popup listing its rows; clicking a row inside it (or in a panel) opens that row's popup.
  Closing a row popup that was opened from a list brings the list back.
*/

export function Greeting({ description, children }) {
  const { data: me } = useGetMeQuery()
  return <PageHeader title={me?.name ? `Hello, ${me.name}` : "Hello"} description={description}>{children}</PageHeader>
}

export function useDrill() {
  const [list, setList] = useState(null) // { title, description, rows, to, toLabel, empty }
  const [row, setRow] = useState(null)
  return { openList: setList, openRow: setRow, host: <DrillHost list={list} row={row} onOpenRow={setRow} onCloseList={() => setList(null)} onCloseRow={() => setRow(null)} /> }
}

function RowButton({ row, onOpen }) {
  const clickable = !!row.detail
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
          <EmptyState title={list.empty || "Nothing here right now"} />
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

/* Top-of-page figures. Each one opens a popup with the records behind the number. */
export function StatRow({ stats, drill, cols = "sm:grid-cols-2 xl:grid-cols-4" }) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {stats.map((s, i) => (
        <StatCard
          key={s.label}
          index={i}
          icon={s.icon}
          tone={s.tone}
          label={s.label}
          value={s.value}
          detail={s.detail}
          loading={s.loading}
          onClick={() => drill.openList(s.drill)}
        />
      ))}
    </div>
  )
}

/* A card with the first few rows of a list; "View all" opens the full list in a popup. */
export function ListPanel({ drill, title, description, rows, limit = 5, loading, empty, emptyIcon, to, toLabel, className }) {
  const shown = rows.slice(0, limit)
  return (
    <Card className={`overflow-hidden ${className || ""}`}>
      <CardHeader className="items-center">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {rows.length > limit && (
          <Button variant="ghost" size="sm" onClick={() => drill.openList({ title, description, rows, to, toLabel, empty })}>
            View all ({rows.length})
          </Button>
        )}
      </CardHeader>
      {loading ? (
        <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState icon={emptyIcon} title={empty || "Nothing here right now"} />
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
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{value ?? "-"}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
