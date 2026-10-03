import { useEffect, useState } from "react"
import { History, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import api from "../../api/api"
import Pagination from "../Pagination"
import SearchBar from "../SearchBar"
import { EmptyState, Notice, TableSkeleton } from "../feedback"
import { Badge } from "../ui/badge"
import { TextInput, selectClass } from "../FormField"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { cn } from "../../lib/utils"
import { TYPE_META, errorMessage, fmtDateTime, fmtQty } from "../../lib/stock"

export function TypeBadge({ type }) {
  const m = TYPE_META[type] ?? { label: type, tone: "neutral" }
  return <Badge variant={m.tone}>{m.label}</Badge>
}

/** Signed quantity: +12 (IN) / −12 (OUT); reservations are shown muted because on-hand does not move. */
export function Qty({ row, className }) {
  const n = fmtQty(row.quantity)
  if (row.direction === "IN")
    return <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums text-success", className)}><ArrowDownLeft className="size-3.5" />+{n}</span>
  if (row.direction === "OUT")
    return <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums text-destructive", className)}><ArrowUpRight className="size-3.5" />−{n}</span>
  if (row.direction === "NONE") return <span className={cn("text-muted-foreground", className)}>—</span>
  return <span className={cn("tabular-nums text-muted-foreground", className)}>{n} <span className="text-xs">(no stock move)</span></span>
}

const Reason = ({ row }) => (
  <>
    <span className="block max-w-[28rem] truncate" title={row.reason || ""}>{row.reason || "—"}</span>
    {row.reference_no && <span className="block text-xs text-muted-foreground">Ref: {row.reference_no}</span>}
  </>
)

/* Compact, scrollable list used inside the item detail dialog. */
export function MovementList({ rows }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><TypeBadge type={r.transaction_type} /><Qty row={r} /></div>
            <p className="mt-1 truncate text-sm" title={r.reason || ""}>{r.reason || "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{fmtDateTime(r.created_at)} · {r.user_name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
            <p className="font-semibold tabular-nums">{r.balance_after == null ? "—" : fmtQty(r.balance_after)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

const PAGE = 20
// Consumed and Archived are ledger types (their direction is OUT / NONE), so they filter by type, not direction.
const BY_TYPE = ["CONSUMED", "ARCHIVED"]

export function LedgerPanel({ componentFilter, onClearComponent, refreshToken }) {
  const [q, setQ] = useState("")
  const [dq, setDq] = useState("")
  const [kind, setKind] = useState("") // "" | IN | OUT | RESERVE | CONSUMED | ARCHIVED
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ rows: [], total: 0, total_in: 0, total_out: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(1) }, [kind, from, to, componentFilter?.component_id])

  useEffect(() => {
    let stale = false
    setLoading(true)
    api
      .get("/inventory/ledger", {
        params: {
          page, page_size: PAGE, q: dq || undefined,
          direction: kind && !BY_TYPE.includes(kind) ? kind : undefined,
          type: BY_TYPE.includes(kind) ? kind : undefined,
          from: from || undefined, to: to || undefined, component_id: componentFilter?.component_id || undefined,
        },
      })
      .then((r) => { if (!stale) { setData(r.data); setError("") } })
      .catch((e) => { if (!stale) setError(errorMessage(e, "Could not load the stock ledger.")) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [page, dq, kind, from, to, componentFilter?.component_id, refreshToken])

  const { rows } = data
  const filtered = !!(dq || kind || from || to || componentFilter)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3 sm:px-5">
        <SearchBar value={q} onChange={setQ} placeholder="Search reason, SKU, user…" />
        <select aria-label="Movement" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All movements</option>
          <option value="IN">Stock in</option>
          <option value="OUT">Stock out</option>
          <option value="RESERVE">Reservations</option>
          <option value="CONSUMED">Consumed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <div className="flex items-center gap-2">
          <TextInput type="date" aria-label="From date" className="w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground">–</span>
          <TextInput type="date" aria-label="To date" className="w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {componentFilter && (
          <button type="button" onClick={onClearComponent} className="inline-flex h-9 items-center gap-2 rounded-md border bg-accent px-3 text-sm font-medium text-accent-foreground">
            {componentFilter.component_name} <span aria-hidden>×</span><span className="sr-only">Clear component filter</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-px border-b bg-border text-sm">
        {[["Entries", data.total, ""], ["Total in", `+${fmtQty(data.total_in)}`, "text-success"], ["Total out", `−${fmtQty(data.total_out)}`, "text-destructive"]].map(([l, v, c]) => (
          <div key={l} className="bg-card px-4 py-2.5 sm:px-5">
            <p className="text-xs text-muted-foreground">{l}{filtered ? " (filtered)" : ""}</p>
            <p className={cn("text-lg font-semibold tabular-nums", c)}>{typeof v === "number" ? fmtQty(v) : v}</p>
          </div>
        ))}
      </div>

      {error && <div className="p-4"><Notice title="Something went wrong">{error}</Notice></div>}

      {loading && rows.length === 0 ? (
        <TableSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title={filtered ? "No movements match these filters" : "No stock movements yet"}>
          {filtered ? "Widen the date range or clear a filter." : "Every stock in, out and adjustment will be listed here."}
        </EmptyState>
      ) : (
        <div className={cn("transition-opacity", loading && "opacity-60")}>
          {/* tablet / desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Component</TableHead><TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Balance</TableHead>
                  <TableHead>Reason</TableHead><TableHead className="hidden lg:table-cell">User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{fmtDateTime(r.created_at)}</TableCell>
                    <TableCell><span className="block font-medium">{r.component_name}</span><span className="text-xs text-muted-foreground">{r.sku}</span></TableCell>
                    <TableCell><TypeBadge type={r.transaction_type} /></TableCell>
                    <TableCell className="text-right"><Qty row={r} /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.balance_after == null ? "—" : fmtQty(r.balance_after)}</TableCell>
                    <TableCell><Reason row={r} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{r.user_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* mobile */}
          <ul className="divide-y md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1.5 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-medium">{r.component_name}</p><p className="text-xs text-muted-foreground">{r.sku}</p></div>
                  <Qty row={r} className="shrink-0 text-base" />
                </div>
                <div className="flex flex-wrap items-center gap-2"><TypeBadge type={r.transaction_type} />
                  <span className="text-xs text-muted-foreground">Balance {r.balance_after == null ? "—" : fmtQty(r.balance_after)}</span></div>
                <p className="text-sm"><Reason row={r} /></p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)} · {r.user_name}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} noun="movements" />
    </div>
  )
}
