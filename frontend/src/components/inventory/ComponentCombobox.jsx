import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Plus, Search, X } from "lucide-react"
import api from "../../api/api"
import { cn } from "../../lib/utils"
import { fmtQty } from "../../lib/stock"

const LIMIT = 8

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Bolds the part of `text` that matches what the user typed. */
function Highlight({ text, tokens }) {
  if (!tokens.length) return text
  const parts = String(text).split(new RegExp(`(${tokens.map(escapeRe).join("|")})`, "i"))
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="bg-transparent font-semibold text-foreground">{part}</mark> : part
  )
}

function stockHint(c) {
  if (c.inventory_id == null) return "Not stocked yet"
  if (c.is_active === 0) return "Archived"
  return `${fmtQty(c.quantity_on_hand)} ${c.unit} on hand`
}

/**
 * Type-ahead component picker. Only a handful of matches are ever fetched/shown; typing narrows
 * them (server-side search on name and SKU). The last row always offers "Create new component",
 * so a part that does not exist yet can be added without leaving the dialog.
 *
 * value: the selected component option (or null)   onSelect(option)   onClear()   onCreate(typedText)
 * inListIds: ids already in the receipt list (shown as "In list")
 */
const ComponentCombobox = forwardRef(function ComponentCombobox(
  { id, value, onSelect, onClear, onCreate, error, disabled, locked, inListIds, "aria-describedby": describedBy },
  ref
) {
  const inputRef = useRef(null)
  const wasSelected = useRef(false)
  const listId = useId()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState(null)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  // give the field focus back when the chip is cleared via the "x" button
  useEffect(() => {
    if (!value && wasSelected.current) inputRef.current?.focus()
    wasSelected.current = !!value
  }, [value])

  // server-side search, debounced; stale responses are ignored
  useEffect(() => {
    if (!open || value) return
    let stale = false
    setLoading(true)
    const timer = setTimeout(
      () => {
        api
          .get("/inventory/components", { params: { q: query.trim() || undefined, limit: LIMIT } })
          .then((r) => {
            if (stale) return
            setRows(r.data.rows)
            setTotal(r.data.total)
            setFailed(false)
            setActive(0)
          })
          .catch(() => !stale && setFailed(true))
          .finally(() => !stale && setLoading(false))
      },
      query ? 180 : 0
    )
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, open, value])

  // the list is portalled (the dialog body scrolls and would clip it), so it follows the input
  const place = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ left: r.left, width: r.width, top: r.top, bottom: r.bottom })
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])

  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  const options = [...rows.map((row) => ({ kind: "row", row })), { kind: "create" }]

  const choose = (i) => {
    const o = options[i]
    if (!o) return
    setOpen(false)
    if (o.kind === "create") {
      const text = query.trim()
      setQuery("")
      onCreate(text)
    } else {
      setQuery("")
      onSelect(o.row)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) return setOpen(true)
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
    } else if (e.key === "Enter" && open && !loading) {
      e.preventDefault()
      e.stopPropagation()
      choose(active)
    } else if (e.key === "Escape" && open) {
      // close the list first; a second Escape then closes the dialog
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === "Tab") {
      setOpen(false)
    }
  }

  if (value) {
    return (
      <div
        id={id}
        className={cn(
          "flex min-h-9 items-center justify-between gap-2 rounded-md border bg-background px-3 py-1.5 text-sm",
          error ? "border-destructive" : "border-input"
        )}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {value.sku} · {stockHint(value)}
            {value.is_active === 0 && " · will be reactivated"}
          </p>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            aria-label="Change component"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    )
  }

  const spaceBelow = rect ? window.innerHeight - rect.bottom - 12 : 0
  const up = rect && spaceBelow < 230 && rect.top > spaceBelow
  const popStyle = rect
    ? up
      ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(340, rect.top - 12) }
      : { left: rect.left, width: rect.width, top: rect.bottom + 4, maxHeight: Math.min(340, Math.max(spaceBelow, 160)) }
    : null

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        id={id}
        data-autofocus
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Search by name or SKU…"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-9 w-full rounded-md border bg-background pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-3 disabled:opacity-50",
          error
            ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
            : "border-input focus-visible:border-ring focus-visible:ring-ring/30"
        )}
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}

      {open &&
        popStyle &&
        createPortal(
          <div
            style={popStyle}
            className="fixed z-[80] flex flex-col overflow-hidden rounded-lg border bg-card shadow-xl ring-1 ring-black/5"
            // keep focus in the input while the user clicks inside the list
            onMouseDown={(e) => e.preventDefault()}
          >
            <p className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
              {failed
                ? "Could not search. Check your connection."
                : query.trim()
                  ? `${total} match${total === 1 ? "" : "es"} for “${query.trim()}”`
                  : `Type to search ${total} component${total === 1 ? "" : "s"}`}
            </p>

            <ul id={listId} role="listbox" aria-label="Components" className="min-h-0 flex-1 overflow-y-auto py-1">
              {!loading && !failed && rows.length === 0 && (
                <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
                  No component matches. You can create it below.
                </li>
              )}
              {options.map((o, i) => {
                const isActive = i === active
                const common = {
                  id: `${listId}-${i}`,
                  role: "option",
                  "aria-selected": isActive,
                  onMouseEnter: () => setActive(i),
                  onClick: () => choose(i),
                }
                if (o.kind === "create") {
                  return (
                    <li
                      key="create"
                      {...common}
                      className={cn(
                        "mt-1 flex cursor-pointer items-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-primary",
                        isActive && "bg-accent"
                      )}
                    >
                      <Plus className="size-4 shrink-0" />
                      <span className="truncate">
                        {query.trim() ? <>Create new component “{query.trim()}”</> : "Create a new component"}
                      </span>
                    </li>
                  )
                }
                const c = o.row
                return (
                  <li
                    key={c.id}
                    {...common}
                    className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm", isActive && "bg-accent")}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium"><Highlight text={c.name} tokens={tokens} /></p>
                      <p className="truncate text-xs text-muted-foreground"><Highlight text={c.sku} tokens={tokens} /></p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {inListIds?.has(c.id) && <p className="font-medium text-primary">In list</p>}
                      <p>{stockHint(c)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>

            {total > rows.length && (
              <p className="shrink-0 border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                Showing {rows.length} of {total}. Keep typing to narrow the list.
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  )
})

export default ComponentCombobox
