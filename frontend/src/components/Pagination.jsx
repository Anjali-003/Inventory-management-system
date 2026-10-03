import { ChevronLeft, ChevronRight } from "lucide-react"

export default function Pagination({ page, pageSize, total, onPage, noun = "results" }) {
  if (total <= 0) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const btn =
    "grid size-8 place-items-center rounded-md border bg-background text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground">
      <p>
        Showing <span className="font-medium text-foreground tabular-nums">{from}-{to}</span> of <span className="font-medium text-foreground tabular-nums">{total}</span> {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></button>
          <span className="min-w-20 text-center tabular-nums">Page {page} of {pages}</span>
          <button type="button" className={btn} aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
