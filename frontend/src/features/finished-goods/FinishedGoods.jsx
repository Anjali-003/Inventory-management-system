import { useEffect, useMemo, useState } from "react"
import { Check, FileText, PackageCheck, RefreshCw } from "lucide-react"
import { finishedGoodsService } from "@/features/finished-goods/finishedGoodsService"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { FG_STEPS, fgBadge, fgIndexOf, fgStepDone, fgStepOf, myFgStep } from "@/features/finished-goods/fgFlow"
import { errorMessage } from "@/lib/stock"
import { HeroButton, MktHero, SearchField } from "@/features/marketing-orders/mktKit"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Modal } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { cn } from "@/lib/utils"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/* the 7 steps as a line of dots: done (green), current (amber), still to come (grey) */
function StepLine({ item }) {
  const current = fgIndexOf(item.status)
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Steps after Quality Control">
      {FG_STEPS.map((step, i) => {
        const done = i < current || item.status === "DELIVERED"
        const now = i === current && item.status !== "DELIVERED"
        const info = fgStepDone(item, step.status)
        return (
          <li key={step.status} className="min-w-0" title={info.by ? `${step.label}: ${info.by}, ${when(info.at)}` : step.label}>
            <div className={cn("h-1.5 rounded-full", done ? "bg-emerald-500" : now ? "bg-amber-500" : "bg-slate-200")} />
            <p className={cn("mt-1 truncate text-[10px] sm:text-[11px]", now ? "font-bold text-amber-800" : done ? "text-emerald-800" : "text-muted-foreground")}>{step.label}</p>
          </li>
        )
      })}
    </ol>
  )
}

