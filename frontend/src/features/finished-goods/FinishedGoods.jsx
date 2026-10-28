import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useUrlState } from "@/lib/useUrlState"
import { Check, CircleCheck, FileText, PackageCheck, Receipt, RefreshCw, Truck, Warehouse } from "lucide-react"
import { finishedGoodsService } from "@/features/finished-goods/finishedGoodsService"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { FG_STEPS, fgBadge, fgIndexOf, fgStepDone, fgStepFor, myFgStep } from "@/features/finished-goods/fgFlow"
import { errorMessage } from "@/lib/stock"
import { HeroButton, MktHero, SearchField, StageTile, TileGrid } from "@/features/marketing-orders/mktKit"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Modal } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetCustomersQuery, useSaveCustomerMutation } from "./customersApi"
import { cn } from "@/lib/utils"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// the tiles of the four steps (Saturday's colours: amber to do, blue in progress, emerald done)
const STEP_ICON = { HANDED_OVER: Truck, IN_STORE: Warehouse, BILLED: Receipt, DELIVERED: CircleCheck }
const TILE_TONE = {
  HANDED_OVER: { dot: "bg-amber-500", s: { grad: "from-amber-700 to-orange-800", glow: "shadow-amber-500/20" } },
  IN_STORE: { dot: "bg-sky-500", s: { grad: "from-sky-600 to-blue-800", glow: "shadow-sky-500/20" } },
  BILLED: { dot: "bg-indigo-500", s: { grad: "from-blue-600 to-indigo-800", glow: "shadow-blue-500/20" } },
  DELIVERED: { dot: "bg-emerald-500", s: { grad: "from-emerald-700 to-teal-800", glow: "shadow-emerald-500/20" } },
}
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/* who did the latest step of this order, and when ("Last action by") */
const lastAction = (item) => {
  for (let i = fgIndexOf(item.status); i >= 0; i--) {
    const done = fgStepDone(item, FG_STEPS[i].status)
    if (done.by) return { name: done.by, sub: `${FG_STEPS[i].label} · ${when(done.at)}` }
  }
  return null
}

/* the status pill and, under it, what happens next and who does it */
function NextStep({ item, role }) {
  const step = fgStepFor(item)
  const mine = myFgStep(item, role)
  return (
    <div className="min-w-0 space-y-1">
      <Badge variant={fgBadge(item.status).variant}>{fgBadge(item.status).label}</Badge>
      <p className={cn("text-xs leading-snug", mine ? "font-semibold text-amber-800" : "text-muted-foreground")}>
        {step?.owner ? (mine ? `Your turn: ${step.todo}` : `Next: ${step.ownerLabel}`) : step?.todo}
      </p>
    </div>
  )
}

/* the buttons of one order: view its bill, and the step that is this role's turn */
function Actions({ item, role, onAct, onBill }) {
  const mine = myFgStep(item, role)
  if (!item.bill && !mine) return <span className="text-xs text-muted-foreground">No action</span>
  return (
    <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
      {item.bill && <Button size="sm" variant="outline" onClick={() => onBill(item)}><FileText /> Bill</Button>}
      {mine && <Button size="sm" onClick={() => (mine.action === "pay" ? onBill(item) : onAct(item, mine))}><Check /> {mine.button}</Button>}
    </div>
  )
}

const unitsOf = (item) => item.lines.reduce((s, l) => s + Number(l.quantity || 0), 0)

