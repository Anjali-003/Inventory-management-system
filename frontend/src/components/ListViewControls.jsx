import { useState } from "react"
import { ArrowDownWideNarrow, Check, LayoutGrid, SlidersHorizontal, Table2, X } from "lucide-react"

const iconButton = "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-slate-700 shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
const fieldClass = "mt-1.5 h-9 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"

/** Shared search-adjacent filter, sort, and one-button view switch for operational lists. */
export default function ListViewControls({
  view = "cards",
  onViewChange,
  sortBy,
  onSortChange,
  sortOptions = [],
  filters = [],
  onClearFilters,
  hasActiveFilters = false,
}) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const expanded = filterOpen || sortOpen
  const switchTo = view === "table" ? "cards" : "table"
  const ViewIcon = switchTo === "table" ? Table2 : LayoutGrid

  return (
    <div className={`min-w-0 ${expanded ? "basis-full w-full" : "shrink-0"}`}>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" className={iconButton} title="Filter records" aria-label="Filter records" aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false) }}>
          <SlidersHorizontal className="size-4" aria-hidden />
          {hasActiveFilters && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />}
        </button>
        <button type="button" className={iconButton} title="Sort records" aria-label="Sort records" aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false) }}>
          <ArrowDownWideNarrow className="size-4" aria-hidden />
        </button>
        <button type="button" className={`${iconButton} hidden lg:inline-flex`} title={`Switch to ${switchTo} view`} aria-label={`Switch to ${switchTo} view`} onClick={() => onViewChange?.(switchTo)}>
          <ViewIcon className="size-4" aria-hidden />
        </button>
      </div>

      {sortOpen && (
        <section className="mt-2 rounded-xl border border-border bg-white p-3 shadow-sm" aria-label="Sort records">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Sort by</p>
            <button type="button" onClick={() => setSortOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close sort options"><X className="size-4" /></button>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {sortOptions.map((option) => {
              const selected = sortBy === option.value
              return <button key={option.value} type="button" onClick={() => { onSortChange?.(option.value); setSortOpen(false) }} className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-transparent text-slate-700 hover:bg-slate-50"}`}>
                <span className="break-words">{option.label}</span>{selected && <Check className="size-4 shrink-0" aria-hidden />}
              </button>
            })}
          </div>
        </section>
      )}

      {filterOpen && (
        <section className="mt-2 rounded-xl border border-border bg-white p-3 shadow-sm" aria-label="Filter records">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Filter records</p>
            <button type="button" onClick={() => setFilterOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close filters"><X className="size-4" /></button>
          </div>
          {filters.length ? <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filters.map((filter) => <label key={filter.key} className="block min-w-0 text-xs font-semibold text-slate-600">
              {filter.label}
              {filter.type === "date" ? (
                <input type="date" value={filter.value || ""} onChange={(event) => filter.onChange?.(event.target.value)} className={fieldClass} />
              ) : (
                <select value={filter.value ?? "all"} onChange={(event) => filter.onChange?.(event.target.value)} className={fieldClass}>
                  {(filter.options || []).map((option) => {
                    const normalized = typeof option === "string" ? { value: option, label: option } : option
                    return <option key={normalized.value} value={normalized.value}>{normalized.label}</option>
                  })}
                </select>
              )}
            </label>)}
          </div> : <p className="text-sm text-slate-500">No extra filters are available for this list.</p>}
          <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
            <button type="button" onClick={() => { onClearFilters?.(); setFilterOpen(false) }} className="rounded-lg px-3 py-2 text-xs font-bold text-accent-foreground hover:bg-accent">Clear filters</button>
          </div>
        </section>
      )}
    </div>
  )
}