function OrderCard({ item, role, onAct, onBill }) {
  const step = fgStepOf(item.status)
  const mine = myFgStep(item, role)
  return (
    <div className={cn("min-w-0 rounded-2xl border bg-white p-4 shadow-sm", mine && "border-amber-300 ring-1 ring-amber-200")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">{item.orderNumber}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {item.lines.map((l) => <li key={l.productId} className="break-words"><span className="font-medium text-foreground">{l.name}</span> × {l.quantity}</li>)}
          </ul>
        </div>
        <Badge variant={fgBadge(item.status).variant}>{fgBadge(item.status).label}</Badge>
      </div>

      <div className="mt-4"><StepLine item={item} /></div>

      <div className={cn("mt-4 rounded-xl px-3 py-2.5 text-sm", mine ? "bg-amber-50 text-amber-950" : "bg-slate-50 text-slate-700")}>
        {step?.owner
          ? <><span className="font-semibold">{mine ? "Your turn: " : `Waiting for ${step.ownerLabel}: `}</span>{step.todo}</>
          : <span className="font-semibold text-emerald-800">{step?.todo}</span>}
      </div>

      {(item.bill || item.dispatchNote) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.bill && <span>Bill <span className="font-semibold text-foreground">{item.bill.billNumber}</span> · {item.bill.customerName} · {rupees(item.bill.total)}</span>}
          {item.dispatchNote && <span>Delivery: {item.dispatchNote}</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
        {item.bill && <Button size="sm" variant="outline" onClick={() => onBill(item)}><FileText /> View bill</Button>}
        {mine && <Button size="sm" onClick={() => onAct(item, mine)}><Check /> {mine.button}</Button>}
      </div>
    </div>
  )
}

/* confirm one step; dispatch / deliver can carry a short note (vehicle number, who received it ...) */
function StepDialog({ item, step, onClose, onDone }) {
  const toast = useToast()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const withNote = step?.action === "dispatch" || step?.action === "deliver"
  const stockText = step?.action === "receive" ? "Product stock goes UP by these quantities." : step?.action === "dispatch" ? "Product stock goes DOWN by these quantities." : null

  const submit = async (e) => {
    e.preventDefault()
    try {
      setBusy(true)
      setError("")
      await finishedGoodsService.step(item.id, step.action, withNote ? { note } : {})
      toast.success(`${item.orderNumber}: ${step.button.toLowerCase()} done`)
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || "Could not save this step.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} busy={busy} size="sm" title={`${step?.button}?`} description={item?.orderNumber} onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy}>{busy ? "Saving..." : `Yes, ${step?.button.toLowerCase()}`}</Button></>}>
      <div className="space-y-4 text-sm">
        <ul className="divide-y rounded-xl border">
          {item?.lines.map((l) => <li key={l.productId} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 break-words">{l.name}</span><span className="font-semibold tabular-nums">{l.quantity}</span></li>)}
        </ul>
        {stockText && <p className="text-muted-foreground">{stockText}</p>}
        {withNote && (
          <Field label={step.action === "dispatch" ? "Vehicle / transport details (optional)" : "Received by / remarks (optional)"} htmlFor="fg-note">
            <TextInput id="fg-note" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder={step.action === "dispatch" ? "e.g. Truck MH12 AB 1234, driver Ramesh" : "e.g. Received by Mr. Sharma"} />
          </Field>
        )}
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

/* Marketing's bill: customer + a rate for every product; GST and totals are worked out live */
function BillDialog({ item, onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ customer_name: "", customer_address: "", customer_gstin: "", gst_percent: "18", notes: "" })
  const [rates, setRates] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const subtotal = (item?.lines || []).reduce((sum, l) => sum + (Number(rates[l.productId]) || 0) * l.quantity, 0)
  const gst = (subtotal * (Number(form.gst_percent) || 0)) / 100
  const ready = form.customer_name.trim() && item?.lines.every((l) => rates[l.productId] !== undefined && rates[l.productId] !== "")

  const submit = async (e) => {
    e.preventDefault()
    try {
      setBusy(true)
      setError("")
      const { data } = await finishedGoodsService.createBill(item.id, { ...form, items: item.lines.map((l) => ({ product_id: l.productId, rate: rates[l.productId] })) })
      toast.success(`Bill ${data.billNumber} made. Store has been told to give out the goods.`)
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || "Could not make the bill.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} busy={busy} size="lg" title="Make bill" description={item?.orderNumber} onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy || !ready}>{busy ? "Saving..." : "Make bill"}</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="bill-customer" required><TextInput id="bill-customer" value={form.customer_name} maxLength={150} onChange={set("customer_name")} /></Field>
          <Field label="Customer GSTIN" htmlFor="bill-gstin"><TextInput id="bill-gstin" value={form.customer_gstin} maxLength={20} onChange={set("customer_gstin")} /></Field>
          <Field label="Delivery address" htmlFor="bill-address" className="sm:col-span-2"><TextInput id="bill-address" value={form.customer_address} maxLength={500} onChange={set("customer_address")} /></Field>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_4rem_7rem_7rem] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Product</span><span className="text-right">Qty</span><span className="text-right">Rate (₹)</span><span className="text-right">Amount</span></div>
          {item?.lines.map((l) => (
            <div key={l.productId} className="grid grid-cols-[1fr_4rem_7rem_7rem] items-center gap-2 border-t px-3 py-2">
              <span className="min-w-0 break-words">{l.name}</span>
              <span className="text-right tabular-nums">{l.quantity}</span>
              <TextInput aria-label={`Rate for ${l.name}`} type="number" min="0" step="0.01" className="text-right" value={rates[l.productId] ?? ""} onChange={(e) => setRates((r) => ({ ...r, [l.productId]: e.target.value }))} />
              <span className="text-right tabular-nums">{rupees((Number(rates[l.productId]) || 0) * l.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="GST %" htmlFor="bill-gst" required><TextInput id="bill-gst" type="number" min="0" max="100" step="0.01" value={form.gst_percent} onChange={set("gst_percent")} /></Field>
          <dl className="space-y-1 self-end rounded-xl bg-slate-50 px-3 py-2 text-right tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd>{rupees(gst)}</dd></div>
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{rupees(subtotal + gst)}</dd></div>
          </dl>
        </div>
        <Field label="Notes (optional)" htmlFor="bill-notes"><TextInput id="bill-notes" value={form.notes} maxLength={500} onChange={set("notes")} /></Field>
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

function BillView({ item, onClose }) {
  const [bill, setBill] = useState(null)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!item) return undefined
    let live = true
    finishedGoodsService.getBill(item.id)
      .then((r) => live && setBill(r.data))
      .catch((err) => live && setError(err.response?.data?.message || "Could not load the bill."))
    return () => { live = false; setBill(null); setError("") }
  }, [item])
  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={bill ? `Bill ${bill.billNumber}` : "Bill"} description={item?.orderNumber}
      footer={<><Button type="button" variant="outline" size="lg" onClick={() => window.print()} disabled={!bill}>Print</Button><Button type="button" size="lg" onClick={onClose}>Close</Button></>}>
      {error ? <p className="text-destructive">{error}</p> : !bill ? <TableSkeleton rows={3} /> : (
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold">{bill.customerName}</p>
            {bill.customerAddress && <p className="text-muted-foreground">{bill.customerAddress}</p>}
            {bill.customerGstin && <p className="text-muted-foreground">GSTIN {bill.customerGstin}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Made by {bill.createdByName} · {when(bill.createdAt)}</p>
          </div>
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody className="divide-y border-y">{bill.items.map((i) => <tr key={i.productId}><td className="py-1.5">{i.name}</td><td className="text-right tabular-nums">{i.quantity}</td><td className="text-right tabular-nums">{rupees(i.rate)}</td><td className="text-right tabular-nums">{rupees(i.amount)}</td></tr>)}</tbody>
          </table>
          <dl className="ml-auto max-w-xs space-y-1 tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(bill.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">GST {bill.gstPercent}%</dt><dd>{rupees(bill.gstAmount)}</dd></div>
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{rupees(bill.total)}</dd></div>
          </dl>
          {bill.notes && <p className="text-muted-foreground">{bill.notes}</p>}
        </div>
      )}
    </Modal>
  )
}

export default function FinishedGoods() {
  const { role } = usePermissions()
  const { data: items = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetFinishedGoodsQuery()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("mine") // "mine" | "all" | a step status
  const [acting, setActing] = useState({ item: null, step: null })
  const [billFor, setBillFor] = useState(null)
  const [viewBill, setViewBill] = useState(null)
  const error = loadError ? errorMessage(loadError, "Failed to load finished goods.") : ""

  const mine = useMemo(() => items.filter((i) => myFgStep(i, role)), [items, role])
  const activeFilter = filter === "mine" && mine.length === 0 && !loading ? "all" : filter
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (activeFilter === "mine" && !myFgStep(i, role)) return false
      if (activeFilter !== "mine" && activeFilter !== "all" && i.status !== activeFilter) return false
      return !q || `${i.orderNumber} ${i.lines.map((l) => `${l.name} ${l.sku}`).join(" ")} ${i.bill?.billNumber || ""} ${i.bill?.customerName || ""}`.toLowerCase().includes(q)
    })
  }, [items, query, activeFilter, role])

  const act = (item, step) => setActing({ item, step })
  const done = () => { setActing({ item: null, step: null }); refetch() }

  const chip = (key, label, count) => (
    <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={activeFilter === key}
      className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        activeFilter === key ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-slate-50")}>
      {label}<span className="tabular-nums opacity-80">{count}</span>
    </button>
  )

  return (
    <>
      <MktHero eyebrow="After Quality Control" title="Finished Goods" description="Packing → Ops Admin hands over → Store receives → Marketing bills → Store gives out → Marketing confirms delivery.">
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh finished goods">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="min-w-0 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50/70 px-3 py-3 sm:px-5">
          {chip("mine", "Waiting for me", mine.length)}
          {chip("all", "All", items.length)}
          {FG_STEPS.map((s) => chip(s.status, s.label, items.filter((i) => i.status === s.status).length))}
          <SearchField className="w-full min-w-0 sm:ml-auto sm:w-64" value={query} onChange={setQuery} placeholder="Search order, product, bill..." />
        </div>
        {loading ? <div className="p-3"><TableSkeleton rows={4} /></div> : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={items.length ? "Nothing here" : "No finished goods yet"}>
            {items.length ? "Pick another step above or clear the search." : "An order appears here when every product of it passes Quality Control."}
          </EmptyState>
        ) : (
          <div className="grid min-w-0 gap-3 p-3 sm:p-4 lg:grid-cols-2">
            {rows.map((item) => <OrderCard key={item.id} item={item} role={role} onAct={(i, s) => (s.action === "bill" ? setBillFor(i) : act(i, s))} onBill={setViewBill} />)}
          </div>
        )}
      </Card>

      {acting.item && <StepDialog item={acting.item} step={acting.step} onClose={() => setActing({ item: null, step: null })} onDone={done} />}
      {billFor && <BillDialog item={billFor} onClose={() => setBillFor(null)} onDone={() => { setBillFor(null); refetch() }} />}
      <BillView item={viewBill} onClose={() => setViewBill(null)} />
    </>
  )
}
