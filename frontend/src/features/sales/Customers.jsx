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

/* add a customer, or change one's details (name, address, phone) */
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

/* Customers: what each one bought, what it still owes; click to see its bills. Link in: ?q=<name> */
export default function Customers() {
  const { canEdit } = usePermissions()
  const editable = canEdit("customers")
  const [params] = useSearchParams()
  const { data: customers = EMPTY, isLoading, error } = useGetCustomersQuery()
  const [query, setQuery] = useState(() => params.get("q") || "")
  const [editing, setEditing] = useState(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter((c) => !q || `${c.name} ${c.phone || ""}`.toLowerCase().includes(q)).sort((a, b) => b.due - a.due || b.bought - a.bought)
  }, [customers, query])
  const totalDue = customers.reduce((sum, c) => sum + c.due, 0)

  return (
    <>
      <PageHeader title="Customers" description={`Who buys from us, how much, and what is still to collect (${rupees(totalDue)} in all). Click a customer for its bills.`}>
        {editable && <Button size="lg" onClick={() => setEditing({})}>Add customer</Button>}
      </PageHeader>
      {error && <div className="mb-4"><Notice title="Something went wrong">{errorMessage(error, "Could not load customers.")}</Notice></div>}
      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 sm:px-5"><SearchBar value={query} onChange={setQuery} placeholder="Search name or phone..." /></div>
        {isLoading ? <TableSkeleton rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={Users} title={customers.length ? "No matching customer" : "No customers yet"}>
            {customers.length ? "Try another search." : "A customer is saved when you make its first bill, or add one here."}
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
                    <Link to={`/bills?show=all&q=${encodeURIComponent(c.name)}`} className="font-semibold hover:text-primary hover:underline">{c.name}</Link>
                    <span className="block text-xs text-muted-foreground">{c.phone || "—"}</span>
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
