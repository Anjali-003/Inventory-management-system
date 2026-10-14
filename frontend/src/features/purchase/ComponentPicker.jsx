import { useEffect, useState } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useSearchPurchaseComponentsQuery } from "@/features/purchasing/purchasingApi"
import { cn } from "@/lib/utils"

/*
  Type-ahead component picker for the purchase form (server-side search on name / SKU).
  value = the chosen component ({ id, sku, name, unit }) or null.  usedIds = components already on the list.
  Matches are listed right under the field (not floating), so they can never be cut off inside the dialog.
*/
export default function ComponentPicker({ value, onSelect, onClear, usedIds = [], error }) {
  const [text, setText] = useState("")
  const [debounced, setDebounced] = useState("")
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])

  const { data, isFetching } = useSearchPurchaseComponentsQuery(debounced, { skip: !!value || !focused })
  const rows = data?.rows ?? []

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-[8px] border border-cf-line-strong bg-muted/40 pl-3 pr-1.5 text-[13px]">
        <span className="min-w-0 truncate"><span className="font-medium">{value.name}</span> <span className="text-muted-foreground">{value.sku}</span></span>
        <button type="button" aria-label="Change component" onClick={onClear} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cf-faint" />
        <Input
          className={cn("px-9", error && "border-destructive")}
          placeholder="Search component by name or SKU..."
          aria-label="Component"
          aria-invalid={error ? true : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
        />
      </div>
      {focused && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border bg-card text-[13px]">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{isFetching ? "Searching..." : "No component found"}</li>
          ) : (
            rows.map((c) => {
              const used = usedIds.includes(c.id)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => { onSelect(c); setText(""); setFocused(false) }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{used ? "Already in list" : c.sku}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
