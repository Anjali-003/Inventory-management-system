import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, ArrowDownToLine, ArrowUpFromLine, Eye, History, Plus, Warehouse } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import StatStrip from "../components/StatStrip"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { useToast } from "../components/toast"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { selectClass } from "../components/FormField"
import { StockBadge, stockState } from "../components/inventory/StockBadge"
import { LedgerPanel } from "../components/inventory/Ledger"
import ItemDetailModal from "../components/inventory/ItemDetailModal"
import { ArchiveDialog, StockOutModal } from "../components/inventory/MovementModals"
import StockInModal from "../components/inventory/StockInModal"
import { cn } from "../lib/utils"
import { errorMessage, fmtQty } from "../lib/stock"

const TOAST = {
  in: "Stock added and recorded in the ledger",
  out: "Stock issued and recorded in the ledger",
  archive: "Item archived. Its history is kept",
}

/* One component as a card (used by the Cards view on tablet / desktop). */
function ItemCard({ item: i, actions }) {
  const hasDetails = !!(i.category || i.size || i.location)
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", i.is_active === 0 && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{i.component_name}</p>
          <p className="text-xs text-muted-foreground">{i.sku} · {i.unit}</p>
        </div>
        <StockBadge item={i} />
      </div>
      {hasDetails && (
        <dl className="grid grid-cols-3 gap-x-3 text-xs">
          {[["Category", i.category], ["Size", i.size], ["Location", i.location]].map(([l, v]) => (
            <div key={l} className="min-w-0">
              <dt className="text-muted-foreground">{l}</dt>
              <dd className="break-words font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
        {[["On hand", i.quantity_on_hand], ["Reserved", i.quantity_reserved], ["Available", i.available]].map(([l, v]) => (
          <div key={l} className="bg-card py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="font-semibold tabular-nums">{fmtQty(v)}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Minimum level {fmtQty(i.minimum_stock_level)} {i.unit}</p>
      <div className="mt-auto border-t pt-2">{actions}</div>
    </div>
  )
}

export default function Inventory() {
  const toast = useToast()
  const [tab, setTab] = useState("stock")
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [view, setView] = useState("active")
  const [filter, setFilter] = useState("all")
  const [cat, setCat] = useState("")
  const [token, setToken] = useState(0) // bumps after every change so ledger/detail refetch
  const [ledgerFor, setLedgerFor] = useState(null)

  const [dlg, setDlg] = useState({ kind: null, item: null })
  const open = (kind, item = null) => setDlg({ kind, item })
  const close = () => setDlg({ kind: null, item: null })

  const load = useCallback(() => {
    return api
      .get("/inventory", { params: { status: view } })
      .then((r) => { setItems(r.data); setError("") })
      .catch((e) => setError(errorMessage(e, "Could not load inventory. Check that the server is running.")))
      .finally(() => setLoading(false))
  }, [view])

  useEffect(() => { setLoading(true); load() }, [load])

  const refresh = () => { setToken((t) => t + 1); return load() }
  const saved = (data, kind) => {
    if (kind === "in" && data?.count) {
      const made = (data.items || []).filter((i) => i.created).length
      toast.success(
        `${data.count} item${data.count === 1 ? "" : "s"} added to stock` +
          (made ? ` (${made} new component${made === 1 ? "" : "s"} created)` : "") +
          " and recorded in the ledger"
      )
    } else toast.success(TOAST[kind])
    close()
    refresh()
  }
  // a 409 means our numbers are stale (someone else moved stock): reload so the user sees the truth
  const conflict = () => refresh()

  const counts = useMemo(() => {
    const c = { all: items.length, low: 0, out: 0 }
    items.forEach((i) => { const s = stockState(i); if (s === "low") c.low++; if (s === "out") c.out++ })
    return c
  }, [items])

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (cat && i.category !== cat) return false
      if (q && !`${i.sku} ${i.component_name} ${i.category || ""} ${i.size || ""} ${i.location || ""}`.toLowerCase().includes(q)) return false
      if (filter === "low") return stockState(i) === "low"
      if (filter === "out") return stockState(i) === "out"
      return true
    })
  }, [items, query, filter, cat])

  const Actions = ({ item }) => {
    const active = item.is_active === 1
    const b = "size-8"
    return (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" className={b} aria-label={`View ${item.component_name}`} onClick={() => open("view", item)}><Eye /></Button>
        <Button variant="ghost" size="icon" className={b} aria-label="Stock in" onClick={() => open("in", item)}><ArrowDownToLine /></Button>
        <Button variant="ghost" size="icon" className={b} aria-label="Stock out" disabled={!active} onClick={() => open("out", item)}><ArrowUpFromLine /></Button>
        <Button variant="ghost" size="icon" className={cn(b, "hover:text-destructive")} aria-label="Archive" disabled={!active} onClick={() => open("archive", item)}><Archive /></Button>
      </div>
    )
  }

  const showLedger = (item) => { setLedgerFor(item); setTab("ledger"); close() }

  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, reserved and available, backed by an append-only movement ledger.">
        <Button size="lg" onClick={() => open("in")}><Plus /> Stock in</Button>
      </PageHeader>

      <div role="tablist" className="mb-4 inline-flex rounded-lg border bg-card p-1 text-sm">
        {[["stock", "Stock", Warehouse], ["ledger", "Stock ledger", History]].map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("inline-flex h-8 items-center gap-2 rounded-md px-3.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" />{l}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        {tab === "ledger" ? (
          <LedgerPanel componentFilter={ledgerFor} onClearComponent={() => setLedgerFor(null)} refreshToken={token} />
        ) : (
          <>
            <StatStrip
              layoutId="inv-filter"
              cols="grid-cols-3"
              items={[
                { key: "all", label: "Components", value: counts.all, tone: "info", active: filter === "all", onClick: () => setFilter("all") },
                { key: "low", label: "Low stock", value: counts.low, tone: "warning", active: filter === "low", onClick: () => setFilter(filter === "low" ? "all" : "low") },
                { key: "out", label: "Out of stock", value: counts.out, tone: "danger", active: filter === "out", onClick: () => setFilter(filter === "out" ? "all" : "out") },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3 border-y px-4 py-3 sm:px-5">
              <SearchBar value={query} onChange={setQuery} placeholder="Search by component, SKU, category, size or location..." />
              <select aria-label="Show" className={selectClass} value={view} onChange={(e) => setView(e.target.value)}>
                <option value="active">Active items</option><option value="archived">Archived</option><option value="all">All</option>
              </select>
              {categories.length > 0 && (
                <select aria-label="Category" className={selectClass} value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            {loading ? (
              <TableSkeleton rows={8} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Warehouse} title={query || filter !== "all" ? "No matching components" : view === "archived" ? "Nothing archived" : "No inventory yet"}>
                {query || filter !== "all" ? "Try a different search or clear the filter." : "Use Stock in to receive your first stock."}
              </EmptyState>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="hidden lg:table-cell">Category / Size</TableHead>
                        <TableHead className="hidden lg:table-cell">Location</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((i) => (
                        <TableRow key={i.id} className={i.is_active === 0 ? "opacity-70" : undefined}>
                          <TableCell className="min-w-[11rem] whitespace-normal">
                            <span className="block font-medium leading-snug">{i.component_name}</span>
                            <span className="block text-xs text-muted-foreground">{i.sku} · {i.unit}</span>
                            {(i.category || i.size || i.location) && (
                              <span className="block text-xs text-muted-foreground lg:hidden">{[i.category, i.size, i.location].filter(Boolean).join(" · ")}</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden whitespace-normal lg:table-cell">
                            <span className="block">{i.category || <span className="text-muted-foreground">—</span>}</span>
                            {i.size && <span className="block text-xs text-muted-foreground">{i.size}</span>}
                          </TableCell>
                          <TableCell className="hidden whitespace-normal text-muted-foreground lg:table-cell">{i.location || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtQty(i.quantity_on_hand)}
                            <span className="block text-xs text-muted-foreground">min {fmtQty(i.minimum_stock_level)}</span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {fmtQty(i.available)}
                            {Number(i.quantity_reserved) > 0 && <span className="block text-xs font-normal text-muted-foreground">{fmtQty(i.quantity_reserved)} reserved</span>}
                          </TableCell>
                          <TableCell><StockBadge item={i} /></TableCell>
                          <TableCell><Actions item={i} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-3 p-3 md:hidden">
                  {rows.map((i) => <ItemCard key={i.id} item={i} actions={<Actions item={i} />} />)}
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <ItemDetailModal
        open={dlg.kind === "view"} itemId={dlg.item?.id} refreshToken={token} onClose={close}
        onIn={(it) => open("in", it)} onOut={(it) => open("out", it)} onLedger={showLedger}
      />
      <StockInModal open={dlg.kind === "in"} preset={dlg.item} onClose={close} onSaved={saved} />
      <StockOutModal open={dlg.kind === "out"} item={dlg.item} onClose={close} onSaved={saved} onConflict={conflict} />
      <ArchiveDialog open={dlg.kind === "archive"} item={dlg.item} onClose={close} onSaved={saved} onConflict={conflict} />
    </>
  )
}
