import { useCallback, useEffect, useMemo, useState } from "react"
import { Factory, RefreshCw } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import { EmptyState, Notice, OrderStatus, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Input, Label } from "../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

const num = (v) => Number(v || 0)
const date = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-")

function Progress({ done, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">{done} / {total}</span>
        <span className="text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ProductionCard({ item, onUpdate }) {
  const ordered = num(item.ordered_quantity)
  const started = num(item.quantity_to_produce)
  const completed = num(item.quantity_completed)
  const inProduction = Math.max(0, started - completed)

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{item.order_number}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.product_name || "-"}</p>
        </div>
        <OrderStatus status={item.order_status || item.status} />
      </div>

      <div className="mt-4">
        <Progress done={completed} total={ordered} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
        {[['Started', started], ['Completed', completed], ['In production', inProduction]].map(([label, value]) => (
          <div key={label} className="bg-card px-2 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">Started {date(item.started_at)}</p>
        {item.status === "IN_PRODUCTION" && inProduction > 0 ? (
          <Button size="sm" onClick={() => onUpdate(item)}>Update</Button>
        ) : (
          <span className="text-xs text-muted-foreground">{item.status === "COMPLETED" ? "Production complete" : "Waiting"}</span>
        )}
      </div>
    </div>
  )
}

export default function Production() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState("1")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get("/production")
      setItems(Array.isArray(data) ? data : [])
      setError("")
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to load production orders.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => !q || `${item.order_number} ${item.product_name} ${item.status}`.toLowerCase().includes(q))
  }, [items, query])

  const openUpdate = (item) => {
    const remaining = Math.max(0, num(item.quantity_to_produce) - num(item.quantity_completed))
    setSelected(item)
    setQuantity(remaining > 0 ? "1" : "")
    setError("")
  }

  const closeUpdate = () => {
    if (saving) return
    setSelected(null)
    setQuantity("1")
  }

  const submit = async () => {
    if (!selected) return
    const value = Number(quantity)
    const remaining = Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))

    if (!Number.isSafeInteger(value) || value <= 0) return setError("Enter a positive whole number.")
    if (value > remaining) return setError(`You can complete at most ${remaining} product(s).`)

    try {
      setSaving(true)
      setError("")
      await api.post(`/production/${selected.id}/update-progress`, { quantity: value })
      setSelected(null)
      setQuantity("1")
      await load()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to update production.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Production" description="Track production runs and record completed units.">
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw /> Refresh</Button>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
          <SearchBar value={query} onChange={setQuery} placeholder="Search order, product or status..." />
        </div>

        {loading ? <TableSkeleton rows={7} /> : rows.length === 0 ? (
          <EmptyState icon={Factory} title={query ? "No matching production runs" : "No production runs yet"}>
            Start production from the Orders page to see it here.
          </EmptyState>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const ordered = num(item.ordered_quantity)
                    const started = num(item.quantity_to_produce)
                    const completed = num(item.quantity_completed)
                    const inProduction = Math.max(0, started - completed)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-48 font-medium tabular-nums">{item.order_number}</TableCell>
                        <TableCell>{item.product_name || "-"}</TableCell>
                        <TableCell className="min-w-52"><Progress done={completed} total={ordered} /><p className="mt-1 text-xs text-muted-foreground">{inProduction} currently in production</p></TableCell>
                        <TableCell><OrderStatus status={item.order_status || item.status} /></TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{date(item.started_at)}</TableCell>
                        <TableCell className="text-right">
                          {item.status === "IN_PRODUCTION" && inProduction > 0 ? <Button size="sm" onClick={() => openUpdate(item)}>Update production</Button> : <span className="text-sm text-muted-foreground">{item.status === "COMPLETED" ? "Completed" : "Waiting"}</span>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 p-3 md:hidden">
              {rows.map((item) => <ProductionCard key={item.id} item={item} onUpdate={openUpdate} />)}
            </div>
          </>
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onMouseDown={(e) => e.target === e.currentTarget && closeUpdate()}>
          <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl">
            <div className="border-b px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production update</p>
              <h2 className="mt-1 text-lg font-semibold">{selected.order_number}</h2>
              <p className="text-sm text-muted-foreground">{selected.product_name || "-"}</p>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Ordered', num(selected.ordered_quantity)], ['Started', num(selected.quantity_to_produce)], ['Completed', num(selected.quantity_completed)], ['Remaining', Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <Label htmlFor="production-quantity">Units completed in this update</Label>
                <div className="flex gap-2">
                  <Input id="production-quantity" type="text" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
                  <Button variant="outline" onClick={() => setQuantity(String(Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))))}>Max</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Maximum: {Math.max(0, num(selected.quantity_to_produce) - num(selected.quantity_completed))}</p>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={closeUpdate} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save production"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
