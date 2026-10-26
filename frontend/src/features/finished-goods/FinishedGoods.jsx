import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useUrlState } from "@/lib/useUrlState"
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
import { useGetCustomersQuery, useSaveCustomerMutation } from "./customersApi"
import { cn } from "@/lib/utils"

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (at) => (at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/* the 4 steps as a line of dots: done (green), current (amber), still to come (grey) */
function StepLine({ item }) {
  const current = fgIndexOf(item.status)
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Steps after Quality Control">
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
          <Link to={`/order-tracker?order=${item.orderId}`} className="font-semibold tabular-nums hover:text-primary hover:underline">{item.orderNumber}</Link>
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
          {item.bill && <button type="button" onClick={() => onBill(item)} className="text-left hover:underline">Bill <span className="font-semibold text-foreground">{item.bill.billNumber}</span> · {item.bill.customerName} · {rupees(item.bill.net)}
            {item.bill.due > 0 ? <span className="ml-1 font-semibold text-destructive">· {rupees(item.bill.due)} to collect</span> : <span className="ml-1 font-semibold text-success">· paid</span>}</button>}
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

/* One small form inside the bill: record a payment, or (Super Admin) cancel the bill / make a credit note */
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
      if (kind === "credit") await finishedGoodsService.creditNote(finishedGoodsId, { amount: form.amount, reason: form.reason })
      if (kind === "cancel") await finishedGoodsService.cancelBill(finishedGoodsId, { reason: form.reason })
      toast.success(kind === "payment" ? "Payment recorded" : kind === "credit" ? "Credit note made" : "Bill cancelled. Marketing can bill the order again.")
      onDone()
    } catch (err) {
      setError(errorMessage(err, "Could not save."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
      <p className="font-semibold">{kind === "payment" ? "Record a payment" : kind === "credit" ? "Credit note (bill reduced after the goods left)" : "Cancel this bill"}</p>
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
          <TextInput id="ba-reason" maxLength={255} value={form.reason} onChange={set("reason")} placeholder={kind === "cancel" ? "e.g. wrong customer on the bill" : "e.g. 2 pieces returned damaged"} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Back</Button>
        <Button type="button" variant={kind === "cancel" ? "destructive" : "default"} onClick={submit} disabled={busy}>{busy ? "Saving..." : kind === "payment" ? "Save payment" : kind === "credit" ? "Make credit note" : "Yes, cancel bill"}</Button>
      </div>
    </div>
  )
}

export function BillView({ item, role, onClose, onChanged }) {
  const [bill, setBill] = useState(null)
  const [error, setError] = useState("")
  const [action, setAction] = useState(null) // "payment" | "credit" | "cancel"
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
  const canPay = (admin || role === "PRODUCTION_ADMIN" || role === "MARKETING_MANAGER") && bill?.due > 0
  const canCancel = admin && bill?.goodsStatus === "BILLED" && bill?.paid === 0
  const canCredit = admin && bill && bill.goodsStatus !== "BILLED" && bill.net > 0
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
            {bill.credited > 0 && <div className="flex justify-between text-warning"><dt>Credit notes</dt><dd>− {rupees(bill.credited)}</dd></div>}
            <div className="flex justify-between text-success"><dt>Received</dt><dd>{rupees(bill.paid)}</dd></div>
            <div className={cn("flex justify-between text-base font-bold", bill.due > 0 && "text-destructive")}><dt>Still to collect</dt><dd>{rupees(bill.due)}</dd></div>
            {bill.refund > 0 && <div className="flex justify-between font-semibold text-warning"><dt>To refund</dt><dd>{rupees(bill.refund)}</dd></div>}
          </dl>

          {(bill.payments.length > 0 || bill.creditNotes.length > 0 || bill.cancelledBills.length > 0) && (
            <ul className="space-y-1 rounded-xl border p-3 text-xs">
              {bill.payments.map((x) => <li key={`p${x.id}`}><b className="text-success">+ {rupees(x.amount)}</b> {x.method}{x.reference ? ` (${x.reference})` : ""} on {x.paidOn} · {x.byName}</li>)}
              {bill.creditNotes.map((x) => <li key={`c${x.id}`}><b className="text-warning">{x.number}: − {rupees(x.amount)}</b> {x.reason} · {x.byName}</li>)}
              {bill.cancelledBills.map((x) => <li key={x.number} className="text-muted-foreground">Earlier bill {x.number} ({rupees(x.total)}) cancelled: {x.reason} · {x.byName}</li>)}
            </ul>
          )}
          {bill.notes && <p className="text-muted-foreground">{bill.notes}</p>}

          {action ? (
            <BillAction kind={action} bill={bill} finishedGoodsId={item.id} onDone={done} onClose={() => setAction(null)} />
          ) : (canPay || canCancel || canCredit) && (
            <div className="flex flex-wrap justify-end gap-2">
              {canCancel && <Button type="button" variant="outline" onClick={() => setAction("cancel")}>Cancel bill</Button>}
              {canCredit && <Button type="button" variant="outline" onClick={() => setAction("credit")}>Credit note</Button>}
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

  const chip = (key, label, count) => (
    <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={activeFilter === key}
      className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        activeFilter === key ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-slate-50")}>
      {label}<span className="tabular-nums opacity-80">{count}</span>
    </button>
  )

  return (
    <>
      <MktHero eyebrow="After Quality Control" title="Finished Goods" description="QC passes (packed, sent to Store) → Store receives → Marketing makes the bill → Store gives it out. Done.">
        <HeroButton variant="glass" onClick={refetch} disabled={isFetching} aria-label="Refresh finished goods">
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="min-w-0 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50/70 px-3 py-3 sm:px-5">
          {chip("mine", "Waiting for me", mine.length)}
          {chip("all", "All", items.length)}
          {chip("due", "Money to collect", items.filter((i) => i.bill?.due > 0).length)}
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
      <BillView item={viewBill} role={role} onClose={() => setViewBill(null)} onChanged={refetch} />
    </>
  )
}
