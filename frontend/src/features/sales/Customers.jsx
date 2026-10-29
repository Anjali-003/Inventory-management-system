import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Users } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { Modal } from "@/components/Modal"
import { Field, TextInput } from "@/components/FormField"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/toast"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetCustomersQuery, useSaveCustomerMutation, useUpdateCustomerMutation } from "@/features/finished-goods/customersApi"
import { errorMessage } from "@/lib/stock"
import { cn } from "@/lib/utils"

const EMPTY = []
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/* add a customer, or change one's details (name, phone, address, GSTIN) */
function CustomerDialog({ customer, onClose }) {
  const toast = useToast()
  const [save, { isLoading: saving }] = useSaveCustomerMutation()
  const [update, { isLoading: updating }] = useUpdateCustomerMutation()
  const [form, setForm] = useState({ name: customer?.name || "", address: customer?.address || "", gstin: customer?.gstin || "", phone: customer?.phone || "" })
  const [error, setError] = useState("")
  const busy = saving || updating
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    try {
      setError("")
      if (customer.id) await update({ id: customer.id, ...form }).unwrap()
      else await save(form).unwrap()
      toast.success(customer.id ? "Customer updated" : "Customer added")
      onClose()
    } catch (err) {
      setError(errorMessage(err, "Could not save the customer."))
    }
  }
  return (
    <Modal open onClose={onClose} busy={busy} size="sm" title={customer.id ? "Edit customer" : "Add customer"} onSubmit={submit}
      footer={<><Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" size="lg" disabled={busy || form.name.trim().length < 2}>{busy ? "Saving..." : "Save"}</Button></>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="cu-name" required><TextInput id="cu-name" maxLength={150} value={form.name} onChange={set("name")} /></Field>
        <Field label="Phone" htmlFor="cu-phone"><TextInput id="cu-phone" maxLength={20} value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Address" htmlFor="cu-address"><TextInput id="cu-address" maxLength={500} value={form.address} onChange={set("address")} /></Field>
        <Field label="GSTIN" htmlFor="cu-gstin"><TextInput id="cu-gstin" maxLength={20} value={form.gstin} onChange={set("gstin")} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

/* "Last order 60 days ago · usually every 30": shown for every customer with a sent order */
const daysText = (n) => (n === 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`)
function OrderRhythm({ c }) {
  if (!c.orders) return null
  return (
    <span className="block text-xs text-muted-foreground">
      Last order {daysText(c.daysSinceOrder)}{c.usualGapDays ? ` · usually every ${c.usualGapDays} days` : ""}
    </span>
  )
}

/*
  Customers: what each one bought, what it still owes; click to see its bills.
  "Going quiet": a regular customer whose next order is 1.5x its usual gap late (worked out by the server), worth a call.
  Links in: ?q=<name>, ?quiet=1 (only the customers going quiet)
*/
export default function Customers() {
  const { canEdit } = usePermissions()
  const editable = canEdit("customers")
  const [params, setParams] = useSearchParams()
  const quietOnly = params.get("quiet") === "1"
  const setQuietOnly = (on) => setParams((p) => { const next = new URLSearchParams(p); if (on) next.set("quiet", "1"); else next.delete("quiet"); return next }, { replace: true })
  const { data: customers = EMPTY, isLoading, error } = useGetCustomersQuery()
  const [query, setQuery] = useState(() => params.get("q") || "")
  const [editing, setEditing] = useState(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers
      .filter((c) => (!quietOnly || c.goingQuiet) && (!q || `${c.name} ${c.phone || ""}`.toLowerCase().includes(q)))
      // going quiet: the longest silence first; otherwise who owes most
      .sort((a, b) => (quietOnly ? b.daysSinceOrder - a.daysSinceOrder : b.due - a.due || b.bought - a.bought))
  }, [customers, query, quietOnly])
  const quietCount = customers.filter((c) => c.goingQuiet).length
  const totalDue = customers.reduce((sum, c) => sum + c.due, 0)

  return (
    <>
      <PageHeader title="Customers" description={`Who buys from us, how much, and what is still to collect (${rupees(totalDue)} in all). Click a customer for its bills.`}>
        {editable && <Button size="lg" onClick={() => setEditing({})}>Add customer</Button>}
      </PageHeader>
      {error && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(error, "Could not load customers.")}</Notice></div>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          {[[false, "All", customers.length], [true, "Going quiet", quietCount]].map(([on, label, n]) => (
            <button key={label} type="button" aria-pressed={quietOnly === on} onClick={() => setQuietOnly(on)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", quietOnly === on ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-slate-50")}>
              {label} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          ))}
          <div className="w-full sm:ml-auto sm:w-64"><SearchBar value={query} onChange={setQuery} placeholder="Search name or phone..." /></div>
        </div>
        {isLoading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={Users} title={quietOnly && !query.trim() ? "Nobody is going quiet" : customers.length ? "No matching customer" : "No customers yet"}>
            {quietOnly && !query.trim() ? "Every regular customer is ordering at their usual pace." : customers.length ? "Try another search." : "A customer is saved when you make its first bill, or add one here."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Customer</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Bought</TableHead>
              <TableHead className="text-right">To collect</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link to={`/bills?show=all&q=${encodeURIComponent(c.name)}`} className="font-semibold hover:text-primary hover:underline">{c.name}</Link>
                      {c.goingQuiet && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">Going quiet</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.phone || "—"}</span>
                    <OrderRhythm c={c} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.bills}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(c.bought)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", c.due > 0 && "text-destructive")}>
                    {c.due > 0 ? <Link to={`/bills?show=open&q=${encodeURIComponent(c.name)}`} className="hover:underline">{rupees(c.due)}</Link> : rupees(0)}
                  </TableCell>
                  <TableCell className="text-right">{editable && <Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {editing && <CustomerDialog customer={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