/* phones and tablets: one card per order */
function ItemCard({ item, role, onAct, onBill }) {
  const last = lastAction(item)
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/order-tracker?order=${item.orderId}`} className="font-semibold tabular-nums hover:text-primary hover:underline">{item.orderNumber}</Link>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.lines.map((l) => `${l.name} × ${l.quantity}`).join(", ")}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{unitsOf(item)} pcs</span>
      </div>
      <div className="mt-3"><NextStep item={item} role={role} /></div>
      {last && <p className="mt-2 text-xs text-muted-foreground">Last action: {last.name} · {last.sub}</p>}
      <div className="mt-3 border-t pt-3"><Actions item={item} role={role} onAct={onAct} onBill={onBill} /></div>
    </div>
  )
}

/* confirm one step; giving out can carry a short note (vehicle number, who takes it ...) */
function StepDialog({ item, step, onClose, onDone }) {
  const toast = useToast()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const withNote = step?.action === "dispatch"
  const stockText = step?.action === "receive" ? "Product stock goes UP by these quantities." : step?.action === "dispatch" ? "Product stock goes DOWN by these quantities and the order is complete." : null

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
          <Field label="Vehicle / transport details (optional)" htmlFor="fg-note">
            <TextInput id="fg-note" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Truck MH12 AB 1234, driver Ramesh" />
          </Field>
        )}
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

/*
  Marketing's bill: customer + a rate for every product. The rate starts from the price list (Super Admin); a lower
  rate is a discount and needs a reason. Each product has its own GST %, and the totals are worked out live.
*/
function BillDialog({ item, onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ customer_name: "", customer_address: "", customer_gstin: "", notes: "" })
  const [customerId, setCustomerId] = useState("")
  const [saveNew, setSaveNew] = useState(true)
  const { data: customers = [] } = useGetCustomersQuery()
  const [saveCustomer] = useSaveCustomerMutation()
  const [rates, setRates] = useState(() => Object.fromEntries((item?.lines || []).map((l) => [l.productId, l.listPrice ?? ""])))
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const pickCustomer = (id) => {
    setCustomerId(id)
    const c = customers.find((x) => String(x.id) === id)
    setForm((f) => ({ ...f, customer_name: c?.name || "", customer_address: c?.address || "", customer_gstin: c?.gstin || "" }))
  }

  const rows = (item?.lines || []).map((l) => {
    const rate = Number(rates[l.productId]) || 0
    const amount = rate * l.quantity
    const discount = l.listPrice !== null && rates[l.productId] !== "" && rate < l.listPrice
    return { ...l, rate, amount, gst: (amount * l.gstPercent) / 100, discount }
  })
  const subtotal = rows.reduce((sum, r) => sum + r.amount, 0)
  const gst = rows.reduce((sum, r) => sum + r.gst, 0)
  const ready = form.customer_name.trim()
    && rows.every((r) => rates[r.productId] !== undefined && rates[r.productId] !== "")
    && rows.every((r) => !r.discount || String(notes[r.productId] || "").trim().length >= 3)

  const submit = async (e) => {
    e.preventDefault()
    try {
      setBusy(true)
      setError("")
      // a new customer is saved first (when ticked), so the next bill can just pick it
      let id = customerId ? Number(customerId) : null
      if (!id && saveNew) {
        id = (await saveCustomer({ name: form.customer_name, address: form.customer_address, gstin: form.customer_gstin }).unwrap()).id
      }
      const { data } = await finishedGoodsService.createBill(item.id, {
        ...form, customer_id: id,
        items: rows.map((r) => ({ product_id: r.productId, rate: rates[r.productId], note: notes[r.productId] || "" })),
      })
      toast.success(`Bill ${data.billNumber} made. Store has been told to give out the goods.`)
      onDone()
    } catch (err) {
      setError(errorMessage(err, "Could not make the bill."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} busy={busy} size="lg" title="Make bill" description={item?.orderNumber} onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy || !ready}>{busy ? "Saving..." : "Make bill"}</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Saved customer" htmlFor="bill-saved" className="sm:col-span-2" hint={customers.length ? undefined : "No customer saved yet: type the details below."}>
            <select id="bill-saved" className="h-9 w-full rounded-[8px] border border-cf-line-strong bg-card px-3 text-[13px]" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">New customer (type below)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` · ${c.gstin}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Customer name" htmlFor="bill-customer" required><TextInput id="bill-customer" value={form.customer_name} maxLength={150} onChange={set("customer_name")} disabled={!!customerId} /></Field>
          <Field label="Customer GSTIN" htmlFor="bill-gstin"><TextInput id="bill-gstin" value={form.customer_gstin} maxLength={20} onChange={set("customer_gstin")} /></Field>
          <Field label="Delivery address" htmlFor="bill-address" className="sm:col-span-2"><TextInput id="bill-address" value={form.customer_address} maxLength={500} onChange={set("customer_address")} /></Field>
          {!customerId && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} /> Save this customer for the next bill
            </label>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_3.5rem_7rem_4rem_6.5rem] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Product</span><span className="text-right">Qty</span><span className="text-right">Rate (₹)</span><span className="text-right">GST</span><span className="text-right">Amount</span></div>
          {rows.map((r) => (
            <div key={r.productId} className="border-t px-3 py-2">
              <div className="grid grid-cols-[1fr_3.5rem_7rem_4rem_6.5rem] items-center gap-2">
                <span className="min-w-0 break-words">{r.name}<span className="block text-xs text-muted-foreground">{r.listPrice === null ? "No price in the list yet" : `List price ${rupees(r.listPrice)}`}</span></span>
                <span className="text-right tabular-nums">{r.quantity}</span>
                <TextInput aria-label={`Rate for ${r.name}`} type="number" min="0" step="0.01" className="text-right" value={rates[r.productId] ?? ""} onChange={(e) => setRates((x) => ({ ...x, [r.productId]: e.target.value }))} />
                <span className="text-right tabular-nums text-muted-foreground">{r.gstPercent}%</span>
                <span className="text-right tabular-nums">{rupees(r.amount)}</span>
              </div>
              {r.discount && (
                <TextInput aria-label={`Reason for the discount on ${r.name}`} className="mt-2" maxLength={255} value={notes[r.productId] || ""}
                  onChange={(e) => setNotes((x) => ({ ...x, [r.productId]: e.target.value }))} placeholder={`Below the list price: why? (e.g. bulk order, old customer)`} />
              )}
            </div>
          ))}
        </div>

        <dl className="ml-auto max-w-xs space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-right tabular-nums">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd>{rupees(gst)}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{rupees(subtotal + gst)}</dd></div>
        </dl>
        <Field label="Notes (optional)" htmlFor="bill-notes"><TextInput id="bill-notes" value={form.notes} maxLength={500} onChange={set("notes")} /></Field>
        {error && <p role="alert" className="rounded-lg bg-cf-red-soft px-3 py-2 text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const METHODS = [["UPI", "UPI"], ["BANK", "Bank transfer"], ["CASH", "Cash"], ["CHEQUE", "Cheque"], ["OTHER", "Other"]]
const PAY_BADGE = { PAID: ["success", "Paid"], PART_PAID: ["warning", "Part paid"], UNPAID: ["danger", "Not paid"] }

/* One small form inside the bill: record a payment, or (Super Admin) cancel the bill */
function BillAction({ kind, bill, finishedGoodsId, onDone, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ amount: kind === "payment" ? String(bill.due) : "", paid_on: today(), method: "UPI", reference: "", reason: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const submit = async () => {
    try {
      setBusy(true)
      setError("")
      if (kind === "payment") await finishedGoodsService.addPayment(finishedGoodsId, form)
      if (kind === "cancel") await finishedGoodsService.cancelBill(finishedGoodsId, { reason: form.reason })
      toast.success(kind === "payment" ? "Payment recorded" : "Bill cancelled. Marketing can bill the order again.")
      onDone()
    } catch (err) {
      setError(errorMessage(err, "Could not save."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
      <p className="font-semibold">{kind === "payment" ? "Record a payment" : "Cancel this bill"}</p>
      {kind !== "cancel" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="ba-amount" required><TextInput id="ba-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={set("amount")} /></Field>
          {kind === "payment" && <Field label="Received on" htmlFor="ba-date" required><TextInput id="ba-date" type="date" value={form.paid_on} onChange={set("paid_on")} /></Field>}
          {kind === "payment" && (
            <Field label="How" htmlFor="ba-method" required>
              <select id="ba-method" className="h-9 w-full rounded-[8px] border bg-card px-3 text-[13px]" value={form.method} onChange={set("method")}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          {kind === "payment" && <Field label="Reference (optional)" htmlFor="ba-ref"><TextInput id="ba-ref" maxLength={100} value={form.reference} onChange={set("reference")} placeholder="UTR / cheque no." /></Field>}
        </div>
      )}
      {kind !== "payment" && (
        <Field label="Reason" htmlFor="ba-reason" required>
          <TextInput id="ba-reason" maxLength={255} value={form.reason} onChange={set("reason")} placeholder="e.g. wrong customer on the bill" />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Back</Button>
        <Button type="button" variant={kind === "cancel" ? "destructive" : "default"} onClick={submit} disabled={busy}>{busy ? "Saving..." : kind === "payment" ? "Save payment" : "Yes, cancel bill"}</Button>
      </div>
    </div>
  )
}

export function BillView({ item, role, onClose, onChanged }) {
  const [bill, setBill] = useState(null)
  const [error, setError] = useState("")
  const [action, setAction] = useState(null) // "payment" | "cancel"
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!item) return undefined
    let live = true
    finishedGoodsService.getBill(item.id)
      .then((r) => live && setBill(r.data))
      .catch((err) => live && setError(err.response?.data?.message || "Could not load the bill."))
    return () => { live = false; setBill(null); setError(""); setAction(null) }
  }, [item, version])
  const admin = role === "SUPER_ADMIN"
  const canPay = (admin || role === "MARKETING_MANAGER") && bill?.due > 0
  const canCancel = admin && bill?.goodsStatus === "BILLED" && bill?.paid === 0
  const done = () => { setAction(null); setVersion((v) => v + 1); onChanged() }

  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={bill ? `Bill ${bill.billNumber}` : "Bill"} description={item?.orderNumber}
      footer={<><Button type="button" variant="outline" size="lg" onClick={() => window.print()} disabled={!bill}>Print</Button><Button type="button" size="lg" onClick={onClose}>Close</Button></>}>
      {error ? <p className="text-destructive">{error}</p> : !bill ? <TableSkeleton rows={3} /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{bill.customerName}</p>
              {bill.customerAddress && <p className="text-muted-foreground">{bill.customerAddress}</p>}
              {bill.customerGstin && <p className="text-muted-foreground">GSTIN {bill.customerGstin}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Made by {bill.createdByName} · {when(bill.createdAt)}</p>
            </div>
            <Badge variant={PAY_BADGE[bill.paymentStatus][0]}>{PAY_BADGE[bill.paymentStatus][1]}</Badge>
          </div>
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">GST</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody className="divide-y border-y">{bill.items.map((i) => (
              <tr key={i.productId}>
                <td className="py-1.5">{i.name}{i.priceNote && <span className="block text-xs text-muted-foreground">Discount: {i.priceNote} (list {rupees(i.listPrice)})</span>}</td>
                <td className="text-right tabular-nums">{i.quantity}</td><td className="text-right tabular-nums">{rupees(i.rate)}</td>
                <td className="text-right tabular-nums">{i.gstPercent}%</td><td className="text-right tabular-nums">{rupees(i.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
          <dl className="ml-auto max-w-xs space-y-1 tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(bill.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd>{rupees(bill.gstAmount)}</dd></div>
            <div className="flex justify-between font-bold"><dt>Total</dt><dd>{rupees(bill.total)}</dd></div>
            <div className="flex justify-between text-success"><dt>Received</dt><dd>{rupees(bill.paid)}</dd></div>
            <div className={cn("flex justify-between text-base font-bold", bill.due > 0 && "text-destructive")}><dt>Still to collect</dt><dd>{rupees(bill.due)}</dd></div>
          </dl>

          {(bill.payments.length > 0 || bill.cancelledBills.length > 0) && (
            <ul className="space-y-1 rounded-xl border p-3 text-xs">
              {bill.payments.map((x) => <li key={`p${x.id}`}><b className="text-success">+ {rupees(x.amount)}</b> {x.method}{x.reference ? ` (${x.reference})` : ""} on {x.paidOn} · {x.byName}</li>)}
              {bill.cancelledBills.map((x) => <li key={x.number} className="text-muted-foreground">Earlier bill {x.number} ({rupees(x.total)}) cancelled: {x.reason} · {x.byName}</li>)}
            </ul>
          )}
          {bill.notes && <p className="text-muted-foreground">{bill.notes}</p>}

          {action ? (
            <BillAction kind={action} bill={bill} finishedGoodsId={item.id} onDone={done} onClose={() => setAction(null)} />
          ) : (canPay || canCancel) && (
            <div className="flex flex-wrap justify-end gap-2">
              {canCancel && <Button type="button" variant="outline" onClick={() => setAction("cancel")}>Cancel bill</Button>}
              {canPay && <Button type="button" onClick={() => setAction("payment")}>Record payment</Button>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/*
  Links into this page: ?bill=<finished goods id> opens that bill, ?pay=due shows the bills with money to collect,
  ?q=<text> searches (order, product, bill, customer), ?status=<step> picks a step.
*/
export default function FinishedGoods() {
  const { role } = usePermissions()
  const { params, openPopup, closePopup } = useUrlState()
  const { data: items = [], isLoading: loading, isFetching, error: loadError, refetch } = useGetFinishedGoodsQuery()
  const [query, setQuery] = useState(() => params.get("q") || "")
  const [filter, setFilter] = useState(() => (params.get("pay") === "due" ? "due" : params.get("status") || "mine")) // "mine" | "all" | "due" | a step status
  const [acting, setActing] = useState({ item: null, step: null })
  const [billFor, setBillFor] = useState(null)
  // the bill open now: from a click, or from ?bill= in the link
  const viewBill = items.find((i) => String(i.id) === params.get("bill")) || null
  const setViewBill = (item) => (item ? openPopup({ bill: item.id }) : closePopup({ bill: null }))
  const error = loadError ? errorMessage(loadError, "Failed to load finished goods.") : ""

  const mine = useMemo(() => items.filter((i) => myFgStep(i, role)), [items, role])
  const activeFilter = filter === "mine" && mine.length === 0 && !loading ? "all" : filter
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (activeFilter === "mine" && !myFgStep(i, role)) return false
      if (activeFilter === "due" && !(i.bill?.due > 0)) return false
      if (!["mine", "all", "due"].includes(activeFilter) && i.status !== activeFilter) return false
      return !q || `${i.orderNumber} ${i.lines.map((l) => `${l.name} ${l.sku}`).join(" ")} ${i.bill?.billNumber || ""} ${i.bill?.customerName || ""}`.toLowerCase().includes(q)
    })
  }, [items, query, activeFilter, role])

  const act = (item, step) => setActing({ item, step })
  const done = () => { setActing({ item: null, step: null }); refetch() }

  // one tile per step, like the Saturday page; "All" first
  const tiles = [
    { key: "all", label: "All", hint: "Every order after QC", icon: PackageCheck, dot: "bg-slate-400", s: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/20" } },
    ...FG_STEPS.map((step) => ({ key: step.status, label: step.label, hint: step.todo.split(".")[0], icon: STEP_ICON[step.status], dot: TILE_TONE[step.status].dot, s: TILE_TONE[step.status].s })),
  ].map((t) => ({
    ...t,
    value: t.key === "all" ? items.length : items.filter((i) => i.status === t.key).length,
    active: t.key === "all" ? activeFilter === "all" || activeFilter === "mine" : activeFilter === t.key,
    onClick: () => setFilter(t.key === "all" || activeFilter === t.key ? "all" : t.key),
  }))
  const onAct = (i, s) => (s.action === "bill" ? setBillFor(i) : act(i, s))

  return (
    <>
      <MktHero eyebrow="Quality & release" title="Finished Goods" description="Orders that passed Quality Control: Store receives them, Marketing bills them, and Store gives them out once the bill is paid.">
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh finished goods">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <TileGrid className="mb-4 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => <StageTile key={t.key} stage={t} value={t.value} loading={loading} active={t.active} onClick={t.onClick} />)}
      </TileGrid>

      <Card className="min-w-0 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-5">
          <SearchField className="w-full min-w-0 sm:w-72" value={query} onChange={setQuery} placeholder="Search order, product, bill..." />
          {activeFilter === "due" && (
            <button type="button" onClick={() => setFilter("all")} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Money to collect ×</button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">Showing {rows.length} of {items.length}</span>
        </div>
        {loading ? <div className="p-3"><TableSkeleton rows={4} /></div> : rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title={items.length ? "No matching finished goods" : "No finished goods yet"}>
            {items.length ? "Pick another tile above or clear the search." : "An order appears here when every product of it passes Quality Control."}
          </EmptyState>
        ) : (
          <>
            <div className="grid min-w-0 gap-3 p-3 md:hidden">
              {rows.map((item) => <ItemCard key={item.id} item={item} role={role} onAct={onAct} onBill={setViewBill} />)}
            </div>
            <div className="hidden md:block">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[16%] whitespace-normal">Order</TableHead>
                    <TableHead className="w-[24%] whitespace-normal">Product / SKU</TableHead>
                    <TableHead className="w-[9%] whitespace-normal">Quantity</TableHead>
                    <TableHead className="w-[21%] whitespace-normal">Status / Next step</TableHead>
                    <TableHead className="w-[15%] whitespace-normal">Last action by</TableHead>
                    <TableHead className="w-[15%] whitespace-normal text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const last = lastAction(item)
                    return (
                      <TableRow key={item.id} className={cn(myFgStep(item, role) && "bg-amber-50/50")}>
                        <TableCell className="min-w-0 whitespace-normal align-top">
                          <Link to={`/order-tracker?order=${item.orderId}`} className="font-semibold tabular-nums hover:text-primary hover:underline">{item.orderNumber}</Link>
                          {item.bill && <p className="text-xs text-muted-foreground">{item.bill.customerName}</p>}
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal align-top">
                          {item.lines.map((l) => (
                            <p key={l.productId} className="leading-snug"><span className="font-medium">{l.name}</span>{l.sku && <span className="block text-xs text-muted-foreground">{l.sku}</span>}</p>
                          ))}
                        </TableCell>
                        <TableCell className="align-top font-semibold tabular-nums">{unitsOf(item)}</TableCell>
                        <TableCell className="min-w-0 whitespace-normal align-top">
                          <NextStep item={item} role={role} />
                          {item.bill && (
                            <p className="mt-1 text-xs">{item.bill.due > 0 ? <span className="font-semibold text-destructive">{rupees(item.bill.due)} to collect</span> : <span className="font-semibold text-success">Paid</span>}</p>
                          )}
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal align-top">
                          {last ? <><p className="text-sm font-medium">{last.name}</p><p className="text-xs text-muted-foreground">{last.sub}</p></> : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal align-top text-right">
                          <Actions item={item} role={role} onAct={onAct} onBill={setViewBill} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {acting.item && <StepDialog item={acting.item} step={acting.step} onClose={() => setActing({ item: null, step: null })} onDone={done} />}
      {billFor && <BillDialog item={billFor} onClose={() => setBillFor(null)} onDone={() => { setBillFor(null); refetch() }} />}
      <BillView item={viewBill} role={role} onClose={() => setViewBill(null)} onChanged={refetch} />
    </>
  )
}
