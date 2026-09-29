import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, Pencil, Plus, SearchX, Users, X } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input, Label } from "../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

const EMPTY = { name: "", email: "", phone: "", department: "", designation: "", joinedOn: "", isActive: true }

const formatDate = (v) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-")

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState(null)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState(null) // null | "new" | employee id
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = () =>
    api
      .get("/employees")
      .then((r) => { setEmployees(r.data); setError("") })
      .catch((err) => { console.error(err); setError("Could not load employees. Check that the server is running.") })
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) => `${e.name} ${e.employee_code} ${e.department || ""} ${e.designation || ""}`.toLowerCase().includes(q))
  }, [employees, query])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const openNew = () => { setForm(EMPTY); setEditing("new"); setMessage(null) }
  const openEdit = (e) => {
    setForm({ name: e.name, email: e.email || "", phone: e.phone || "", department: e.department || "", designation: e.designation || "", joinedOn: e.joined_on || "", isActive: !!e.is_active })
    setEditing(e.id)
    setMessage(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      if (editing === "new") await api.post("/employees", form)
      else await api.put(`/employees/${editing}`, form)
      setMessage({ tone: "success", text: editing === "new" ? "Employee added" : "Employee updated" })
      setEditing(null)
      await load()
    } catch (err) {
      console.error(err)
      setMessage({ tone: "error", text: err.response?.data?.message || "Failed to save employee" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Employees" description="People who appear on the attendance sheet.">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchBar value={query} onChange={setQuery} placeholder="Search employees" />
          <Button size="lg" onClick={openNew}><Plus /> Add employee</Button>
        </div>
      </PageHeader>

      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}
      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <AnimatePresence initial={false}>
        {editing !== null && (
          <motion.div key="form" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="mb-4 overflow-hidden">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{editing === "new" ? "New employee" : "Edit employee"}</CardTitle>
                  <CardDescription>The employee code is generated automatically.</CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Close form" onClick={() => setEditing(null)}><X /></Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div><Label htmlFor="name">Full name *</Label><Input id="name" value={form.name} onChange={set("name")} required /></div>
                    <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={form.email} onChange={set("email")} /></div>
                    <div><Label htmlFor="phone">Phone</Label><Input id="phone" value={form.phone} onChange={set("phone")} /></div>
                    <div><Label htmlFor="department">Department</Label><Input id="department" value={form.department} onChange={set("department")} /></div>
                    <div><Label htmlFor="designation">Designation</Label><Input id="designation" value={form.designation} onChange={set("designation")} /></div>
                    <div><Label htmlFor="joinedOn">Joined on</Label><Input id="joinedOn" type="date" value={form.joinedOn} onChange={set("joinedOn")} /></div>
                  </div>
                  {editing !== "new" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-primary" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      Active (inactive employees are hidden from the attendance sheet)
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" size="lg" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "Saving" : "Save employee"}</Button>
                    <Button type="button" variant="outline" size="lg" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={query ? SearchX : Users} title={query ? "No matching employees" : "No employees yet"}>
            {query ? "Try a different name, code or department." : "Add your first employee to start marking attendance."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden sm:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Designation</TableHead>
                <TableHead className="hidden lg:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">{e.employee_code}</TableCell>
                  <TableCell>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.email || "-"}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{e.department || "-"}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.designation || "-"}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(e.joined_on)}</TableCell>
                  <TableCell><Badge variant={e.is_active ? "success" : "neutral"}>{e.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(e)}><Pencil /> Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}
