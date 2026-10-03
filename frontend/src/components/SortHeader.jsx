import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { cn } from "../lib/utils"

/** A sortable <th>. `sort` is { key, dir }, `onSort(key)` toggles it. */
export default function SortHeader({ label, k, sort, onSort, align = "left", className }) {
  const active = sort.key === k
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-5 py-2.5 font-medium", align === "right" ? "text-right" : "text-left", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-50")} />
      </button>
    </th>
  )
}
